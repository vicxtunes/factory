-- Factory Order Tracker — move "stage" from purely order-level to
-- item-level. A designer can now send finished items to the factory one at
-- a time while still working the rest of the order, instead of only being
-- able to release the whole order at once. orders.stage is kept (now means
-- "has the designer fully released every item yet") so the order stays on
-- the designer's board, and the existing "with designer" banners, until
-- every item has moved — see app/graphics/actions.ts.

alter table order_items add column stage order_stage not null default 'factory';

update order_items oi
set stage = o.stage
from orders o
where oi.order_id = o.id;

create index order_items_stage_idx on order_items (stage);
