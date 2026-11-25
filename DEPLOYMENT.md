# Déploiement sur Vercel

## Configuration du projet

1. Importer le dépôt `vigilianet/vigilia-command-center` dans Vercel.
2. Laisser le répertoire racine à `.`.
3. Utiliser Bun comme gestionnaire de paquets (le dépôt contient `bun.lock`).
4. Utiliser `bun run build` comme commande de build. Laisser Vercel détecter la sortie du framework.
5. Déployer d'abord en Preview et vérifier l'application avant de promouvoir en Production.

La configuration Vercel est dans `vercel.json`; Nitro est configuré avec le preset Vercel dans `nitro.config.ts`.

## Variables d'environnement Supabase

Ajouter ces variables dans **Project Settings → Environment Variables** dans Vercel, au minimum pour Preview et Production :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Les deux URL doivent correspondre au projet Supabase et les deux clés sont la clé publishable. Ne pas ajouter de clé `service_role`, de mot de passe de base de données ni d'autre secret dans une variable `VITE_*` ou dans le dépôt. Après avoir ajouté ou modifié des variables, relancer un déploiement pour que le build les prenne en compte.

## Contrôles avant la mise en ligne

- Vérifier que le projet Supabase et son schéma sont prêts et que les règles RLS protègent les données.
- Vérifier la connexion, les pages protégées et les fonctions serveur en Preview.
- Ne pas considérer le déploiement comme une migration ou une sauvegarde de la base de données.
