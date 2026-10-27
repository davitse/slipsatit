-- SlipSatit: ตารางสลิป + storage bucket เก็บรูป
create table if not exists public.slips (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  file_name     text not null,
  mime_type     text not null,
  image_path    text not null,
  extract_status text not null default 'processing'
                check (extract_status in ('processing', 'done', 'failed')),
  error         text,
  slip_date     date,
  slip_time     text,
  ref           text,
  tx_type       text,
  from_bank     text,
  from_name     text,
  from_acc      text,
  to_bank       text,
  to_name       text,
  to_acc        text,
  amount        numeric(14,2),
  fee           numeric(10,2) default 0,
  memo          text,
  category      text,
  confidence    smallint check (confidence between 0 and 100),
  status        text not null default 'pending'
                check (status in ('pending', 'verified'))
);

create index if not exists slips_slip_date_idx on public.slips (slip_date desc);
create index if not exists slips_created_at_idx on public.slips (created_at desc);

-- เข้าถึงผ่านเซิร์ฟเวอร์ (service role) เท่านั้น: เปิด RLS และไม่สร้าง policy ให้ anon/authenticated
alter table public.slips enable row level security;

insert into storage.buckets (id, name, public)
values ('slips', 'slips', false)
on conflict (id) do nothing;
