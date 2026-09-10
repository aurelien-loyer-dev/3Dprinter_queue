#!/usr/bin/env python3
"""
TEK3D — Bambu Lab Bridge
Lit l'état des imprimantes via MQTT et pousse les données vers Supabase.
Lancement : source venv/bin/activate && python printer_bridge.py
"""

import sys, time, json, socket, requests, threading
from io import BytesIO
from datetime import datetime, timezone
import bambulabs_api as bl
from config import PRINTERS_CONFIG, SUPABASE_URL, SUPABASE_SERVICE_KEY
try:
    from PIL import Image
except Exception:
    Image = None

# ── Silencer le bruit MQTT (threads de fond) ──────────────────────────────────
_NOISE = ("Error occurred:", "Printer Values Not Available Yet",
          "Not connected to the MQTT", "Disconnected", "Connection refused")
class _Q:
    def __init__(self, r): self._r = r
    def write(self, s):
        if not s.strip() or not any(n in s for n in _NOISE): self._r.write(s)
    def flush(self): self._r.flush()
    def __getattr__(self, a): return getattr(self._r, a)
sys.stdout = _Q(sys.stdout)
sys.stderr = _Q(sys.stderr)

POLL = 2

# Printers récemment arrêtés manuellement — on ignore l'état Bambu pendant 20s
_stop_grace: dict[str, float] = {}
STOP_GRACE_SEC = 20

STATE_MAP = {
    "IDLE": "idle", "FINISH": "idle", "FINISHED": "idle", "SLICING": "idle",
    "PRINT": "printing", "PRINTING": "printing", "PREPARE": "printing", "RUNNING": "printing",
    "PAUSE": "paused", "PAUSED": "paused",
    "FAILED": "error", "ERROR": "error",
}


# ── Supabase ──────────────────────────────────────────────────────────────────

def test_supabase() -> bool:
    """Vérifie que la table existe et que la clé est valide."""
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/qp_printer_telemetry?limit=1",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
            timeout=5,
        )
        if r.status_code == 404:
            print("  ✗ Table qp_printer_telemetry introuvable — exécute le SQL dans Supabase")
            return False
        if not r.ok:
            print(f"  ✗ Supabase erreur {r.status_code}: {r.text}")
            return False
        print(f"  ✓ Supabase OK ({SUPABASE_URL})")
        return True
    except Exception as e:
        print(f"  ✗ Supabase inaccessible: {e}")
        return False


def is_printer_reachable(ip: str, port: int = 8883, timeout: float = 3.0) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except Exception:
        return False



def execute_commands(conns: dict) -> None:
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/qp_printer_commands?status=eq.pending&order=created_at.asc",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
            timeout=5,
        )
        if not r.ok:
            return
        commands = r.json()
    except Exception:
        return

    for cmd in commands:
        cmd_id = cmd["id"]
        pid    = cmd["printer_id"]
        action = cmd["command"]
        p      = conns.get(pid)

        status = "error"
        if p:
            try:
                mc  = p.mqtt_client
                seq = str(mc.get_sequence_id() + 1)
                payload = {"print": {"sequence_id": seq, "command": action, "user_id": "1234567890"}}
                ok = mc._PrinterMQTTClient__publish_command(payload)
                status = "done" if ok else "error"
                print(f"  🎮 {pid} → {action} (seq={seq}): {'OK' if ok else 'KO'}")
                if ok and action == "stop":
                    _stop_grace[pid] = time.monotonic()
                    upsert(pid, {"state": "idle"})  # Juste idle, sans les None
                    print(f"  ✅ {pid}: idle forcé après stop")

            except Exception as e:
                print(f"  🎮 {pid} → {action}: erreur ({e})")

        try:
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/qp_printer_commands?id=eq.{cmd_id}",
                headers={"apikey": SUPABASE_SERVICE_KEY,
                         "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                         "Content-Type": "application/json"},
                json={"status": status},
                timeout=5,
            )
        except Exception:
            pass


def upsert(printer_id: str, data: dict) -> bool:
    try:
        # Les colonnes NOT NULL (state, printer_id) sont toujours présentes dans data.
        # Les autres (ams_colors, progress…) sont nullables → on les envoie même à None.
        payload = {
            "printer_id": printer_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            **data,
        }
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/qp_printer_telemetry",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                     "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates"},
            json=payload,
            timeout=10,
        )
        if not r.ok:
            print(f"    Supabase {r.status_code}: {r.text[:120]}")
        return r.ok
    except Exception as e:
        print(f"    Supabase error: {e}")
        return False


# ── Lecture imprimante ────────────────────────────────────────────────────────

def get_state(p: bl.Printer) -> str:
    try:
        raw = str(p.get_state())
        if "Not Available" in raw or raw in ("None", ""):
            return "connecting"
        normalized = raw.split(".")[-1].upper()
        if normalized in STATE_MAP:
            return STATE_MAP[normalized]
        if any(token in normalized for token in ("PRINT", "RUN", "WORK", "EXEC", "PROCESS", "BUSY")):
            return "printing"
        if "PAUSE" in normalized:
            return "paused"
        if any(token in normalized for token in ("FAIL", "ERROR", "ALARM")):
            return "error"
        return "idle"
    except Exception as e:
        return "connecting" if "Not Available" in str(e) else "offline"



def get_ams_data(p: bl.Printer) -> dict | None:
    """
    Extrait les couleurs AMS et le slot actif.
    Retourne {"colors": [...], "active": int} si le hub est trouvé (colors peut être vide).
    Retourne None si le hub est introuvable (MQTT pas encore prêt → ne pas toucher la DB).
    """
    hub_found = False
    # tray_id global (ams_id*4 + tray_id local) → couleur — garde le vrai numéro
    # de slot pour ne pas désaligner l'index quand un slot vide est sauté.
    tray_colors: dict[int, str] = {}
    try:
        hub = p.ams_hub()
        if not hub:
            return None  # Hub introuvable = MQTT pas prêt, on ne touche pas la DB
        hub_found = True
        ams_dict = getattr(hub, "ams_hub", {})
        for ams_id, ams_obj in sorted(ams_dict.items()):
            trays = getattr(ams_obj, "filament_trays", {})
            tray_items = trays.items() if isinstance(trays, dict) else enumerate(trays)
            for tray_id, t in tray_items:
                c = getattr(t, "tray_color", None)
                if c and isinstance(c, str) and len(c) >= 6:
                    global_id = int(ams_id) * 4 + int(tray_id)
                    tray_colors[global_id] = f"#{c[:6].upper()}"
    except Exception:
        if not hub_found:
            return None  # Exception avant d'avoir le hub = MQTT pas prêt

    ordered_ids = sorted(tray_colors)
    colors = [tray_colors[i] for i in ordered_ids]

    result: dict = {"colors": colors}
    if colors:
        try:
            raw_ams = p.mqtt_client._data.get("print", {}).get("ams", {})
            tray_now_str = raw_ams.get("tray_now")
            if tray_now_str is not None:
                tray_now = int(tray_now_str)
                if tray_now in tray_colors:
                    result["active"] = ordered_ids.index(tray_now)
        except Exception:
            pass

    return result



def _try(p, *methods):
    """Try several method names; return first non-empty result."""
    for m in methods:
        try:
            v = getattr(p, m)()
            if v is not None and str(v) not in ("", "None"):
                return v
        except Exception:
            pass
    return None


def _temp(p, *methods) -> float | None:
    v = _try(p, *methods)
    try:
        f = float(v)
        return round(f, 1) if f > 0 else None
    except (TypeError, ValueError):
        return None


def get_camera_jpeg_bytes(p: bl.Printer) -> bytes | None:
    if Image is None:
        return None
    try:
        if not p.camera_client_alive():
            return None
        try:
            p.camera_start()
        except Exception:
            pass
        frame = p.get_camera_image()
        if frame is None or not hasattr(frame, 'convert'):
            return None
        img = frame
        if img.width and img.width > 960:
            new_height = max(1, int(img.height * 960 / img.width))
            img = img.resize((960, new_height))
        buf = BytesIO()
        img.save(buf, format='JPEG', quality=72, optimize=True)
        return buf.getvalue()
    except Exception:
        return None


_last_camera_upload: dict[str, float] = {}
CAMERA_MIN_INTERVAL = 5.0  # secondes minimum entre deux uploads Storage

_last_thumbnail_file: dict[str, str] = {}  # printer_id → dernier gcode_file uploadé


def get_thumbnail_via_ftps(ip: str, access_code: str, gcode_file: str) -> bytes | None:
    """
    Télécharge le thumbnail depuis le FTPS du printer (port 990).
    Le fichier .3mf est un ZIP contenant Metadata/thumbnail/*.png.
    """
    import ssl, ftplib, zipfile
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        ftp = ftplib.FTP_TLS(context=ctx)
        ftp.connect(ip, 990, timeout=6)
        ftp.auth()
        ftp.login('bblp', access_code)
        ftp.prot_p()

        buf = BytesIO()
        # Bambu stocke le fichier dans /cache/ ou /timelapse/
        for path in (f"/cache/{gcode_file}", f"/timelapse/{gcode_file}"):
            buf.seek(0); buf.truncate()
            try:
                ftp.retrbinary(f"RETR {path}", buf.write)
                if buf.tell() > 0:
                    break
            except Exception:
                continue

        try: ftp.quit()
        except Exception: pass

        data = buf.getvalue()
        if not data:
            return None

        # Extraire le thumbnail du ZIP (.3mf)
        with zipfile.ZipFile(BytesIO(data)) as z:
            candidates = [n for n in z.namelist()
                          if 'thumbnail' in n.lower() and n.endswith('.png')]
            # Préférer la plus grande résolution
            candidates.sort(key=lambda n: (
                int(n.split('_')[-1].replace('.png', '').split('x')[0])
                if '_' in n and n.replace('.png','').split('_')[-1][0].isdigit() else 0
            ), reverse=True)
            if candidates:
                return z.read(candidates[0])

    except Exception:
        pass
    return None


def upload_thumbnail(printer_id: str, current_file: str, thumb_bytes: bytes) -> bool:
    """Upload le thumbnail uniquement si le fichier imprimé a changé."""
    if _last_thumbnail_file.get(printer_id) == current_file:
        return False  # même fichier, pas besoin de ré-uploader
    try:
        path = f"{printer_id}/thumbnail.png"
        r = requests.post(
            f"{SUPABASE_URL}/storage/v1/object/qp-cameras/{path}",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "image/png",
                "x-upsert": "true",
            },
            data=thumb_bytes,
            timeout=8,
        )
        if r.ok:
            _last_thumbnail_file[printer_id] = current_file
            return True
        print(f"    [thumbnail] upload {printer_id}: {r.status_code} {r.text[:80]}")
        return False
    except Exception as e:
        print(f"    [thumbnail] upload {printer_id}: {e}")
        return False


def upload_camera(printer_id: str, jpeg_bytes: bytes) -> bool:
    """Upload le JPEG dans Supabase Storage (bucket qp-cameras) et retourne True si uploadé."""
    now = time.monotonic()
    if now - _last_camera_upload.get(printer_id, 0) < CAMERA_MIN_INTERVAL:
        return False
    try:
        path = f"{printer_id}/latest.jpg"
        r = requests.post(
            f"{SUPABASE_URL}/storage/v1/object/qp-cameras/{path}",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "image/jpeg",
                "x-upsert": "true",
            },
            data=jpeg_bytes,
            timeout=8,
        )
        if r.ok:
            _last_camera_upload[printer_id] = now
            return True
        print(f"    [camera] upload {printer_id}: {r.status_code} {r.text[:80]}")
        return False
    except Exception as e:
        print(f"    [camera] upload {printer_id}: {e}")
        return False


def read_printer(p: bl.Printer, printer_id: str = "", printer_ip: str = "", access_code: str = "") -> dict:
    state = get_state(p)
    data  = {"state": state}

    if state in ("printing", "paused"):
        try:
            pct = p.get_percentage()
            if pct is not None:
                data["progress"] = int(pct or 0)
        except Exception:
            pass

        try:
            raw = p.get_time()  # mc_remaining_time — déjà en minutes
            if raw is not None:
                v = float(raw)
                data["remaining_min"] = max(0, int(v)) if v > 0 else None
        except Exception:
            pass

        for method in ("get_file_name", "gcode_file"):
            try:
                file_name = getattr(p, method)()
                if file_name and str(file_name) not in ("", "None"):
                    data["current_file"] = str(file_name)
                    break
            except Exception:
                pass

        layer = _try(p, "current_layer_num")
        total = _try(p, "total_layer_num")
        if layer is not None:
            try: data["layer_current"] = int(layer)
            except (TypeError, ValueError): pass
        if total is not None:
            try: data["layer_total"] = int(total)
            except (TypeError, ValueError): pass

    # Températures (toujours lire, même idle — la buse refroidit après impression)
    nozzle  = _temp(p, "get_nozzle_temperature")
    bed     = _temp(p, "get_bed_temperature")
    chamber = _temp(p, "get_chamber_temperature")
    if nozzle  is not None: data["nozzle_temp"]  = nozzle
    if bed     is not None: data["bed_temp"]     = bed
    if chamber is not None: data["chamber_temp"] = chamber

    # Erreur — et correction du state selon le code erreur
    # Si l'impression est en cours ou en pause sans erreur, on efface le code résiduel
    if state in ("printing", "paused"):
        data["error_code"] = None

    err = _try(p, "print_error_code")
    err_int = None
    if err is not None:
        try:
            err_int = int(err)
            data["error_code"] = err_int if err_int != 0 else None
        except (TypeError, ValueError):
            data["error_code"] = None

    # Codes Bambu Lab correspondant à une annulation propre par l'utilisateur
    CANCEL_CODES = {
        0,          # pas d'erreur
        50348044,   # 0x0300400C — stopped by user
    }

    if err_int is not None:
        is_cancel = err_int in CANCEL_CODES
        # PAUSE + code erreur réel = vrai problème (bourrage, runout…)
        if state == "paused" and not is_cancel:
            data["state"] = "error"
        # FAILED/error + annulation = idle — on nettoie tous les champs de l'impression
        elif state == "error" and is_cancel:
            data["state"] = "idle"
            for key in ("error_code", "progress", "remaining_min",
                        "current_file", "layer_current", "layer_total"):
                data.pop(key, None)
                data[key] = None  # force la remise à NULL en DB

    ams = get_ams_data(p)
    if ams is not None:
        # Hub trouvé → on envoie (colors peut être [] si filament retiré)
        data["ams_colors"] = json.dumps(ams)
    # ams is None → hub introuvable (MQTT pas prêt) → on ne touche pas la DB

    if state in ("printing", "paused"):
        jpeg_bytes = get_camera_jpeg_bytes(p)
        if jpeg_bytes and upload_camera(printer_id, jpeg_bytes):
            data["camera_version"] = int(time.time())

        current_file = data.get("current_file", "")
        if current_file and printer_ip and access_code:
            thumb_bytes = get_thumbnail_via_ftps(printer_ip, access_code, current_file)
            if thumb_bytes and upload_thumbnail(printer_id, current_file, thumb_bytes):
                data["thumbnail_version"] = int(time.time())

    return data


def connect_printer(cfg: dict) -> bl.Printer | None:
    try:
        p = bl.Printer(cfg["ip"], cfg["access_code"], cfg["serial"])
        p.connect()
        return p
    except Exception as e:
        print(f"  ✗  {cfg['name']} — {e}")
        return None


# ── Boucle principale ─────────────────────────────────────────────────────────

MAX_FAILURES = 3

def poll_one(cfg: dict, conns: dict, failures: dict, connecting: dict, lock: threading.Lock) -> None:
    pid, name = cfg["id"], cfg["name"]

    with lock:
        has_conn = pid in conns

    if not has_conn:
        p = connect_printer(cfg)
        with lock:
            if p:
                conns[pid] = p
                failures[pid] = 0
            else:
                upsert(pid, {"state": "offline"})
                return

    try:
        if not is_printer_reachable(cfg["ip"]):
            with lock:
                failures[pid] += 1
                count = failures[pid]
                connecting[pid] = 0
            print(f"  💤 {name}: hors ligne/réseau indisponible ({count}/{MAX_FAILURES})")
            if count >= MAX_FAILURES:
                with lock:
                    p = conns.pop(pid, None)
                    failures[pid] = 0
                if p:
                    try: p.disconnect()
                    except: pass
                upsert(pid, {"state": "offline"})
            return

        with lock:
            p = conns.get(pid)
        if p is None:
            return

        data = read_printer(p, pid, cfg["ip"], cfg["access_code"])

        # Ignorer les états Bambu pendant la période de grâce après un stop
        now = time.monotonic()
        if pid in _stop_grace and now - _stop_grace[pid] < STOP_GRACE_SEC:
            # Forcer idle pendant la grâce (ignore l'état "printing" que Bambu tente de remettre)
            if data["state"] != "idle":
                print(f"  🛑 {name}: grace period, ignore {data['state']} → idle")
                data = {"state": "idle"}  # Remplacer complètement le data, pas de None
        else:
            # Grâce expirée, nettoyer
            _stop_grace.pop(pid, None)

        if data["state"] == "connecting":
            with lock:
                connecting[pid] += 1
                count = connecting[pid]
            print(f"  ⏳ {name}: attente MQTT... ({count}/{MAX_FAILURES})")
            if count >= MAX_FAILURES:
                with lock:
                    p = conns.pop(pid, None)
                    connecting[pid] = 0
                if p:
                    try: p.disconnect()
                    except: pass
                upsert(pid, {"state": "offline"})
            return

        with lock:
            connecting[pid] = 0
            failures[pid]   = 0

        ok    = upsert(pid, data)
        icons = {"printing": "🖨 ", "paused": "⏸ ", "error": "⚠️ ", "idle": "✅", "offline": "💤"}
        pct   = f" {data.get('progress','')}%" if data["state"] == "printing" else ""
        layer = (f" [{data['layer_current']}/{data['layer_total']}]"
                 if "layer_current" in data and "layer_total" in data else "")
        temps = ""
        if "nozzle_temp" in data:
            temps = f" 🌡{data['nozzle_temp']}°"
            if "bed_temp" in data: temps += f"/{data['bed_temp']}°"
        ams = f" 🎨{data['ams_colors']}" if data.get("ams_colors") else ""
        err = f" ❌{data['error_code']}" if data.get("error_code") else ""
        print(f"  {icons.get(data['state'],'❓')} {name}: {data['state']}{pct}{layer}{temps}{ams}{err}{'' if ok else ' [supabase ✗]'}")

    except Exception as e:
        with lock:
            failures[pid] += 1
            count = failures[pid]
        print(f"  ⚠️  {name}: {e} ({count}/{MAX_FAILURES})")
        if count >= MAX_FAILURES:
            with lock:
                p = conns.pop(pid, None)
                failures[pid] = 0
            if p:
                try: p.disconnect()
                except: pass
            upsert(pid, {"state": "offline"})


def main():
    conns:      dict[str, bl.Printer] = {}
    failures:   dict[str, int]        = {c["id"]: 0 for c in PRINTERS_CONFIG}
    connecting: dict[str, int]        = {c["id"]: 0 for c in PRINTERS_CONFIG}
    lock = threading.Lock()

    print("TEK3D Bridge\n")

    print("Vérification Supabase...")
    if not test_supabase():
        print("\n→ Crée la table (SQL dans supabase-schema.sql) puis relance.")
        return

    print("\nConnexion aux imprimantes...\n")
    init_threads = []
    for cfg in PRINTERS_CONFIG:
        def _init(c=cfg):
            p = connect_printer(c)
            with lock:
                if p:
                    conns[c["id"]] = p
                    print(f"  ✓  {c['name']}  ({c['ip']})")
                else:
                    upsert(c["id"], {"state": "offline"})
        t = threading.Thread(target=_init, daemon=True)
        t.start()
        init_threads.append(t)
    for t in init_threads:
        t.join()

    print(f"\nPoll toutes les {POLL}s — Ctrl+C pour arrêter\n")
    time.sleep(8)

    while True:
        threads = [
            threading.Thread(target=poll_one, args=(cfg, conns, failures, connecting, lock), daemon=True)
            for cfg in PRINTERS_CONFIG
        ]
        for t in threads: t.start()
        for t in threads: t.join(timeout=POLL - 0.5)

        execute_commands(conns)
        print()
        time.sleep(POLL)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nArrêt du bridge.")
