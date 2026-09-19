-- Fix: client-portal orders insert released_at = null (meaning "not yet routed
-- to production by the receptionist"), but the approval migration declared the
-- column NOT NULL, so every client order failed with
-- 'null value in column "released_at" violates not-null constraint'.
-- Keep the now() default so staff-created orders are still released on insert.
alter table orders
  alter column released_at drop not null;
