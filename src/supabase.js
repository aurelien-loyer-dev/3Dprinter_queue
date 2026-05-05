// supabase.js — client + auth (Supabase Auth) + DB
import { createClient } from '@supabase/supabase-js';
import { NOW_FIXED } from './data.js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function maybeLogDbError(label, error) {
  if (!error) return;
  const msg = (error && error.message) ? error.message : String(error);
  if (msg.includes('Could not find the table')) return; // supabase schema cache missing table — ignore
  console.error(`${label}:`, msg);
}

const ADMIN_LOGIN = 'aurelien.loyer@epitech.eu';

// ── Auth helpers ───────────────────────────────────────────────────────────

function parseLogin(login) {
  const parts = login.split('@')[0].split('.');
  const firstName = parts[0] ? parts[0][0].toUpperCase() + parts[0].slice(1) : 'Étudiant';
  const lastName  = parts[1] ? parts[1][0].toUpperCase() + parts[1].slice(1) : '';
  return { firstName, lastName };
}

function supabaseUserToMe(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    login: user.email,
    firstName: meta.first_name || '',
    lastName:  meta.last_name  || '',
    isAdmin:   user.email === ADMIN_LOGIN,
  };
}

// ── Session ────────────────────────────────────────────────────────────────

export async function getSessionUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return supabaseUserToMe(session?.user ?? null);
}

// Appeler dans App au mount. Retourne une fonction de nettoyage.
export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(supabaseUserToMe(session?.user ?? null));
  });
  return () => subscription.unsubscribe();
}

// ── Edge Function helper ───────────────────────────────────────────────────

async function callOtp(action, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bright-action`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action, ...body }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    return res;
  } catch {
    clearTimeout(timeout);
    return { ok: false, json: async () => ({ error: 'Impossible de contacter le serveur' }) };
  }
}

// ── Commandes imprimante ───────────────────────────────────────────────────────

export async function sendPrinterCommand(printerId, command) {
  const { error } = await supabase
    .from('qp_printer_commands')
    .insert({ printer_id: printerId, command });
  if (error) { maybeLogDbError('sendPrinterCommand', error); return false; }
  return true;
}

// ── Register — envoie juste le code, le compte est créé après vérification ──

export async function registerUser(login, password) {
  if (!login.endsWith('@epitech.eu')) return { error: 'Utilise ton adresse @epitech.eu' };
  if (password.length < 6) return { error: 'Mot de passe trop court (6 caractères minimum)' };

  const res = await callOtp('send', { email: login });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: data.error || "Erreur lors de l'envoi du code" };
  }

  return { pendingVerification: true };
}

// ── Verify OTP puis créer le compte ───────────────────────────────────────

export async function verifyOtpAndSignUp(login, password, code) {
  // 1. Vérifie le code
  const res = await callOtp('verify', { email: login, code: code.trim() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: data.error || 'Code invalide ou expiré' };
  }

  // 2. Code valide → crée le compte Supabase (auto-confirmé)
  const { firstName, lastName } = parseLogin(login);
  const { data, error } = await supabase.auth.signUp({
    email: login,
    password,
    options: { data: { first_name: firstName, last_name: lastName } },
  });

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      return { error: 'Ce compte existe déjà, connecte-toi depuis la page de connexion.' };
    }
    return { error: 'Erreur lors de la création du compte' };
  }

  return { user: supabaseUserToMe(data.user) };
}

// ── Login ──────────────────────────────────────────────────────────────────

export async function loginUser(login, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: login, password });
  if (error) return { error: 'Email ou mot de passe incorrect' };
  return { user: supabaseUserToMe(data.user) };
}

// ── Logout ─────────────────────────────────────────────────────────────────

export async function logoutUser() {
  await supabase.auth.signOut();
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
  if (error) { maybeLogDbError('loadReservations', error); return []; }
  return (data || []).map(dbToReservation);
}

export async function addReservation(r) {
  const startAt = new Date(NOW_FIXED.getTime() + r.startMin * 60_000).toISOString();
  const endAt   = new Date(NOW_FIXED.getTime() + (r.startMin + r.durationMin) * 60_000).toISOString();
  const { error } = await supabase.from('qp_reservations').insert({
    id: r.id, printer_id: r.printerId,
    login: r.login, first_name: r.firstName, last_name: r.lastName,
    start_at: startAt, end_at: endAt, project: r.project,
  });
  if (error) maybeLogDbError('addReservation', error);
  return !error;
}

export async function deleteReservation(id) {
  const { error } = await supabase.from('qp_reservations').delete().eq('id', id);
  if (error) maybeLogDbError('deleteReservation', error);
  return !error;
}

export function subscribeToReservations(onRefresh, onStatus) {
  return supabase
    .channel('qp-reservations-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'qp_reservations' }, onRefresh)
    .subscribe(onStatus ?? (() => {}));
}

// ── Admin — Filament colors ────────────────────────────────────────────────

export async function loadFilamentColors() {
  const { data, error } = await supabase
    .from('qp_filament_colors').select('*').order('printer_id');
  if (error) { maybeLogDbError('loadFilamentColors', error); return []; }
  return data || [];
}

export async function addFilamentColor(printerId, colorName, hexColor) {
  const id = `color-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const { error } = await supabase.from('qp_filament_colors')
    .insert({ id, printer_id: printerId, color_name: colorName, hex_color: hexColor });
  if (error) { maybeLogDbError('addFilamentColor', error); return false; }
  return true;
}

export async function deleteFilamentColor(id) {
  const { error } = await supabase.from('qp_filament_colors').delete().eq('id', id);
  if (error) { maybeLogDbError('deleteFilamentColor', error); return false; }
  return true;
}

export function subscribeToFilamentColors(onRefresh) {
  return supabase
    .channel('qp-filament-colors-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'qp_filament_colors' }, onRefresh)
    .subscribe();
}

// Alias pour l'AdminPanel
export const deleteReservationAdmin = deleteReservation;

// ── Printer notes ──────────────────────────────────────────────────────────

export async function loadPrinterNotes(printerId) {
  const { data, error } = await supabase
    .from('qp_printer_notes')
    .select('*')
    .eq('printer_id', printerId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) { maybeLogDbError('loadPrinterNotes', error); return []; }
  return data || [];
}

export async function addPrinterNote(printerId, content, me) {
  const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const { error } = await supabase.from('qp_printer_notes').insert({
    id, printer_id: printerId, content,
    author_login: me.login,
    author_name: `${me.firstName} ${me.lastName}`,
  });
  if (error) { maybeLogDbError('addPrinterNote', error); return false; }
  return true;
}

export async function deletePrinterNote(id) {
  const { error } = await supabase.from('qp_printer_notes').delete().eq('id', id);
  if (error) { maybeLogDbError('deletePrinterNote', error); return false; }
  return true;
}

// ── Maintenance ────────────────────────────────────────────────────────────

export async function loadMaintenance() {
  const { data, error } = await supabase.from('qp_maintenance').select('*');
  if (error) { maybeLogDbError('loadMaintenance', error); return []; }
  return data || [];
}

export async function setMaintenance(printerId, message, returnAt, me) {
  const { error } = await supabase.from('qp_maintenance').upsert({
    printer_id: printerId,
    message,
    return_at: returnAt || null,
    set_by: me.login,
  }, { onConflict: 'printer_id' });
  if (error) { maybeLogDbError('setMaintenance', error); return false; }
  return true;
}

export async function clearMaintenance(printerId) {
  const { error } = await supabase.from('qp_maintenance').delete().eq('printer_id', printerId);
  if (error) { maybeLogDbError('clearMaintenance', error); return false; }
  return true;
}

export function subscribeToMaintenance(onRefresh) {
  return supabase
    .channel('qp-maintenance-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'qp_maintenance' }, onRefresh)
    .subscribe();
}

// ── Télémétrie Bambu Lab ───────────────────────────────────────────────────

export async function loadPrinterTelemetry() {
  const { data, error } = await supabase
    .from('qp_printer_telemetry')
    .select('printer_id,state,progress,remaining_min,current_file,layer_current,layer_total,nozzle_temp,bed_temp,chamber_temp,speed_level,error_code,current_stage,ams_colors,updated_at');
  if (error) { maybeLogDbError('loadPrinterTelemetry', error); return {}; }
  return Object.fromEntries((data || []).map(r => [r.printer_id, r]));
}

export async function loadPrinterCameraTelemetry() {
  const { data, error } = await supabase
    .from('qp_printer_telemetry')
    .select('printer_id,state,camera_jpeg,updated_at');
  if (error) { maybeLogDbError('loadPrinterCameraTelemetry', error); return {}; }
  return Object.fromEntries((data || []).map(r => [r.printer_id, r]));
}

export function subscribeToPrinterTelemetry(onRefresh) {
  // Shared channel + callback registry to avoid calling `.on` on an already-subscribed
  // channel (Supabase realtime client forbids adding postgres_changes callbacks
  // after subscribe()). We create a single channel and forward events to
  // all registered listeners.
  if (!globalThis.__qpTelemetry) {
    globalThis.__qpTelemetry = { callbacks: new Set(), channel: null };
  }

  const registry = globalThis.__qpTelemetry;

  // ensure channel exists
  if (!registry.channel) {
    const name = `qp-telemetry-live-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    try {
      registry.channel = supabase
        .channel(name)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'qp_printer_telemetry' }, () => {
          registry.callbacks.forEach(cb => {
            try { cb(); } catch (e) { console.error('telemetry callback error:', e); }
          });
        })
        .subscribe();
    } catch (e) {
      // In some dev/HMR scenarios the client returns an already-subscribed channel
      // and calling `.on` will throw. Fall back to polling to keep UI functional.
      console.warn('subscribeToPrinterTelemetry: realtime channel setup failed, falling back to polling —', e.message);
      if (!registry.pollers) registry.pollers = new Map();
      const id = setInterval(() => registry.callbacks.forEach(cb => { try { cb(); } catch {} }), 15_000);
      registry.pollers.set(name, id);
    }
  }

  registry.callbacks.add(onRefresh);

  return {
    unsubscribe: () => {
      registry.callbacks.delete(onRefresh);
      if (registry.callbacks.size === 0 && registry.channel) {
        try { registry.channel.unsubscribe(); } catch {};
        registry.channel = null;
      }
    }
  };
}
