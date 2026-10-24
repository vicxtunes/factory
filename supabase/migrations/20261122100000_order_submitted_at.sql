-- When a designer submitted the order to the factory (the first item sent
-- on). The boards date an order by it, so an order a designer worked on for
-- days is dated the day it was submitted; every other order (and one still
-- with its designer) is dated by created_at.

alter table orders add column submitted_at timestamptz;

-- Past orders: the first time the history shows a designer sending it on.
update orders o
   set submitted_at = e.at
  from (
    select order_id, min(created_at) as at
      from order_audit_log
     where action in ('item_sent_to_factory', 'order_released_to_factory')
     group by order_id
  ) e
 where e.order_id = o.id;
