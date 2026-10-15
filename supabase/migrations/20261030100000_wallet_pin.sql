-- A 4-digit wallet PIN per person (packages/lib/wallet/server/pin.ts), kept
-- as a scrypt hash on their own wallet row. It unlocks the Business card's
-- figures for 30 minutes and is needed to move money: withdraw, move to the
-- Aming card, pay from the wallet. Null: not set yet (set on first use).

alter table wallets add column pin_hash text;
