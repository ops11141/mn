-- Run once in Supabase SQL Editor to migrate an existing database to the two approved statuses.
alter table public.fault_records drop constraint if exists fault_records_status_check;
alter table public.fault_records add constraint fault_records_status_check
  check (status in ('تم الانتهاء','تم الانتهاء وبحاجة إلى جدولة'));
alter table public.fault_records alter column status set default 'تم الانتهاء وبحاجة إلى جدولة';

-- Map any earlier prototype statuses to the closest approved status.
update public.fault_records
set status = case
  when status = 'تم الإصلاح' then 'تم الانتهاء'
  else 'تم الانتهاء وبحاجة إلى جدولة'
end
where status not in ('تم الانتهاء','تم الانتهاء وبحاجة إلى جدولة');
