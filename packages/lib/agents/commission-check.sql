do $test$
declare
  a_login uuid; c1 uuid; agent uuid; agent2 uuid; cat1 uuid; cat2 uuid; prod1 uuid; prod2 uuid;
  o uuid; o2 uuid; o3 uuid; o4 uuid; i1 uuid; i2 uuid; w uuid; w2 uuid; w3 uuid; acct uuid;
  v agent_commissions; bal bigint; n int; ok boolean;
begin
  insert into clients (name, phone) values ('T agent login', '+256700999001') returning id into a_login;
  insert into clients (name, phone) values ('T client', '+256700999002') returning id into c1;
  insert into agents (name, client_id) values ('T agent', a_login) returning id into agent;
  insert into agents (name, rate_override) values ('T agent2', 20) returning id into agent2;
  insert into product_categories (name) values ('T cat 1') returning id into cat1;
  insert into product_categories (name) values ('T cat 2') returning id into cat2;
  insert into products (category_id, name, price) values (cat1, 'T p1', 1000) returning id into prod1;
  insert into products (category_id, name, price) values (cat2, 'T p2', 1000) returning id into prod2;
  insert into commission_rates values (cat1, 10, 'T');
  insert into commission_rates values (cat2, 5, 'T');

  -- Placed: rates saved per line, estimate from the catalog, nothing credited.
  insert into orders (order_no, client_name, client_id, agent_id, commission_eligible) values ('T-1', 'T client', c1, agent, true) returning id into o;
  insert into order_items (order_id, product, qty, category_id, product_id) values (o, 'a', 2, cat1, prod1) returning id into i1;
  insert into order_items (order_id, product, qty, category_id, product_id) values (o, 'b', 1, cat2, prod2) returning id into i2;
  if (select rate from agent_commission_lines where order_item_id = i1) <> 10 then raise exception 'FAIL rate 1'; end if;
  if (select rate from agent_commission_lines where order_item_id = i2) <> 5 then raise exception 'FAIL rate 2'; end if;
  select * into v from agent_commissions where order_id = o;
  if v.status <> 'pending' or v.amount <> 250 or v.credited_amount <> 0 then raise exception 'FAIL placed %', row_to_json(v); end if;

  -- A rate changed later leaves it alone.
  update commission_rates set rate = 50 where category_id = cat1;

  -- Invoice: 2 x 50,000 and 1 x 20,000 = 120,000 → 10,000 + 1,000 = 11,000.
  update order_items set unit_price = 50000 where id = i1;
  update order_items set unit_price = 20000 where id = i2;
  update orders set quoted_price = 120000 where id = o;
  select * into v from agent_commissions where order_id = o;
  if v.amount <> 11000 or v.status <> 'pending' then raise exception 'FAIL invoiced %', row_to_json(v); end if;

  -- Delivered but only part paid: still pending.
  update order_items set production_status = 'completed' where order_id = o;
  insert into order_payment_receipts (order_id, client_id, amount_received, amount_applied, method, actor_type, actor_name) values (o, c1, 100000, 100000, 'cash', 'system', 'T');
  select * into v from agent_commissions where order_id = o;
  if v.status <> 'pending' or v.credited_amount <> 0 then raise exception 'FAIL part paid %', row_to_json(v); end if;

  -- The wallet pays the rest: credited, once.
  perform wallet_post(c1, 'adjustment', 500000, null, null, 'T', 'system', null, 'T');
  perform wallet_post(c1, 'order_payment', -20000, null, o, 'T', 'system', null, 'T');
  select * into v from agent_commissions where order_id = o;
  if v.status <> 'credited' or v.credited_amount <> 11000 or v.credited_at is null then raise exception 'FAIL credited %', row_to_json(v); end if;
  perform agent_commission_evaluate(o);
  perform agent_commission_evaluate(o);
  select count(*) into n from agent_wallet_transactions where order_id = o;
  if n <> 1 then raise exception 'FAIL evaluated twice, % rows', n; end if;
  if (select balance from agent_wallets where agent_id = agent) <> 11000 then raise exception 'FAIL balance'; end if;

  -- Paid but not yet delivered: stays pending (the other way round).
  insert into orders (order_no, client_name, client_id, agent_id, commission_eligible, quoted_price) values ('T-2', 'T client', c1, agent, true, 10000) returning id into o2;
  insert into order_items (order_id, product, qty, category_id, unit_price) values (o2, 'a', 1, cat1, 10000) returning id into i1;
  insert into order_payment_receipts (order_id, client_id, amount_received, amount_applied, method, actor_type, actor_name) values (o2, c1, 10000, 10000, 'cash', 'system', 'T');
  select * into v from agent_commissions where order_id = o2;
  -- The rate is now 50%.
  if v.status <> 'pending' or v.amount <> 5000 then raise exception 'FAIL paid undelivered %', row_to_json(v); end if;
  update order_items set production_status = 'ready_for_pickup' where id = i1;
  if (select status from agent_commissions where order_id = o2) <> 'pending' then raise exception 'FAIL ready is not delivered'; end if;
  update order_items set production_status = 'completed' where id = i1;
  if (select credited_amount from agent_commissions where order_id = o2) <> 5000 then raise exception 'FAIL o2 credited'; end if;

  -- A part refund takes back that part: 100,000 of 120,000 still paid → 9,166 of 11,000.
  perform wallet_post(c1, 'refund', 20000, null, o, 'T', 'system', null, 'T');
  select * into v from agent_commissions where order_id = o;
  if v.status <> 'credited' or v.credited_amount <> 9166 then raise exception 'FAIL part refund %', row_to_json(v); end if;
  if (select balance from agent_wallets where agent_id = agent) <> 14166 then raise exception 'FAIL balance after part refund'; end if;

  -- Paid again: back up to the full amount, no more.
  perform wallet_post(c1, 'order_payment', -20000, null, o, 'T', 'system', null, 'T');
  if (select credited_amount from agent_commissions where order_id = o) <> 11000 then raise exception 'FAIL repaid'; end if;
  perform wallet_post(c1, 'refund', 20000, null, o, 'T', 'system', null, 'T');

  -- Withdrawal, Aming carries the fee: out now; the fee credited once.
  update agent_settings set withdrawal_fee_paid_by = 'aming';
  w := agent_withdraw_request(agent, 5000, 'mobile_money', '+256700999001', null, null, null, 'x', 'T');
  if (select balance from agent_wallets where agent_id = agent) <> 9166 then raise exception 'FAIL after request'; end if;
  perform agent_withdraw_approve(w, 'Boss');
  begin
    perform agent_withdraw_approve(w, 'Boss');
    raise exception 'FAIL approved twice';
  exception when others then
    if sqlerrm not like 'WALLET:withdrawal_not_pending%' then raise; end if;
  end;
  perform agent_withdraw_taken(w, 'GW1', 300);
  if not agent_withdraw_payout_result(w, true, 300, 'GW1', null) then raise exception 'FAIL result'; end if;
  if agent_withdraw_payout_result(w, true, 300, 'GW1', null) then raise exception 'FAIL result twice'; end if;
  perform agent_withdraw_taken(w, 'GW1', 300);
  if (select balance from agent_wallets where agent_id = agent) <> 9466 then raise exception 'FAIL fee credit'; end if;

  -- Its answer arriving before "taken": the fee is still credited, once.
  w2 := agent_withdraw_request(agent, 1000, 'mobile_money', '+256700999001', null, null, null, 'x', 'T');
  perform agent_withdraw_approve(w2, 'Boss');
  perform agent_withdraw_payout_result(w2, true, null, null, null);
  perform agent_withdraw_taken(w2, 'GW2', 100);
  if (select balance from agent_wallets where agent_id = agent) <> 8566 then raise exception 'FAIL race fee'; end if;

  -- The agent carries the fee: nothing comes back.
  update agent_settings set withdrawal_fee_paid_by = 'agent';
  w2 := agent_withdraw_request(agent, 1000, 'mobile_money', '+256700999001', null, null, null, 'x', 'T');
  perform agent_withdraw_approve(w2, 'Boss');
  perform agent_withdraw_taken(w2, 'GW3', 100);
  perform agent_withdraw_payout_result(w2, true, 100, 'GW3', null);
  if (select balance from agent_wallets where agent_id = agent) <> 7566 then raise exception 'FAIL agent pays'; end if;

  -- Failed at HivePay, and refused: back on the balance.
  w2 := agent_withdraw_request(agent, 1000, 'mobile_money', '+256700999001', null, null, null, 'x', 'T');
  perform agent_withdraw_approve(w2, 'Boss');
  perform agent_withdraw_payout_result(w2, false, null, null, 'nope');
  w3 := agent_withdraw_request(agent, 1000, 'mobile_money', '+256700999001', null, null, null, 'x', 'T');
  perform agent_withdraw_refuse(w3, 'no reason', 'b', 'Boss');
  if (select balance from agent_wallets where agent_id = agent) <> 7566 then raise exception 'FAIL returned'; end if;

  -- Not sent twice by a stale "not taken": it goes back to waiting, with why.
  w3 := agent_withdraw_request(agent, 1000, 'mobile_money', '+256700999001', null, null, null, 'x', 'T');
  perform agent_withdraw_approve(w3, 'Boss');
  perform agent_withdraw_not_taken(w3, 'no float');
  if (select status from agent_withdrawals where id = w3) <> 'pending' then raise exception 'FAIL not taken'; end if;
  perform agent_withdraw_refuse(w3, 'no reason', 'b', 'Boss');

  -- Bank, sent by hand: in the day book, from that account.
  select id into acct from money_accounts where tenant_id = default_tenant_id() limit 1;
  w3 := agent_withdraw_request(agent, 2000, 'bank', null, 'Stanbic', 'T agent', '123', 'x', 'T');
  begin
    perform agent_withdraw_approve(w3, 'Boss');
    raise exception 'FAIL a bank one through HivePay';
  exception when others then
    if sqlerrm not like 'WALLET:withdrawal_not_pending%' then raise; end if;
  end;
  perform agent_withdraw_bank_paid(w3, acct, 'REF1', 'Boss');
  if not exists (select 1 from money_day_lines where id = w3 and kind = 'agent_withdrawal' and direction = 'out' and amount = 2000 and money_account_id = acct and method = 'bank_transfer') then raise exception 'FAIL bank day line'; end if;
  if not exists (select 1 from money_day_lines where id = w and kind = 'agent_withdrawal' and amount = 5000 and money_account_id = money_hivepay_account()) then raise exception 'FAIL hivepay day line'; end if;

  -- More than there is: refused.
  begin
    perform agent_withdraw_request(agent, 999999999, 'mobile_money', '+256700999001', null, null, null, 'x', 'T');
    raise exception 'FAIL too much';
  exception when others then
    if sqlerrm not like 'WALLET:insufficient_funds%' then raise; end if;
  end;

  -- Cancelled after it was withdrawn: all taken back, below zero, and no withdrawing.
  update orders set cancelled_at = now() where id = o;
  update orders set cancelled_at = now() where id = o2;
  select * into v from agent_commissions where order_id = o;
  if v.status <> 'reversed' or v.credited_amount <> 0 then raise exception 'FAIL reversed %', row_to_json(v); end if;
  select balance into bal from agent_wallets where agent_id = agent;
  if bal >= 0 then raise exception 'FAIL should be below zero: %', bal; end if;
  begin
    perform agent_withdraw_request(agent, 500, 'mobile_money', '+256700999001', null, null, null, 'x', 'T');
    raise exception 'FAIL withdrew below zero';
  exception when others then
    if sqlerrm not like 'WALLET:insufficient_funds%' then raise; end if;
  end;

  -- The ledger adds up, and can't be changed.
  if (select sum(amount) from agent_wallet_transactions where agent_id = agent) <> bal then raise exception 'FAIL ledger sum'; end if;
  begin
    update agent_wallet_transactions set note = 'x' where agent_id = agent;
    raise exception 'FAIL ledger changed';
  exception when others then
    if sqlerrm not like '%never change%' then raise; end if;
  end;

  -- An agent's own rate beats the category's; cancelled while pending earns nothing.
  insert into orders (order_no, client_name, agent_id, commission_eligible, quoted_price) values ('T-3', 'T client', agent2, true, 10000) returning id into o3;
  insert into order_items (order_id, product, qty, category_id, unit_price) values (o3, 'a', 1, cat2, 10000);
  if (select amount from agent_commissions where order_id = o3) <> 2000 then raise exception 'FAIL override'; end if;
  update orders set cancelled_at = now() where id = o3;
  if (select status from agent_commissions where order_id = o3) <> 'cancelled' then raise exception 'FAIL cancelled'; end if;

  -- A staff order tagged with an agent earns nothing.
  insert into orders (order_no, client_name, agent_id) values ('T-4', 'T client', agent) returning id into o4;
  insert into order_items (order_id, product, qty, category_id, unit_price) values (o4, 'a', 1, cat1, 10000);
  update order_items set production_status = 'completed' where order_id = o4;
  if exists (select 1 from agent_commissions where order_id = o4) or exists (select 1 from agent_commission_lines where order_id = o4) then raise exception 'FAIL staff order earned'; end if;

  -- An inactive agent can't withdraw.
  update agents set active = false where id = agent2;
  begin
    perform agent_withdraw_request(agent2, 500, 'mobile_money', '+256700999001', null, null, null, 'x', 'T');
    raise exception 'FAIL inactive';
  exception when others then
    if sqlerrm not like 'AGENT:inactive%' then raise; end if;
  end;

  -- The public key sees no more than it did.
  if has_column_privilege('anon', 'agents', 'rate_override', 'select') or has_column_privilege('anon', 'agents', 'client_id', 'select') then raise exception 'FAIL anon sees agent money'; end if;
  if not has_column_privilege('anon', 'agents', 'name', 'select') then raise exception 'FAIL anon lost agent names'; end if;
  if has_table_privilege('anon', 'agent_wallets', 'select') or has_table_privilege('authenticated', 'agent_withdrawals', 'select') then raise exception 'FAIL anon sees wallets'; end if;
end;
$test$;
rollback;
select 'ALL PASSED, ROLLED BACK' as result, to_regclass('agent_wallets') as table_left_behind;
