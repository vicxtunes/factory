-- Vendors: a second kind of business on Aming (see packages/lib/studios/README.md
-- → "Kinds of business").
--
-- A business is a photography studio or a vendor (photo editors and
-- videographers first, and every other kind of event and beauty vendor). The
-- same account may own one of each. A vendor's customer payments pay Aming a
-- 10% fee; a studio's 5%.

-- ── The kind of business ───────────────────────────────────────────────────

alter table tenants
  add column kind text not null default 'studio' check (kind in ('studio', 'vendor')),
  -- What a vendor does ("photo_editor", "videographer", "decor", …): the list
  -- lives in the app (packages/lib/studios/core/kinds.ts), so it grows without
  -- a migration.
  add column vendor_category text check (vendor_category ~ '^[a-z_]{2,40}$'),
  add constraint tenants_vendor_category check ((kind = 'vendor') = (vendor_category is not null));

-- One business of each kind per account (it was one in all).
do $$
declare
  v_name text;
begin
  -- The old one-per-owner rule, found by what it checks (made without a name).
  for v_name in
    select c.conname from pg_constraint c
     where c.conrelid = 'tenants'::regclass and c.contype = 'u'
       and c.conkey = array[(select attnum from pg_attribute where attrelid = 'tenants'::regclass and attname = 'owner_client_id')]
  loop
    execute format('alter table tenants drop constraint %I', v_name);
  end loop;
end;
$$;
create unique index tenants_one_kind_per_owner on tenants (owner_client_id, kind) where owner_client_id is not null;

-- A business's sign-in email may be the same as the owner's other business's.
create or replace function tenants_owner_email_free()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_email_verified_at is null or norm_client_email(new.owner_email) is null then
    return new;
  end if;
  if exists (
    select 1 from clients c
    where c.email_key = norm_client_email(new.owner_email) and c.id is distinct from new.owner_client_id
  ) or exists (
    select 1 from tenants t
    where t.id <> new.id
      and t.owner_client_id is distinct from new.owner_client_id
      and t.owner_email_verified_at is not null
      and norm_client_email(t.owner_email) = norm_client_email(new.owner_email)
  ) then
    raise exception 'EMAIL_IN_USE: another account signs in with this email' using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

-- ── Aming's fee, by kind ───────────────────────────────────────────────────

-- The percent Aming keeps of a business's customer payments.
create or replace function business_fee_percent(p_tenant uuid)
returns int
language sql
stable
as $$
  select case when kind = 'vendor' then 10 else 5 end from tenants where id = p_tenant;
$$;

revoke all on function business_fee_percent(uuid) from public, anon, authenticated;
grant execute on function business_fee_percent(uuid) to service_role;

-- As in 20261025100000, with the fee at the business's kind's rate.
create or replace function provider_collection_settle(p_collection uuid, p_actor_name text)
returns jsonb
language plpgsql
as $$
declare
  v_c provider_collections;
  v_due bigint;
  v_receipt jsonb;
  v_receipt_id uuid;
  v_payment uuid;
  v_order_no text;
  v_item text;
  v_order uuid;
  v_take bigint;
  -- The business a customer's payment is for, and Aming's fee on it.
  v_tenant uuid;
  v_fee bigint;
  v_rate int;
  -- What still has to go somewhere, and what went on orders.
  v_left bigint;
  v_applied bigint := 0;
begin
  select * into v_c from provider_collections where id = p_collection for update;
  if not found then
    raise exception 'WALLET:payment_not_found';
  end if;
  if v_c.status = 'succeeded' then
    return jsonb_build_object('already_settled', true, 'receipt_id', v_c.receipt_id, 'payment_id', v_c.payment_id);
  end if;
  -- A 'failed' row the provider now reports as paid still settles: the
  -- client's money arrived.
  v_left := v_c.amount;

  if v_c.order_id is not null then
    begin
      select order_no, round(quoted_price)::bigint - wallet_order_paid(id)
        into v_order_no, v_due
        from orders where id = v_c.order_id for update;
      v_receipt := wallet_record_order_receipt(
        v_c.id, v_c.order_id, v_c.amount, 'mobile_money', v_c.provider_ref,
        'Paid by mobile money (' || initcap(v_c.provider) || ')',
        case when v_c.amount > coalesce(v_due, 0) then 'wallet' end,
        'system', null, p_actor_name
      );
      v_receipt_id := v_c.id;
      v_payment := (select wallet_payment_id from order_payment_receipts where id = v_c.id);
      v_applied := coalesce((v_receipt ->> 'applied')::bigint, 0);
      v_left := 0;
    exception when others then
      -- The order can't take it (paid meanwhile, cancelled, repriced, no
      -- invoice): fall through to a wallet deposit of the whole amount.
      v_receipt_id := null;
      v_payment := null;
    end;
  end if;

  if v_c.order_ids is not null then
    foreach v_order in array v_c.order_ids loop
      exit when v_left <= 0;
      begin
        select round(quoted_price)::bigint - wallet_order_paid(id)
          into v_due
          from orders where id = v_order and client_id = v_c.client_id for update;
        v_take := least(v_left, coalesce(v_due, 0));
        if v_take > 0 then
          perform wallet_record_order_receipt(
            gen_random_uuid(), v_order, v_take, 'mobile_money', v_c.provider_ref,
            'Paid by mobile money (' || initcap(v_c.provider) || ')',
            null, 'system', null, p_actor_name
          );
          v_left := v_left - v_take;
          v_applied := v_applied + v_take;
        end if;
      exception when others then
        -- This order can't take it: its share stays for the next one, then the wallet.
        null;
      end;
    end loop;
  end if;

  if v_left > 0 then
    if v_c.product_request_id is not null then
      select quantity || ' × ' || item_name, tenant_id into v_item, v_tenant from product_requests where id = v_c.product_request_id;
    end if;
    if v_c.booking_id is not null then
      select title, tenant_id into v_item, v_tenant from bookings where id = v_c.booking_id;
    end if;
    if v_c.billing_document_id is not null then
      select number, tenant_id into v_item, v_tenant from billing_documents where id = v_c.billing_document_id;
    end if;
    if v_tenant is not null then
      perform business_wallet_post(
        v_tenant, 'customer_payment', v_left, v_c.id, null,
        case
          when v_c.product_request_id is not null then 'Customer payment for ' || coalesce(v_item, 'an order request')
          when v_c.billing_document_id is not null then 'Customer payment for invoice ' || coalesce(v_item, '')
          else 'Customer payment for booking ' || coalesce(v_item, '')
        end,
        'system', null, v_c.created_by_name
      );
      -- Whole shillings, halves up. Nothing on a payment too small to carry one.
      -- The rate is the business's kind's: a vendor's work pays more.
      v_rate := business_fee_percent(v_tenant);
      v_fee := (v_left * v_rate + 50) / 100;
      if v_fee > 0 then
        perform business_wallet_post(v_tenant, 'fee', -v_fee, v_c.id, null, 'Aming fee, ' || v_rate || '% of ' || v_left, 'system', null, 'Aming');
      end if;
    else
      insert into payments (
        client_id, amount, method, status, provider, provider_ref, reference, note,
        created_by_type, created_by_id, created_by_name
      ) values (
        v_c.client_id, v_left, 'mobile_money', 'pending', v_c.provider, v_c.provider_ref, v_c.provider_ref,
        case
          when v_c.order_ids is not null then 'Mobile money for your invoices — kept in the wallet: they didn''t need it any more'
          when v_c.order_id is null then 'Wallet top-up by mobile money'
          else 'Mobile money for order ' || coalesce(v_order_no, '') || ' — kept in the wallet: the order couldn''t take it'
        end,
        'system', null, p_actor_name
      ) returning id into v_payment;
      perform wallet_settle_payment(v_payment, 'system', null, p_actor_name);
    end if;
  end if;

  update provider_collections
     set status = 'succeeded',
         failure_reason = null,
         receipt_id = v_receipt_id,
         payment_id = v_payment,
         resolved_at = now()
   where id = v_c.id;

  return jsonb_build_object(
    'already_settled', false,
    'receipt_id', v_receipt_id,
    'payment_id', v_payment,
    'applied', v_applied
  );
end;
$$;
