-- Nothing is sold on its own for now, only Free or Pro (owner's boss,
-- 2026-11-22): renting a Pro look (20270124100000) goes. None was ever
-- rented (look_rentals and rent payments: 0 on live, 11-22).
drop function look_rent(uuid, text, bigint, boolean, boolean, text, text);
drop function look_rent_price_set(bigint);
drop table look_rentals;
drop table look_rent_pricing;
alter table pro_payments drop column template;

-- The pricing page's lines without renting (the boss's words otherwise unchanged).
update pro_page set features = (
  select jsonb_agg(
    case
      when f->>'text' like 'The Classic page look, and Pro looks to rent%' then jsonb_build_object('text', 'The Classic page look', 'free', true)
      when f->>'text' like 'Every page look, no rent:%' then jsonb_build_object('text', 'Every page look: Showcase and every new one', 'free', false)
      else f
    end order by n)
  from jsonb_array_elements(features) with ordinality as x(f, n)
), updated_at = now();

-- Pro's new Share button on a business's announcements (same day), before "More Pro features coming".
update pro_page set features = (
  select jsonb_agg(f order by n)
  from (
    select f, n::numeric as n from jsonb_array_elements(features) with ordinality as x(f, n)
    union all
    select jsonb_build_object('text', 'A Share button on your pop-up announcements: clients share the poster and its link', 'free', false),
           (select n - 0.5 from jsonb_array_elements(features) with ordinality as y(f, n) where f->>'text' = 'More Pro features coming')
  ) lines
  where n is not null
), updated_at = now()
where not exists (select 1 from jsonb_array_elements(features) f where f->>'text' like 'A Share button%');
