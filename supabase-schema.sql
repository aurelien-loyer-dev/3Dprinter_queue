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

-- ── Télémétrie Bambu Lab (bridge Python) ──────────────────────────────────────

create table if not exists qp_printer_telemetry (
  printer_id    text primary key,
  state         text not null default 'offline',
  progress      int  not null default 0,
  remaining_min int,
  current_file  text,
  layer_current int,
  layer_total   int,
  nozzle_temp   numeric(5,1),
  bed_temp      numeric(5,1),
  chamber_temp  numeric(5,1),
  speed_level   text,
  error_code    int,
  current_stage int,
  ams_colors    text,
  updated_at    timestamptz default now()
);

alter table if exists qp_printer_telemetry
  add column if not exists camera_jpeg text;

alter table if exists qp_printer_telemetry
  add column if not exists camera_version bigint,
  add column if not exists thumbnail_version bigint;

-- Mise à jour auto du timestamp
create or replace function qp_touch_telemetry()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_telemetry_updated_at on qp_printer_telemetry;
create trigger trg_telemetry_updated_at
  before insert or update on qp_printer_telemetry
  for each row execute function qp_touch_telemetry();

alter table qp_printer_telemetry enable row level security;

drop policy if exists "read telemetry"   on qp_printer_telemetry;
drop policy if exists "service telemetry" on qp_printer_telemetry;

create policy "read telemetry" on qp_printer_telemetry for select using (true);
-- Écriture réservée à la clé service_role (bypass RLS côté bridge)

-- ── Notes imprimante ────────────────────────────────────────────────────────

create table if not exists qp_printer_notes (
  id            text primary key,
  printer_id    text not null,
  content       text not null,
  author_login  text not null,
  author_name   text not null,
  created_at    timestamptz default now()
);

alter table qp_printer_notes enable row level security;

drop policy if exists "read printer notes"   on qp_printer_notes;
drop policy if exists "insert printer notes" on qp_printer_notes;
drop policy if exists "delete printer notes" on qp_printer_notes;

create policy "read printer notes"   on qp_printer_notes for select using (true);
create policy "insert printer notes" on qp_printer_notes for insert with check (true);
create policy "delete printer notes" on qp_printer_notes for delete using (true);

-- ── Fenêtres de maintenance (admin) ───────────────────────────────────────────

create table if not exists qp_maintenance (
  printer_id text primary key,
  message    text not null,
  return_at  timestamptz,
  set_by     text not null,
  created_at timestamptz default now()
);

alter table qp_maintenance enable row level security;

drop policy if exists "read maintenance"   on qp_maintenance;
drop policy if exists "insert maintenance" on qp_maintenance;
drop policy if exists "update maintenance" on qp_maintenance;
drop policy if exists "delete maintenance" on qp_maintenance;

create policy "read maintenance"   on qp_maintenance for select using (true);
create policy "insert maintenance" on qp_maintenance for insert with check (true);
create policy "update maintenance" on qp_maintenance for update using (true);
create policy "delete maintenance" on qp_maintenance for delete using (true);

-- ── Commandes imprimante (stop/pause/resume, exécutées par le bridge) ────────

create table if not exists qp_printer_commands (
  id         uuid primary key default gen_random_uuid(),
  printer_id text not null,
  command    text not null,
  status     text not null default 'pending',
  created_at timestamptz default now()
);

alter table qp_printer_commands enable row level security;

drop policy if exists "insert printer commands" on qp_printer_commands;
create policy "insert printer commands" on qp_printer_commands for insert with check (true);
-- Lecture/mise à jour réservées à la clé service_role (bridge) — pas de policy select/update publique

-- ── Storage — snapshots caméra + miniatures d'impression ──────────────────────

insert into storage.buckets (id, name, public)
values ('qp-cameras', 'qp-cameras', true)
on conflict (id) do nothing;

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Requis pour que subscribeToReservations/Maintenance/PrinterTelemetry/FilamentColors
-- reçoivent les événements postgres_changes.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'qp_reservations'
  ) then
    alter publication supabase_realtime add table qp_reservations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'qp_filament_colors'
  ) then
    alter publication supabase_realtime add table qp_filament_colors;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'qp_printer_telemetry'
  ) then
    alter publication supabase_realtime add table qp_printer_telemetry;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'qp_maintenance'
  ) then
    alter publication supabase_realtime add table qp_maintenance;
  end if;
end $$;
