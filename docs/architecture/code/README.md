# Documentation du Code

Ce dossier contient la documentation **HTML** générée automatiquement par [TypeDoc](https://typedoc.org/)
à partir des commentaires JSDoc présents dans les fichiers source TypeScript du monorepo.

Le rendu est identique à celui de [discord.js](https://discord.js.org/docs/packages/discord.js/main)
— navigation latérale, recherche plein texte, filtres de visibilité, thème clair/sombre.

## Modules

| Module                         | Documentation                                              |
| ------------------------------ | ---------------------------------------------------------- |
| @trading-model/common          | [Voir la doc](./@trading-model/common/index.html)          |
| @trading-model/address-manager | [Voir la doc](./@trading-model/address-manager/index.html) |
| @trading-model/broker-message  | [Voir la doc](./@trading-model/broker-message/index.html)  |
| discovery-server               | [Voir la doc](./discovery-server/index.html)               |
| message-manager                | [Voir la doc](./message-manager/index.html)                |
| financial-scraper              | [Voir la doc](./financial-scraper/index.html)              |
| trader-trainer                 | [Voir la doc](./trader-trainer/index.html)                 |

## Génération

```bash
npm run docs:generate          # Générer la documentation HTML complète
npm run docs:generate:dry      # Aperçu des modules sans génération
```

## Script

`scripts/generate-docs.mjs` — lance TypeDoc pour chaque package et service, puis
génère un index racine `index.html` listant tous les modules.

## Prérequis

- TypeDoc est installé comme dépendance de développement du monorepo
- Node.js 20+
- TypeScript 5.8+

## À faire

- [ ] Ajouter `npm run docs:generate` dans le workflow de release
- [ ] Héberger la documentation sur GitHub Pages ou Vercel
