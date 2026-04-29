# QueuePrint — Configuration Supabase

## 1️⃣ Créer un projet Supabase

1. Allez sur https://supabase.com et connectez-vous
2. Créez un nouveau projet (ou utilisez un existant)
3. Notez votre **URL** et votre **clé anonyme** depuis Settings > API

## 2️⃣ Configurer la base de données

1. Allez dans l'éditeur SQL de Supabase
2. Collez le contenu de `supabase-schema.sql`
3. Exécutez les requêtes pour créer les tables et les politiques

## 3️⃣ Variables d'environnement

Créez un fichier `.env.local` (à côté de `package.json`) avec :

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

Remplacez par vos vraies valeurs depuis Supabase > Settings > API.

## 4️⃣ Démarrer l'appli

```bash
npm run dev
```

Ouvrez http://localhost:5173

---

## 🎯 Fonctionnalités

✅ **Auth** : Inscription/connexion avec PBKDF2 (SHA-256, 100k iterations)  
✅ **Réservations** : Crée, supprime, consulte en temps réel  
✅ **Realtime** : Tous les utilisateurs voient les changements en direct  
✅ **RLS** : Accès public via clé anon (sécurisé par Supabase)

---

## 🔧 Développement

Pour nettoyer et recréer la base :
1. Dans Supabase, allez dans SQL Editor
2. Supprimez les tables existantes
3. Collez et exécutez à nouveau `supabase-schema.sql`

---

## 📚 Structure

- `src/supabase.js` → Client Supabase + auth PBKDF2 + CRUD réservations
- `src/data.js` → Données statiques + helpers métier
- `src/App.jsx` → Shell principal + gestion UI
- `src/screens.jsx` → Composants Auth + Panels
- `supabase-schema.sql` → Schéma BD + RLS
