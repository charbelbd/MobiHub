-- STEP 0 (read-only): run this BEFORE the security fix and check the result.
--
-- After the fix, only people whose login email matches a row in app_users can
-- use the app. Every staff member must show 'OK' below, otherwise they would be
-- locked out. Also look for users/admins you don't recognise, or passwords that
-- were changed recently when nobody changed them (the password function and the
-- app_users table were open to the public).

select
  coalesce(u.email, a.username)                         as email,
  case
    when u.id is null then 'NO LOGIN ACCOUNT (app_users row only)'
    when a.id is null then 'NOT IN app_users -> will have no access'
    else 'OK'
  end                                                   as status,
  a.is_admin,
  a.permissions::text                                   as permissions,
  u.created_at                                          as login_created_at,
  u.updated_at                                          as login_updated_at,
  u.last_sign_in_at
from auth.users u
full outer join public.app_users a on lower(a.username) = lower(u.email)
order by status, email;
