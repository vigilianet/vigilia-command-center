# Vigilia — Plan de finalisation

- [x] Activer Lovable Cloud, l'authentification (e-mail, Google, Lovable) et verrouiller l'accès propriétaire à `Kayoyolandry@gmail.com`.
- [x] Importer les modules serveur, le système de design et les endpoints publics (`/api/public/jobs/run-checks`, `/api/public/telegram/webhook`).
- [x] Créer la page de connexion (`/login`) et la réinitialisation de mot de passe (`/reset-password`).
- [x] Créer la coque de navigation et les 10 écrans : tableau de bord (`/`), assistant (`/assistant`), agents (`/agents`), projets (`/projects`), missions et approbations (`/missions`), surveillance (`/monitoring`), intégrations (`/integrations`), fournisseurs IA (`/providers`), journaux (`/logs`), paramètres et mémoire (`/settings`).
- [x] Planifier les contrôles périodiques toutes les 5 minutes (`vigilia-run-checks` -> `/api/public/jobs/run-checks`).
- [x] Écrire les tests de règles métier (SSRF, failover IA, approbations, branches protégées, routage).
- [ ] Vérification visuelle bureau/mobile, parcours de connexion en direct, tests réels Telegram (requiert jeton bot) et GitHub privé (requiert jeton) — en pause faute de crédits.
- [ ] Données antérieures : en attente d'export éventuel (aucun fourni).