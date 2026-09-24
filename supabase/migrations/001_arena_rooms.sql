-- Run once in the Supabase SQL Editor. Safe to rerun for this schema.
begin;

create table if not exists public.arena_rooms (
  code text primary key,
  body jsonb not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  constraint arena_rooms_code_format check (code ~ '^[A-Z2-9]{6}$'),
  constraint arena_rooms_body_code check (
    jsonb_typeof(body) = 'object' and body ? 'code' and body->>'code' = code
  )
);

create index if not exists arena_rooms_created_at_idx on public.arena_rooms (created_at desc, code asc);

-- Bodies contain answers, private hands, and team token hashes.
-- Only the Next.js server using its secret key may access this table.
alter table public.arena_rooms enable row level security;
revoke all on public.arena_rooms from public, anon, authenticated;
grant select, insert, update on public.arena_rooms to service_role;

commit;
