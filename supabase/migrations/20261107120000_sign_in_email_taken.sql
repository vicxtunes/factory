-- Whether any sign-in (Supabase Auth user) already has this email: a client,
-- a studio owner, or Aming's own staff. Sign-up refuses such an email
-- (apps/client/app/auth-actions.ts) rather than setting a new password on
-- someone else's sign-in. The server only (service role).

create or replace function sign_in_email_taken(p_email text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where lower(u.email) = lower(trim(p_email)));
$$;

revoke all on function sign_in_email_taken(text) from public, anon, authenticated;
