-- An agent order can keep its own pay-before-production % (owner, 2026-11-09).
-- When the boss saves a new % for all agents or for one agent, they choose
-- whether orders already waiting take it. "No" writes the % they had onto each
-- waiting order here; empty means the order follows the current rule
-- (packages/lib/agents/server.ts orderPayFirst).

alter table orders
  add column pay_first_percent smallint check (pay_first_percent between 0 and 100);
