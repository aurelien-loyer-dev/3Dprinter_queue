# Tek3D - Setup

Planning de réservation pour les imprimantes 3D Bambu Lab de l'Epitech makerspace.
Deux parties indépendantes à mettre en route : le **frontend** (React/Vite + Supabase) et,
si tu as accès aux imprimantes physiques, le **bridge Python** qui les pilote.

## Prérequis

- Node.js 18+ et npm
- Python 3.10+ (uniquement pour le bridge)
- Un compte [Supabase](https://supabase.com) (gratuit)
- Un accès admin au réseau des imprimantes si tu configures le bridge

## 1. Projet Supabase

1. Créer un projet sur https://supabase.com
2. **Settings → API** → noter le **Project URL** et la clé **anon/public**
3. **Settings → API** → noter aussi la clé **service_role** (secrète, pour le bridge uniquement - voir §4)
4. **SQL Editor** → nouvelle query → coller tout `supabase-schema.sql` → **Run**
   - Le script est idempotent (relançable sans risque) et crée :
     - `qp_reservations`, `qp_filament_colors`, `qp_printer_telemetry`, `qp_printer_notes`, `qp_maintenance`, `qp_printer_commands`
     - le bucket Storage public `qp-cameras` (snapshots caméra + miniatures d'impression)
     - l'activation Realtime (`postgres_changes`) sur les tables qui en ont besoin
   - Vérifier dans **Table Editor** que les 6 tables existent, et dans **Storage** que `qp-cameras` est présent
5. **Edge Functions** → créer une fonction nommée `bright-action` (envoi + vérification du code OTP par email).
   Ce repo n'en contient pas le code source - elle vit uniquement dans le projet Supabase. Elle doit :
   - accepter `POST { action: "send", email }` → générer/envoyer un code OTP à `email`, en rejetant tout ce qui n'est pas `@epitech.eu`
   - accepter `POST { action: "verify", email, code }` → valider le code et répondre `ok` (ou une erreur JSON `{ error }` sinon)
   - `src/supabase.js` l'appelle avec le header `Authorization: Bearer <anon key>` (voir `callOtp()`)

## 2. Frontend

```bash
cp .env.example .env.local
```

Remplir `.env.local` avec les valeurs de l'étape 1 (URL + clé **anon**, jamais la `service_role`) :

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

```bash
npm install
npm run dev
```

- App complète : http://localhost:5173
- Vue caméra publique, sans authentification : http://localhost:5173/camera
- Mode kiosque (dashboard en lecture seule, plein écran, sans login) : ajouter `?kiosk=1` à l'URL

`npm run build` génère deux points d'entrée (`index.html` + `camera/index.html`, voir `vite.config.js`) dans `dist/`. `npm run preview` sert ce build localement.

### Compte admin

L'accès admin n'est pas un rôle en base : c'est un email codé en dur (`ADMIN_LOGIN` dans `src/supabase.js`). Pour tester les fonctionnalités admin (fenêtres de maintenance, couleurs de filament, suppression de réservations, commandes imprimante), connecte-toi avec cette adresse exacte ou modifie la constante en local.

### Ajouter/retirer une imprimante

La liste des imprimantes est statique dans `src/data.js` (`PRINTERS`) - pas de table dédiée en base. Chaque entrée a un `id` (doit correspondre à celui utilisé côté bridge, voir §4), un `name`, un `model` et un `hue` (couleur d'accent UI).

## 3. Tester sans les imprimantes physiques

Sans bridge lancé, `qp_printer_telemetry` reste vide : les imprimantes s'affichent comme si elles n'avaient jamais transmis d'état (pas de progression, pas de température). Le planning de réservations, l'auth, les notes et la maintenance fonctionnent normalement sans le bridge - seule la télémétrie/caméra live en dépend.

## 4. Bridge Python (imprimantes Bambu Lab)

Process séparé, indépendant du build Vite. Il poll chaque imprimante en MQTT toutes les 2s, normalise son état, et pousse tout dans Supabase avec la clé **service_role** (elle bypass le RLS - ne jamais l'utiliser côté frontend).

```bash
cd bridge
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Créer `bridge/config.py` (gitignored - ne jamais le commit) sur ce modèle :

```python
SUPABASE_URL = "https://xxxxx.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGc..."  # clé service_role, PAS la clé anon

PRINTERS_CONFIG = [
    {"id": "desyre", "name": "DÉSYRÉ", "ip": "192.168.1.10", "access_code": "12345678", "serial": "AC12345678"},
    # un dict par imprimante - "id" doit matcher l'entrée correspondante dans src/data.js
]
```

`access_code` et `serial` se trouvent sur l'imprimante : écran tactile → réglages → WLAN (code d'accès) / à propos (numéro de série).

```bash
python printer_bridge.py
```

Le bridge affiche l'état de chaque imprimante à chaque cycle de poll (icône + %, couches, températures). Si une imprimante est injoignable 3 cycles de suite, elle passe `offline` côté DB. Les commandes admin (stop/pause/resume) envoyées depuis l'app transitent par `qp_printer_commands` et sont exécutées au cycle de poll suivant.

## Dépannage

- **Écran de connexion qui boucle / OTP jamais reçu** → vérifier que la edge function `bright-action` est bien déployée et que l'email est en `@epitech.eu`
- **Erreurs silencieuses `Could not find the table` dans la console** → une table du §1 manque ou n'a pas été créée ; relancer `supabase-schema.sql`
- **Pas de mise à jour en direct (il faut recharger la page pour voir les changements)** → vérifier que Realtime est actif sur les tables concernées (**Database → Replication** dans le dashboard Supabase, ou relancer la section Realtime de `supabase-schema.sql`)
- **Caméra/miniatures qui ne s'affichent pas** → vérifier que le bucket `qp-cameras` existe et est public (**Storage** dans le dashboard)
- **Le bridge tourne mais rien ne bouge dans l'app** → vérifier `bridge/config.py` (URL + clé **service_role**, pas la clé anon) et que l'IP/access_code/serial de chaque imprimante sont corrects

## Structure

- `src/supabase.js` → client Supabase : auth (OTP email), réservations, admin (filament, notes, maintenance, commandes), lecture télémétrie
- `src/data.js` → données statiques (`PRINTERS`) + helpers de temps/statut, aucun appel DB
- `src/App.jsx` → shell principal (dashboard/liste/caméra/kiosque), merge réservations + télémétrie live
- `src/screens.jsx` → écrans d'authentification
- `src/AdminPanel.jsx`, `src/PrinterCard.jsx`, `src/ReserveModal.jsx`, `src/StatsPanel.jsx`, `src/TweaksPanel.jsx`, `src/ui.jsx` → UI
- `bridge/printer_bridge.py` → pont MQTT/FTPS ↔ Supabase pour les imprimantes physiques
- `supabase-schema.sql` → schéma BD complet (tables, RLS, bucket Storage, Realtime)
