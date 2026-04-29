// supabase.js — client Supabase + auth PBKDF2 + opérations DB
import { createClient } from '@supabase/supabase-js';
import { NOW_FIXED } from './data.js';

const ADMIN_LOGIN = 'aurelien.loyer@epitech.eu';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── PBKDF2 ─────────────────────────────────────────────────────────────────

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveKey(password, salt);
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  return { hash, salt: saltHex };
}

async function verifyPassword(password, storedHash, saltHex) {
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  return await deriveKey(password, salt) === storedHash;
}

// ── Auth ───────────────────────────────────────────────────────────────────

function parseLogin(login) {
  const parts = login.split('@')[0].split('.');
  const firstName = parts[0] ? parts[0][0].toUpperCase() + parts[0].slice(1) : 'Étudiant';
  const lastName  = parts[1] ? parts[1][0].toUpperCase() + parts[1].slice(1) : '';
  return { firstName, lastName };
}

export async function registerUser(login, password) {
  if (!login.endsWith('@epitech.eu')) return { error: 'Utilise ton adresse @epitech.eu' };
  if (password.length < 6) return { error: 'Mot de passe trop court (6 caractères minimum)' };

  const { firstName, lastName } = parseLogin(login);
  const { hash, salt } = await hashPassword(password);

  const { error } = await supabase
    .from('qp_users')
    .insert({ login, first_name: firstName, last_name: lastName, hash, salt });

  if (error) {
    if (error.code === '23505') return { error: 'Ce compte existe déjà' };
    return { error: 'Erreur lors de la création du compte' };
  }
  return { user: { login, firstName, lastName } };
}

export async function loginUser(login, password) {
  const { data, error } = await supabase
    .from('qp_users')
    .select('login, first_name, last_name, hash, salt, is_admin')
    .eq('login', login)
    .single();

  if (error || !data) return { error: 'Ce compte n’existe pas' };

  const ok = await verifyPassword(password, data.hash, data.salt);
  if (!ok) return { error: 'Email ou mot de passe incorrect' };

  return {
    user: {
      login: data.login,
      firstName: data.first_name,
      lastName: data.last_name,
      isAdmin: data.is_admin || data.login === ADMIN_LOGIN,
    },
  };
}

// ── Reservations ───────────────────────────────────────────────────────────

function dbToReservation(row) {
  const startMin = Math.round(
    (new Date(row.start_at).getTime() - NOW_FIXED.getTime()) / 60_000
  );
  const durationMin = Math.round(
    (new Date(row.end_at).getTime() - new Date(row.start_at).getTime()) / 60_000
  );
  return {
    id: row.id,
    printerId: row.printer_id,
    login: row.login,
    firstName: row.first_name,
    lastName: row.last_name,
    startMin,
    durationMin,
    project: row.project,
  };
}

export async function loadReservations() {
  const { data, error } = await supabase
    .from('qp_reservations')
    .select('*')
    .order('start_at');
  if (error) { console.error('loadReservations:', error.message); return []; }
  return (data || []).map(dbToReservation);
}

export async function addReservation(r) {
  const startAt = new Date(NOW_FIXED.getTime() + r.startMin * 60_000).toISOString();
  const endAt   = new Date(NOW_FIXED.getTime() + (r.startMin + r.durationMin) * 60_000).toISOString();
  const { error } = await supabase.from('qp_reservations').insert({
    id: r.id,
    printer_id:  r.printerId,
    login:       r.login,
    first_name:  r.firstName,
    last_name:   r.lastName,
    start_at:    startAt,
    end_at:      endAt,
    project:     r.project,
  });
  if (error) console.error('addReservation:', error.message);
  return !error;
}

export async function deleteReservation(id) {
  const { error } = await supabase
    .from('qp_reservations')
    .delete()
    .eq('id', id);
  if (error) console.error('deleteReservation:', error.message);
  return !error;
}

// ── Realtime ───────────────────────────────────────────────────────────────
// Tous les utilisateurs connectés voient les réservations se mettre à jour en direct.

export function subscribeToReservations(onRefresh) {
  return supabase
    .channel('qp-reservations-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'qp_reservations' }, onRefresh)
    .subscribe();
}

// ── Admin — Filament Colors ────────────────────────────────────────────────

export async function loadFilamentColors() {
  const { data, error } = await supabase
    .from('qp_filament_colors')
    .select('*')
    .order('printer_id');
  if (error) { console.error('loadFilamentColors:', error.message); return []; }
  return data || [];
}

export async function addFilamentColor(printerId, colorName, hexColor) {
  const id = `color-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const { error } = await supabase
    .from('qp_filament_colors')
    .insert({ id, printer_id: printerId, color_name: colorName, hex_color: hexColor });
  if (error) { console.error('addFilamentColor:', error.message); return false; }
  return true;
}

export async function deleteFilamentColor(id) {
  const { error } = await supabase
    .from('qp_filament_colors')
    .delete()
    .eq('id', id);
  if (error) { console.error('deleteFilamentColor:', error.message); return false; }
  return true;
}

export async function deleteReservationAdmin(id) {
  const { error } = await supabase
    .from('qp_reservations')
    .delete()
    .eq('id', id);
  if (error) { console.error('deleteReservationAdmin:', error.message); return false; }
  return true;
}
