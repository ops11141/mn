-- Add a login username for the existing admin account.
alter table public.admin_profiles
  add column if not exists username text;

create unique index if not exists admin_profiles_username_lower_unique
  on public.admin_profiles (lower(username))
  where username is not null;

update public.admin_profiles
set username = '80825'
where user_id = '1259931e-a0eb-4cbf-ad89-15e2429d26f6';

-- Confirm that exactly the intended admin row has the username:
select user_id, username, role
from public.admin_profiles
where username = '80825';
