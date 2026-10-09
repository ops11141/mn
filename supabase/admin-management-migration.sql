alter table public.admin_profiles add column if not exists username text, add column if not exists is_active boolean not null default true, add column if not exists is_superadmin boolean not null default false;
create unique index if not exists admin_profiles_username_unique on public.admin_profiles (username) where username is not null;
update public.admin_profiles set is_superadmin = true where user_id = '1259931e-a0eb-4cbf-ad89-15e2429d26f6';

drop policy if exists "Admins can insert fault records" on public.fault_records;
create policy "Admins can insert fault records" on public.fault_records for insert to authenticated with check (exists (select 1 from public.admin_profiles p where p.user_id = auth.uid() and p.role = 'admin' and p.is_active = true));
drop policy if exists "Admins can update fault records" on public.fault_records;
create policy "Admins can update fault records" on public.fault_records for update to authenticated using (exists (select 1 from public.admin_profiles p where p.user_id = auth.uid() and p.role = 'admin' and p.is_active = true)) with check (exists (select 1 from public.admin_profiles p where p.user_id = auth.uid() and p.role = 'admin' and p.is_active = true));
drop policy if exists "Admins can delete fault records" on public.fault_records;
create policy "Admins can delete fault records" on public.fault_records for delete to authenticated using (exists (select 1 from public.admin_profiles p where p.user_id = auth.uid() and p.role = 'admin' and p.is_active = true));

drop policy if exists "Admins can upload fault images" on storage.objects;
create policy "Admins can upload fault images" on storage.objects for insert to authenticated with check (bucket_id = 'fault-images' and exists (select 1 from public.admin_profiles p where p.user_id = auth.uid() and p.role = 'admin' and p.is_active = true));
drop policy if exists "Admins can update fault images" on storage.objects;
create policy "Admins can update fault images" on storage.objects for update to authenticated using (bucket_id = 'fault-images' and exists (select 1 from public.admin_profiles p where p.user_id = auth.uid() and p.role = 'admin' and p.is_active = true)) with check (bucket_id = 'fault-images' and exists (select 1 from public.admin_profiles p where p.user_id = auth.uid() and p.role = 'admin' and p.is_active = true));
drop policy if exists "Admins can delete fault images" on storage.objects;
create policy "Admins can delete fault images" on storage.objects for delete to authenticated using (bucket_id = 'fault-images' and exists (select 1 from public.admin_profiles p where p.user_id = auth.uid() and p.role = 'admin' and p.is_active = true));