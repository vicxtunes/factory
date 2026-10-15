-- Captions on files, "name the photos" tasks, and opening a client's task by
-- link (see packages/lib/files/README.md → "Naming photos", and
-- packages/lib/tasks/README.md → "Tasks for clients").
--
-- A file's caption is a few words about it: for a school's photos, the
-- children in each one ("Nakato Sarah, Joel K."). The business writes them;
-- so does whoever a "name" task is given to, on the files in its folder,
-- until they send it.

alter table files add column caption text check (char_length(caption) <= 500);

-- A fourth kind of task: give names (captions) to the photos in its folder.
do $$
declare
  v_name text;
begin
  -- The kind check was made without a name: find it by what it checks.
  for v_name in
    select conname from pg_constraint
     where conrelid = 'tasks'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%feedback%' and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table tasks drop constraint %I', v_name);
  end loop;
end;
$$;

alter table tasks add constraint tasks_kind_check check (kind in ('todo', 'choose', 'feedback', 'name'));

-- A client's task can be opened by link, without signing in: the secret in
-- client.<domain>/<studio>/t/<secret>. Made the first time the business
-- copies it; it opens only that task's folder (to look at, no downloads) and
-- the task, and dies with the task.
alter table tasks add column share_token text unique check (char_length(share_token) between 32 and 128);

-- Each picture file's small copies, made by the server after it's uploaded:
-- a preview (1,600 px) and a thumbnail (400 px), both JPEG, upright, with no
-- location or camera details. Shown instead of the original wherever it's
-- only being looked at (and always on task links: proofs never send the
-- original). preview_bytes is both copies together; 0: none yet. They count
-- toward the storage allowance.
alter table files add column preview_bytes bigint not null default 0 check (preview_bytes >= 0);

create or replace function photos_used_bytes(p_tenant uuid)
returns bigint
language sql
stable
as $$
  select (select coalesce(sum(bytes), 0) from photos where tenant_id = p_tenant)
       + (select coalesce(sum(video_bytes), 0) from photo_albums where tenant_id = p_tenant)
       + (select coalesce(sum(bytes + preview_bytes), 0) from files where tenant_id = p_tenant);
$$;
