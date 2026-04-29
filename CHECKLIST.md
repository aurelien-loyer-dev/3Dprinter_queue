# 📋 Checklist — Configuration & Test

## 🔐 Étape 1 : Créer un projet Supabase

- [ ] Aller sur https://supabase.com
- [ ] Se connecter / créer un compte
- [ ] Créer un nouveau projet
- [ ] Attendre que la base soit prête (~1 min)
- [ ] Aller dans **Settings > API**
- [ ] Copier **Project URL** → `.env.local` `VITE_SUPABASE_URL`
- [ ] Copier **anon key** → `.env.local` `VITE_SUPABASE_ANON_KEY`

## 🗄️ Étape 2 : Initialiser la base de données

- [ ] Dans Supabase, aller à **SQL Editor**
- [ ] Créer une nouvelle query
- [ ] Copier tout le contenu de `supabase-schema.sql`
- [ ] Coller dans le SQL Editor
- [ ] Cliquer **Run** (ou Ctrl+Enter)
- [ ] Vérifier dans **Table Editor** :
  - [ ] Table `qp_users` existe
  - [ ] Table `qp_reservations` existe
  - [ ] Colonnes correctes

## 🔑 Étape 3 : Remplir les variables d'environnement

- [ ] Éditer `.env.local`
- [ ] Remplacer les `xxxxx` par vos vraies valeurs Supabase
- [ ] Sauvegarder
- [ ] ⚠️ NE PAS committer `.env.local` (déjà dans `.gitignore`)

## 🚀 Étape 4 : Lancer l'appli

```bash
npm run dev
```

- [ ] Ouvrir http://localhost:5173 (ou le port affiché)
- [ ] La page doit charger sans erreur

## 🧪 Étape 5 : Tester l'authentification

### Inscription
- [ ] Cliquer **"Créer un compte"**
- [ ] Email : `prenom.nom@epitech.eu` (ou similaire)
- [ ] Password : quelque chose (6+ caractères)
- [ ] Cliquer **Inscription**
- [ ] Aller vérifier dans Supabase > Table `qp_users` :
  - [ ] Une ligne est créée
  - [ ] Champs `login`, `first_name`, `last_name`, `hash`, `salt` remplis

### Connexion
- [ ] Cliquer **"J'ai déjà un compte"**
- [ ] Utiliser vos identifiants créés à l'étape précédente
- [ ] Cliquer **Connexion**
- [ ] Vous devez voir le dashboard

## 📅 Étape 6 : Tester les réservations

### Dans un onglet (Client 1)
- [ ] Logged in sous compte 1
- [ ] Cliquer sur un créneau libre pour réserver
- [ ] Entrer les infos (imprimante, horaire, projet)
- [ ] Cliquer **Réserver**
- [ ] Vous devez voir la réservation en gris sur la timeline

### Dans un autre onglet (Client 2)
- [ ] Se connecter avec un autre compte
- [ ] Vérifier que vous voyez la réservation du Client 1 **en temps réel**
- [ ] Créer une autre réservation
- [ ] Vérifier que Client 1 la voit immédiatement (realtime)

### Suppression
- [ ] Cliquer **Mes réservations**
- [ ] Cliquer **Annuler** sur une de vos réservations
- [ ] La timeline se met à jour instantanément
- [ ] L'autre client voit aussi la suppression (realtime)

## ✅ Fin de checklist

- [ ] Tous les tests réussis ?
- [ ] Application prête pour la prod !

---

## 🆘 Troubleshooting

### Erreur "VITE_SUPABASE_URL is undefined"
→ Vérifier `.env.local` et redémarrer `npm run dev`

### Les réservations ne se synchro pas en temps réel
→ Vérifier Supabase > Settings > Realtime > Replication enabled pour `qp_reservations`

### Impossible de se connecter
→ Vérifier dans Supabase > Table `qp_users` que l'utilisateur existe

### Erreur "not authenticated"
→ Vérifier que votre clé anon est valide et l'RLS est configuré

---

💡 **Besoin d'aide ?** Consultez [SETUP.md](SETUP.md) ou [INTEGRATION_COMPLETE.md](INTEGRATION_COMPLETE.md)
