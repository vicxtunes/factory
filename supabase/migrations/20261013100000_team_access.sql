-- Team members sign in (see packages/lib/team/README.md): the owner adds a
-- member, chooses what they may use, and sends them an invite link. The member
-- opens it signed in to their own Aming account (with a PIN) and joins: from
-- then on that account opens the studio's workspace, limited to what they
-- were given. Owner-only things (the team, the business profile, password
-- and brand) are never given.

alter table team_members
  -- The Aming account that joined as this member; null until they join, or once access is removed.
  add column client_id uuid references clients (id) on delete set null,
  -- The parts of the studio they may use (none: only the tasks given to them).
  add column access text[] not null default '{}'
    check (access <@ array['bookings', 'projects', 'clients', 'money', 'catalog']::text[]),
  -- The invite link's secret, while there's one, and when it stops working.
  add column invite_token text unique check (invite_token is null or length(invite_token) >= 32),
  add column invite_expires_at timestamptz,
  add constraint team_members_invite_expiry check ((invite_token is null) = (invite_expires_at is null));

-- An account joins a studio once.
create unique index team_members_one_account on team_members (tenant_id, client_id) where client_id is not null;
-- "Which studios does this account work for?"
create index team_members_client on team_members (client_id) where client_id is not null;
