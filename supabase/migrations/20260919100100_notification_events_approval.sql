-- Factory Order Tracker — notification events for the quote/approval loop
-- (see 20260919100000_order_approval.sql). Standalone migration: a new enum
-- value can't be referenced by name in the same transaction it's added in.
alter type notification_event add value 'quote_ready';
alter type notification_event add value 'client_responded';
