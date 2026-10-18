-- A business's work on Aming's front page: its public albums and its
-- services with photos, in the feed visitors see before they sign in
-- (apps/client/app/landing.tsx). Each business opts in (Showroom in My
-- Business); off by default, since a business's page otherwise carries only
-- its own brand.

alter table tenants add column show_on_aming boolean not null default false;
