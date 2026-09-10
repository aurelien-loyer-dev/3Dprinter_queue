# Tek3D — Configuration

## 1. Projet Supabase

1. Créer un projet sur https://supabase.com
2. Settings > API → noter **Project URL** et **anon key**
3. SQL Editor → coller et exécuter tout le contenu de `supabase-schema.sql` (idempotent, peut être rejoué sans risque)
4. Créer l'edge function `bright-action` (envoi/vérification du code OTP, restreint aux adresses `@epitech.eu`) — ce repo n'en contient pas la source, elle vit dans le projet Supabase
5. Storage → créer le bucket public `qp-cameras` (photos caméra + miniatures des impressions)

## 2. Variables d'environnement

```bash
cp .env.example .env.local
```

Remplir avec les valeurs de l'étape 1 :

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

## 3. Frontend

```bash
npm install
npm run dev
```

- App complète : http://localhost:5173
- Vue caméra publique (sans auth) : http://localhost:5173/camera

## 4. Bridge Python (imprimantes Bambu Lab)

Process séparé, pas buildé par Vite — il poll les imprimantes en MQTT et pousse l'état dans Supabase.

```bash
cd bridge
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Créer `bridge/config.py` (gitignored — jamais commit) avec les IP/access codes/serials des imprimantes et la clé `service_role` Supabase (bypass RLS, ne jamais l'utiliser côté client). Puis :

```bash
python printer_bridge.py
```

## Structure

- `src/supabase.js` → client Supabase, auth (OTP email), réservations, admin, télémétrie
- `src/data.js` → données statiques (`PRINTERS`) + helpers de temps/statut, pas d'appel DB
- `src/App.jsx` → shell principal (dashboard/liste/caméra, merge réservations + télémétrie live)
- `src/screens.jsx` → écrans d'auth
- `bridge/printer_bridge.py` → pont MQTT ↔ Supabase pour les imprimantes physiques
- `supabase-schema.sql` → schéma BD + RLS
