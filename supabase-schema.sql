-- QueuePrint — à coller dans l'éditeur SQL de ton projet Supabase
-- Les utilisateurs sont gérés par Supabase Auth (Authentication > Users).
-- Pas besoin de table qp_users, les mots de passe sont gérés par Supabase.

-- ── Réservations ─────────────────────────────────────────────────────────────

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

alter table qp_reservations enable row level security;
create policy "read reservations"   on qp_reservations for select using (true);
create policy "insert reservations" on qp_reservations for insert with check (true);
create policy "delete reservations" on qp_reservations for delete using (true);

-- ── Couleurs de filament par imprimante (admin) ───────────────────────────────

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


-- ── Configuration Supabase Auth requise ──────────────────────────────────────
-- 1. Authentication > Settings :
--    - "Enable email confirmations" : ON
--    - "Email OTP Expiry" : 600 (10 min)
--
-- 2. Authentication > Email Templates > "Confirm signup" :
--    Remplace le body par quelque chose contenant : {{ .Token }}
--    Exemple :
--      Ton code de vérification QueuePrint : <strong>{{ .Token }}</strong>
--
-- 3. Authentication > URL Configuration :
--    Site URL : http://localhost:5173 (dev) ou ton domaine de prod
