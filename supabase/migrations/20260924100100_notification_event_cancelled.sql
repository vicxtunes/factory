-- Factory Order Tracker — notification event for order cancellation (see
-- 20260924100000_order_cancellation.sql). Standalone migration: a new enum
-- value can't be referenced by name in the same transaction it's added in.
alter type notification_event add value 'cancelled';
