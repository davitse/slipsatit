-- กระทบยอด Statement (PDF) กับสลิป
create table if not exists public.statements (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  file_name      text not null,
  file_path      text not null,
  status         text not null default 'processing'
                 check (status in ('processing', 'done', 'failed')),
  error          text,
  bank           text,
  acc_last4      text,
  period_start   date,
  period_end     date,
  out_count      integer,
  out_total      numeric(14,2),
  day_tol        smallint,
  amt_tol        numeric(6,2),
  include_fee    boolean,
  matched_at     timestamptz,
  finalized_at   timestamptz
);

create table if not exists public.statement_rows (
  id            uuid primary key default gen_random_uuid(),
  statement_id  uuid not null references public.statements(id) on delete cascade,
  seq           integer not null,
  tx_date       date not null,
  tx_time       text,
  description   text,
  amount        numeric(14,2) not null,
  direction     text not null check (direction in ('out', 'in')),
  balance       numeric(14,2)
);
create index if not exists statement_rows_stmt_idx on public.statement_rows (statement_id, seq);

create table if not exists public.matches (
  id            uuid primary key default gen_random_uuid(),
  statement_id  uuid not null references public.statements(id) on delete cascade,
  row_id        uuid references public.statement_rows(id) on delete cascade,
  slip_id       uuid references public.slips(id) on delete set null,
  kind          text not null check (kind in ('matched', 'diff', 'no_slip', 'no_stmt', 'out')),
  admin_status  text not null default 'pending'
                check (admin_status in ('pending', 'approved', 'flagged', 'na')),
  admin_note    text,
  decided_at    timestamptz,
  sort_date     date
);
create index if not exists matches_stmt_idx on public.matches (statement_id, sort_date);

-- เข้าถึงผ่านเซิร์ฟเวอร์ (service role) เท่านั้น
alter table public.statements enable row level security;
alter table public.statement_rows enable row level security;
alter table public.matches enable row level security;
