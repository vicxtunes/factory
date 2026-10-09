-- A studio's brand color (packages/lib/studios/core/brand.ts): its public
-- pages wear it instead of Aming's. Stored already made readable; null until
-- the studio chooses, when its pages use the neutral default.

alter table tenants
  add column brand_color text check (brand_color ~ '^#[0-9a-f]{6}$');
