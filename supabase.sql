-- Chạy một lần trong Supabase SQL Editor.
create table if not exists public.draw_control (
    id integer primary key check (id = 1),
    enabled boolean not null default true,
    spin_in_progress boolean not null default false,
    started_at timestamptz,
    prize_index integer check (prize_index between 0 and 3),
    completed_at timestamptz
);

insert into public.draw_control (id, enabled, spin_in_progress)
values (1, true, false)
on conflict (id) do nothing;

alter table public.draw_control enable row level security;
grant all on public.draw_control to service_role;
