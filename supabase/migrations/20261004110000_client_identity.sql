-- Client identity (see packages/lib/clients/core/identity.ts).
--
-- Every client gives their real first and last name once: new clients at
-- sign-up, existing ones (often typed in by staff as a nickname) the next time
-- they sign in, before they can order. Their display name (clients.name) then
-- becomes "First Last", so staff, invoices and orders show the real person.
-- A studio's onboarding pre-fills its owner's names from this.

alter table clients
  add column first_name text check (char_length(first_name) between 2 and 50),
  add column last_name  text check (char_length(last_name) between 2 and 50),
  -- When the client confirmed their name; null = not yet (asked at next sign-in).
  add column identity_confirmed_at timestamptz,
  add constraint clients_identity_complete check (
    identity_confirmed_at is null or (first_name is not null and last_name is not null)
  );
