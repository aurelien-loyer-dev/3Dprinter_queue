-- QueuePrint — SQL Editor Supabase
-- Version idempotente : safe à relancer même si les tables existent déjà.

-- ── Réservations ──────────────────────────────────────────────────────────────

create table if not exists qp_reservations (
  id           text primary key,
  printer_id   text not null,
  login        text not null,
  first_name   text not null,
  last_name    text not null,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  project      text not null,
  created_at   timestamptz default now()
);

alter table qp_reservations enable row level security;

drop policy if exists "read reservations"   on qp_reservations;
drop policy if exists "insert reservations" on qp_reservations;
drop policy if exists "delete reservations" on qp_reservations;

create policy "read reservations"   on qp_reservations for select using (true);
create policy "insert reservations" on qp_reservations for insert with check (true);
create policy "delete reservations" on qp_reservations for delete using (true);

-- ── Couleurs de filament (admin) ──────────────────────────────────────────────

create table if not exists qp_filament_colors (
  id         text primary key,
  printer_id text not null,
  color_name text not null,
  hex_color  text not null,
  created_at timestamptz default now()
);

alter table qp_filament_colors enable row level security;

drop policy if exists "read filament colors"   on qp_filament_colors;
drop policy if exists "insert filament colors" on qp_filament_colors;
drop policy if exists "delete filament colors" on qp_filament_colors;

create policy "read filament colors"   on qp_filament_colors for select using (true);
create policy "insert filament colors" on qp_filament_colors for insert with check (true);
create policy "delete filament colors" on qp_filament_colors for delete using (true);
