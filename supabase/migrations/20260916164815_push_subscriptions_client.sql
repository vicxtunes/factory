-- Factory Order Tracker — allow 'client' as a push_subscriptions
-- subscriber_type, so the client portal (/client-side) can opt into push
-- the same way dashboard/worker/designer sessions already do (subscribe/
-- unsubscribe both go through resolveActor(), which already returns
-- "client" for a signed-in client session — see lib/audit/log.ts).

alter table push_subscriptions drop constraint push_subscriptions_subscriber_type_check;
alter table push_subscriptions add constraint push_subscriptions_subscriber_type_check
  check (subscriber_type in ('dashboard_user', 'worker', 'designer', 'client'));
