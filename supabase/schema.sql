-- Supabase schema for Ops11141/mn — Fault Documentation
-- Run in Supabase SQL Editor after creating a Supabase project.
-- Public users may read records and images. Only manually designated admins may write.

create extension if not exists pgcrypto;

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now()
);

create table if not exists public.fault_records (
  id uuid primary key default gen_random_uuid(),
  equipment text not null,
  feeder text not null default '',
  location text not null,
  fault_date date not null default current_date,
  status text not null default 'تم الانتهاء وبحاجة إلى جدولة' check (status in ('تم الانتهاء','تم الانتهاء وبحاجة إلى جدولة')),
  reporter text not null default '',
  description text not null,
  before_images text[] not null default '{}',
  after_images text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep the status constraint compatible when this script is run on an existing project.
alter table public.fault_records drop constraint if exists fault_records_status_check;
alter table public.fault_records add constraint fault_records_status_check
  check (status in ('تم الانتهاء','تم الانتهاء وبحاجة إلى جدولة'));
alter table public.fault_records alter column status set default 'تم الانتهاء وبحاجة إلى جدولة';

alter table public.admin_profiles enable row level security;
alter table public.fault_records enable row level security;

-- Explicit API privileges because automatic table exposure is disabled in project setup.
grant select on public.fault_records to anon, authenticated;
grant insert, update, delete on public.fault_records to authenticated;
grant select on public.admin_profiles to authenticated;

drop policy if exists "Admins can read own profile" on public.admin_profiles;
create policy "Admins can read own profile"
on public.admin_profiles for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Public can read fault records" on public.fault_records;
create policy "Public can read fault records"
on public.fault_records for select to anon, authenticated
using (true);

drop policy if exists "Admins can insert fault records" on public.fault_records;
create policy "Admins can insert fault records"
on public.fault_records for insert to authenticated
with check (exists (
  select 1 from public.admin_profiles p
  where p.user_id = auth.uid() and p.role = 'admin'
));

drop policy if exists "Admins can update fault records" on public.fault_records;
create policy "Admins can update fault records"
on public.fault_records for update to authenticated
using (exists (
  select 1 from public.admin_profiles p
  where p.user_id = auth.uid() and p.role = 'admin'
))
with check (exists (
  select 1 from public.admin_profiles p
  where p.user_id = auth.uid() and p.role = 'admin'
));

drop policy if exists "Admins can delete fault records" on public.fault_records;
create policy "Admins can delete fault records"
on public.fault_records for delete to authenticated
using (exists (
  select 1 from public.admin_profiles p
  where p.user_id = auth.uid() and p.role = 'admin'
));

-- Public read-only image bucket. Upload/update/delete require admin membership.
insert into storage.buckets (id, name, public)
values ('fault-images', 'fault-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can view fault images" on storage.objects;
create policy "Public can view fault images"
on storage.objects for select to anon, authenticated
using (bucket_id = 'fault-images');

drop policy if exists "Admins can upload fault images" on storage.objects;
create policy "Admins can upload fault images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fault-images'
  and exists (select 1 from public.admin_profiles p where p.user_id = auth.uid() and p.role = 'admin')
);

drop policy if exists "Admins can update fault images" on storage.objects;
create policy "Admins can update fault images"
on storage.objects for update to authenticated
using (
  bucket_id = 'fault-images'
  and exists (select 1 from public.admin_profiles p where p.user_id = auth.uid() and p.role = 'admin')
)
with check (
  bucket_id = 'fault-images'
  and exists (select 1 from public.admin_profiles p where p.user_id = auth.uid() and p.role = 'admin')
);

drop policy if exists "Admins can delete fault images" on storage.objects;
create policy "Admins can delete fault images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'fault-images'
  and exists (select 1 from public.admin_profiles p where p.user_id = auth.uid() and p.role = 'admin')
);

-- Setup outline:
-- 1) Create the first admin account through Supabase Auth.
-- 2) Copy that user's UUID from Authentication > Users.
-- 3) Run manually, replacing UUID/name:
-- insert into public.admin_profiles (user_id, display_name, role)
-- values ('USER-UUID-HERE', 'Maintenance Admin', 'admin');
-- Never expose the service_role key in the website.
