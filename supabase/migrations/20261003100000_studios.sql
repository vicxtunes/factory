-- Studios (My Business, Phase 1; see packages/lib/studios/README.md).
--
-- Every Aming client can run their own photography studio in the system. A
-- studio is a tenant (packages/lib/tenancy) owned by one client. It is
-- created the first time the client opens "My Studio", so only studios in
-- use exist.
--
-- Additive only: no existing rows change. Aming stays the default tenant,
-- with no owner. Existing tables keep no tenant_id until a studio module
-- starts using them.

alter table tenants
  -- The client who owns this studio. One studio per client. Null only for the default tenant (Aming).
  add column owner_client_id uuid unique references clients (id) on delete restrict,
  -- Business profile, shown on the studio's documents and to its customers.
  add column phone   text check (char_length(phone) <= 40),
  add column email   text check (char_length(email) <= 120),
  add column address text check (char_length(address) <= 200),
  add constraint tenants_name_length check (char_length(name) <= 80),
  add constraint tenants_owned_unless_default check (is_default or owner_client_id is not null);

create trigger tenants_set_updated_at
  before update on tenants
  for each row execute function set_updated_at();

-- tenants already has row-level security on with no policies: only the
-- server (service role) reads or writes it. Studio separation is enforced
-- there: the studio always comes from the signed-in client's session.
