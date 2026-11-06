-- The 80% rule is only for orders an agent places from their own login
-- (owner, 2026-11-06): those wait in Client Orders and go to production once
-- 80% is paid. An order staff or a designer create in an agent's name still
-- earns the agent commission (commission_eligible) but flows as any other
-- order, released at once and with no payment check.
--
-- placed_by_agent marks the agents' own orders. Existing ones: tagged, earning,
-- and with no staff role recorded as their creator (the agent portal records
-- none; staff and designer orders record theirs).

alter table orders add column placed_by_agent boolean not null default false;
alter table orders add constraint orders_placed_by_agent_needs_agent check (not placed_by_agent or agent_id is not null);
comment on column orders.placed_by_agent is 'Placed by the agent from their own login: goes to production only once 80% is paid.';

update orders set placed_by_agent = true where agent_id is not null and commission_eligible and created_by_role is null;
