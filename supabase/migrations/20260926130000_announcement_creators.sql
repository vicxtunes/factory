-- Announcements: who created each one, and boss approval.
--
-- Record who created each one, so only that person can edit,
-- hide or delete it (lib/announcements/access.ts). Any dashboard user
-- (boss, supervisor, receptionist) may create announcements.

alter table announcements
  add column created_by_id uuid references profiles (id) on delete set null;

-- Until now only the developer account could create announcements, so every
-- existing one is theirs.
update announcements
   set created_by_id = (select id from auth.users where email = 'dementaacademy@gmail.com' limit 1)
 where created_by_id is null;

create index announcements_created_by_idx on announcements (created_by_id);

-- Boss approval. Announcements from the boss go live at once; ones from a
-- supervisor or receptionist wait as 'pending' until the boss approves (or
-- rejects) them. Only approved + active announcements ever pop up.
alter table announcements
  add column approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column approved_at     timestamptz,
  add column decided_by_name text;

-- Everything that exists today was published directly, so counts as approved.
update announcements set approved_at = created_at where approved_at is null;
