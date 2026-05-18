# 🚀 PLAN D'ACTION - Trading Model Refactorisation

**État**: Étapes 1-2 complétées ✅  
**Date**: 18 Mai 2026  
**Durée estimée**: 4-6 semaines

---

## 📋 Ce qui a été fait

### ✅ Étape 1: Audit Rapide du Repo (COMPLÉTÉ)

Document: [AUDIT.md](./AUDIT.md)

**Découvertes clés**:
- 🔴 **CRITIQUE**: Pas de CI/CD, tests incomplets, sécurité à renforcer
- 🟠 **ÉLEVÉ**: Dépendances dupliquées (×5), conventions incohérentes
- 🟡 **MOYEN**: Code mort (10+ TODOs), pas de Prettier, pas de git hooks

**Problèmes majeurs identifiés**:
1. Naming services incohérent (Financial_**Scrapper** vs Discovery-**Server**)
2. ESLint minimal (pas assez de règles)
3. Tests non standardisés (.spec.ts vs .test.ts)
4. Pas de root package.json (monorepo complexe)

---

### ✅ Étape 2: Définir Standards Cibles (COMPLÉTÉ)

Document: [STANDARDS.md](./STANDARDS.md)

**Standards définis pour**:
- 📁 **Structure**: Service/package pattern unifié
- 📝 **Naming**: kebab-case (fichiers), camelCase (variables), PascalCase (classes)
- 🎨 **Formatting**: Prettier + ESLint strict
- ✅ **Tests**: Jest, 80%+ coverage, .spec.ts ONLY
- 🔧 **Tools**: Husky + lint-staged for git hooks
- 🔄 **CI/CD**: GitHub Actions (lint, test)
- 📦 **Monorepo**: npm workspaces

**Convention**: **UNE SEULE MANIÈRE DE FAIRE**

---

## 🎯 Prochaines Étapes (3-8)

### 📌 Étape 3: Sécuriser avec Tests (IN PROGRESS)

**Objectif**: Tester les logiques critiques avant refactorisation

**Actions**:
1. Ajouter tests pour:
   - ✓ Authentification (mTLS, JWT tokens)
   - ✓ Service discovery (registration, heartbeat)
   - ✓ Message broker (delivery, reliability)
   - ✓ Wallet management (balance, transactions)
2. Créer fixtures de test complètes
3. Setup test helpers (mock server, DB)
4. Valider couverture minimum 60%

**Fichiers à créer**:
- `tests/unit/*/` - Tous les services
- `tests/fixtures/` - Test data
- `tests/helpers/` - Test utilities

**Durée**: 8-10 heures

---

### 📌 Étape 4: Nettoyage de Base (NOT STARTED)

**Objectif**: Supprimer code mort et inutile

**Actions**:
1. Résoudre tous les TODOs obsolètes
2. Supprimer fichiers inutiles
3. Synchroniser les versions de dépendances
4. Supprimer imports non utilisés
5. Homogénéiser les imports

**Fichiers affectés**:
- `Financial_Scrapper/src/scraper/selector.ts` (TODO)
- `Financial_Scrapper/src/scraper/pageScraper.ts` (TODO)
- `Trader/src/app/index.ts` (TODO)
- `broker-message/shared/types/message.ts` (TODO)
- Discovery-Server `Todo.md` (auth/security items)

**Durée**: 4-5 heures

---

### 📌 Étape 5: Standardiser Structure (NOT STARTED)

**Objectif**: Réorganiser sans modifier comportement

**Actions**:
1. Renommer services (kebab-case):
   - Financial_Scrapper → financial-scraper
   - Trader-Trainer → trader-trainer
   - Discovery-Server → discovery-server
2. Renommer tous les fichiers (kebab-case)
3. Restructurer répertoires (service/package pattern)
4. Extraire code commun dans lib/
5. Réduire duplication (tsconfig, eslint, jest)

**Durée**: 10-12 heures

---

### 📌 Étape 6: Uniformiser Patterns (NOT STARTED)

**Objectif**: UNE manière de faire chaque chose

**Actions**:
1. Centraliser gestion d'erreurs
2. Standardiser logging (Winston ou Pino)
3. Créer validation centralisée (Zod)
4. Standardiser configuration (.env + types)
5. Uniformiser patterns API (error responses, status codes)

**Nouvelles fichiers**:
- `packages/lib/src/common/errors/` - Error classes
- `packages/lib/src/common/logging/` - Logger setup
- `packages/lib/src/common/config/` - Config loader

**Durée**: 6-8 heures

---

### 📌 Étape 7: Introduire Automatisation (NOT STARTED)

**Objectif**: Lint/test/format automatiques

**Actions**:
1. Créer root package.json avec workspaces
2. Créer root tsconfig.json, eslint.config.mjs, jest.config.js
3. Configurer Prettier
4. Setup Husky + lint-staged (git hooks)
5. Créer GitHub Actions workflows:
   - `.github/workflows/lint.yml`
   - `.github/workflows/test.yml`
   - `.github/workflows/build.yml`
6. Ajouter badges à README

**Fichiers à créer**:
- `package.json` (root)
- `tsconfig.json` (root)
- `eslint.config.mjs` (root)
- `.prettierrc`
- `.husky/pre-commit`
- `.github/workflows/lint.yml`
- `.github/workflows/test.yml`

**Durée**: 6-7 heures

---

### 📌 Étape 8: Documentation Minimale (NOT STARTED)

**Objectif**: Documentation pour onboarding rapide

**Actions**:
1. Écrire `/docs/SETUP.md` (local dev setup)
2. Écrire `/docs/ARCHITECTURE.md` (overview)
3. Créer `/docs/api/` (API docs par service)
4. Ajouter `/docs/CONTRIBUTING.md` (guide contribution)
5. Ajouter diagrams Mermaid

**Fichiers à créer**:
- `docs/SETUP.md`
- `docs/ARCHITECTURE.md`
- `docs/CONTRIBUTING.md`
- `docs/api/discovery-server.md`
- `docs/api/financial-scraper.md`
- `docs/api/message-manager.md`
- `docs/api/trader.md`
- `docs/api/trader-trainer.md`

**Durée**: 4-5 heures

---

## 📊 Timeline Estimée

| Phase | Étapes | Durée | Priorité |
|-------|--------|-------|----------|
| **Préparation** | 1-2 | 2 jours ✅ | 🔴 |
| **Sécurisation** | 3-4 | 2-3 jours | 🔴 |
| **Refactorisation** | 5-6 | 3-4 jours | 🟠 |
| **Automatisation** | 7 | 1-2 jours | 🟠 |
| **Documentation** | 8 | 1 jour | 🟡 |
| **TOTAL** | - | **4-6 semaines** | - |

---

## 🎯 Critères de Succès

### Immédiat (Avant de refactoriser)
- [ ] Tests critiques en place (auth, wallet, messaging)
- [ ] TODOs résolus ou documentés
- [ ] Aucune erreur ESLint en local

### Court terme (Fin étape 5)
- [ ] Toutes services renommées (kebab-case)
- [ ] Tous fichiers renommés (kebab-case)
- [ ] Structure uniforme entre services
- [ ] Zéro duplication de config

### Moyen terme (Fin étape 7)
- [ ] CI/CD fonctionnel (lint + test sur chaque PR)
- [ ] Git hooks forcent lint avant commit
- [ ] Coverage ≥80% pour chaque service
- [ ] Tous imports standardisés

### Long terme (Fin étape 8)
- [ ] Documentation complète
- [ ] Onboarding ≤2 heures
- [ ] Zéro TODOs obsolètes
- [ ] Prêt pour production

---

## 🛠️ Outils Requis

### Déjà installés ✓
- TypeScript 6.0.3
- ESLint 10.3.0
- Jest 30.4.2
- Node.js 18+

### À installer
- Prettier 3.2.5
- Husky 9.1.4
- lint-staged 15.2.7

### Commandes clés
```bash
# Installation
npm install

# Development
npm run dev:discovery          # Lance un service
npm run lint                   # Lint tout
npm run lint:fix              # Lint + fix
npm run format                # Format avec Prettier
npm test                      # Run tests
npm run test:coverage         # Couverture
npm run build                 # Build all

# Git
npx husky install            # Setup git hooks
git commit -m "feat: ..."    # Enforce conventional commits
```

---

## 📞 Questions à Se Poser

1. **Quel est le timeline réaliste?** (4-6 semaines est ambitious?)
2. **Quels services sont critiques pour l'MVP?** (Prioriser tests)
3. **Y a-t-il d'autres dépendances bloquantes?** (Services externes?)
4. **Besoin de monitoring avant prod?** (Sentry, New Relic?)
5. **Strategy de déploiement?** (Rolling, blue-green?)

---

## 📚 Documents de Référence

1. **[AUDIT.md](./AUDIT.md)** - Découvertes détaillées
2. **[STANDARDS.md](./STANDARDS.md)** - Standards à implémenter
3. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Vue d'ensemble (à compléter)
4. **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Guide contribution (à compléter)

---

## 🚦 Prochaines Actions Immédiates

### TODAY (18 Mai)
- [x] Lire [AUDIT.md](./AUDIT.md)
- [x] Lire [STANDARDS.md](./STANDARDS.md)
- [ ] Décider: commencer par étape 3 ou 4?

### THIS WEEK
- [ ] Implémenter tests critiques (étape 3)
- [ ] Commencer nettoyage (étape 4)

### NEXT WEEK
- [ ] Renommer services/fichiers (étape 5)
- [ ] Centraliser patterns (étape 6)

### 2-3 WEEKS
- [ ] Setup CI/CD (étape 7)
- [ ] Écrire docs (étape 8)

---

**Status**: ✅ Audit & Standards complets  
**Next Step**: 👉 Étape 3 - Sécuriser avec des tests  
**Contact**: Voir CONTRIBUTING.md pour questions