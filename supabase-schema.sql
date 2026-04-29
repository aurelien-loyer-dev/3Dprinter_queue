-- QueuePrint — à coller dans l'éditeur SQL de ton projet Supabase

create table qp_users (
  id         uuid default gen_random_uuid() primary key,
  login      text unique not null,
  first_name text not null,
  last_name  text not null,
  hash       text not null,
  salt       text not null,
  is_admin   boolean default false,
  created_at timestamptz default now()
);

create table qp_reservations (
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

-- Row Level Security : accès public (clé anon suffit)
alter table qp_users        enable row level security;
alter table qp_reservations enable row level security;

create policy "insert users"        on qp_users        for insert with check (true);
create policy "read users"          on qp_users        for select using (true);

create policy "read reservations"   on qp_reservations for select using (true);
create policy "insert reservations" on qp_reservations for insert with check (true);
create policy "delete reservations" on qp_reservations for delete using (true);

-- Filament colors per printer
create table qp_filament_colors (
  id         text primary key,
  printer_id text not null,
  color_name text not null,
  hex_color  text not null,
  created_at timestamptz default now()
);

alter table qp_filament_colors enable row level security;
create policy "read filament colors"   on qp_filament_colors for select using (true);
create policy "insert filament colors" on qp_filament_colors for insert with check (true);
create policy "delete filament colors" on qp_filament_colors for delete using (true);

-- Réservations passées auto-supprimées au bout de 7 jours (optionnel)
-- À activer dans Supabase > Database > Extensions : pg_cron
