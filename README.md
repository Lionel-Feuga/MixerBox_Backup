# Mes playlists

Une petite application en français pour sauvegarder les playlists personnelles publiques MixerBox dans **un seul PDF**, avec des exports JSON et TXT complémentaires.

## Utilisation

1. Copier l’URL d’une playlist sur `https://www.mbplayer.com/list/…`.
2. Coller le lien et cliquer sur **Récupérer mes playlists**.
3. L’application retrouve le créateur, consulte son profil public et vérifie le propriétaire de chaque playlist pour exclure les recommandations et les favoris d’autres créateurs.
4. Après vérification des quantités, cliquer sur **Télécharger le PDF complet**.

Les morceaux partagés entre plusieurs playlists restent dans chacune. L’ordre renvoyé par MixerBox avec `reverse=true` correspond à l’ordre observé sur ses pages. Les titres complets sont conservés sans essayer de deviner la séparation artiste/titre. Les liens YouTube disponibles sont inclus dans les exports.

## Démarrage local

Node.js 22 ou version ultérieure et npm sont nécessaires.

```sh
npm ci
npm run dev
```

Ouvrir `http://localhost:3000`.

## Déploiement sur Vercel

Aucune variable d’environnement, clé API, base de données ou connexion MixerBox n’est nécessaire.

### Depuis un dépôt Git

1. Placer ce dossier dans un dépôt GitHub, GitLab ou Bitbucket.
2. Dans Vercel, **Add New → Project**, importer ce dépôt.
3. Conserver le framework **Next.js**, les commandes par défaut et Node.js 22 ou supérieur.
4. Déployer. Tester ensuite le lien de playlist sur l’URL publiée, car MixerBox pourrait répondre différemment depuis les serveurs Vercel.

### Depuis la ligne de commande

```sh
npx vercel login
npx vercel --prod
```

L’authentification se fait sur le site officiel Vercel. Ne pas ajouter de token dans le code ou le dépôt.

## Vérification

```sh
npm test
npm run typecheck
npm run build
npm run test:live
```

`test:live` utilise le compte de test public ayant servi à développer l’application (3 playlists, 10 entrées). Ce compte peut évoluer. Pour tester un autre profil :

```sh
npm run test:live -- https://www.mbplayer.com/list/IDENTIFIANT
```

Ce script crée un JSON, un TXT et un PDF dans `test-output/`, dossier ignoré par Git et Vercel. Les tests unitaires couvrent la validation des URL, l’exclusion des recommandations, les doublons, les réponses incomplètes et la pagination PDF avec 150 morceaux.

## Fonctionnement et limites

- TypeScript, Next.js App Router, React, CSS simple, icônes Lucide.
- `lib/mixerbox.ts` : lecture des points d’accès publics utilisés par le site MixerBox (`/api/playlist` et `/api/singer`). Ils ne constituent pas une API publique contractuelle : si MixerBox les modifie, cet adaptateur devra être mis à jour.
- Les requêtes ne peuvent viser que `www.mbplayer.com`, avec des chemins prédéfinis et des identifiants validés. Aucun cookie ou identifiant de connexion de l’utilisateur n’est transmis.
- Trois téléchargements de playlists simultanés au maximum ; délai de 20 secondes par requête ; réponse limitée à 8 Mio ; 300 playlists candidates au maximum.
- Le profil peut contenir des recommandations. Chaque playlist est relue puis filtrée par identifiant du propriétaire, pas par nom.
- Le nombre de playlists personnelles est comparé au champ `size` du créateur présent dans la réponse MixerBox. Le champ `total` du profil n’est pas utilisé : il compte aussi d’autres éléments.
- Les quantités de morceaux sont comparées à `itemCount`. Une suite de données indiquée par `next`, un titre manquant, une requête échouée ou une quantité divergente bloque le PDF complet et produit un avertissement. Cette version ne suit pas les curseurs `next` : aucune suite n’était présente dans les réponses observées. Le JSON et le TXT restent téléchargeables avec un marquage explicite d’incomplétude.
- Les playlists privées, les listes non exposées par le profil public et les favoris d’autres créateurs ne sont pas récupérables dans ce parcours sans connexion. Un nombre concordant vérifie le périmètre public annoncé par MixerBox, pas l’existence de toutes les données privées du compte.
- Éviter de modifier les listes pendant une sauvegarde. Le site distant ne fournit pas de transaction garantissant un instantané de tout le compte.
- Le PDF est créé dans le navigateur avec `pdf-lib`, sans envoi des listes à un service PDF. Il utilise Noto Sans (licence OFL incluse). Les caractères absents de cette police sont remplacés par `?` avec une note explicite dans le PDF et dans l’interface ; le JSON/TXT conserve l’écriture originale.
- Pas de stockage permanent applicatif, ni de statistiques de visite ajoutées. Les journaux techniques de l’hébergeur restent soumis à sa configuration.

## Fichiers principaux

- `app/page.tsx` : interface, progression, téléchargement des exports.
- `app/globals.css` : mise en page responsive.
- `app/api/discover/route.ts` : découverte du profil depuis le lien.
- `app/api/playlist/route.ts` : récupération d’une playlist.
- `lib/backup.ts` : assemblage et contrôle de complétude.
- `lib/pdf.ts` : document A4, sommaire, listes numérotées, durées et pages numérotées.

Outil indépendant, non affilié à MixerBox. Aucun téléchargement de fichier audio.
