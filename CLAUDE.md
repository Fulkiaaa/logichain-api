# CLAUDE.md

LogiChain API — API REST (Node 20 + TypeScript + Express + MongoDB/Mongoose) pour une plateforme logistique événementielle (projet académique MP3). Le code, les commentaires et les messages d'erreur sont en français.

## Commandes

```bash
npm run dev            # API en watch (tsx) sur http://localhost:3000
npm run build          # tsc + tsc-alias → dist/  (résout les alias @/* à la compilation)
npm run start          # node dist/index.js (après build)
npm run typecheck      # tsc --noEmit (mode strict complet)
npm run lint           # ESLint (lint:fix pour corriger)
npm run format         # Prettier

npm test                                   # tous les tests Jest
npm run test:coverage                      # couverture (seuils imposés, voir ci-dessous)
npx jest tests/unit/services/CarbonFootprintService.test.ts   # un seul fichier
npx jest -t "nom du test"                                      # filtrer par nom
```

MongoDB doit tourner **en replica set** (`rs0`) — `optimisticConcurrency` Mongoose l'exige côté infra. Lancer `docker compose up -d mongo` (compose auto-init le replica set) avant `npm run dev`. La base démarre vide : créer le premier admin à la main via `mongosh` (voir la fin du README), puis `POST /api/v1/auth/login`.

La config est validée par Zod au boot dans `src/config/env.ts` (fail-fast). `JWT_SECRET` ≥ 32 caractères est obligatoire. Copier `.env.example` → `.env`.

Couverture minimale (jest.config.js) : 70% statements/functions/lines, 65% branches. Seuls les fichiers de `src/services/` sont testés unitairement (la logique algorithmique) ; `index.ts`, `*.d.ts` et `db/` sont exclus.

## Architecture N-Tier (stricte)

Le flux d'une requête traverse des couches dont les responsabilités ne débordent jamais :

```
Route (.routes.ts)  →  middlewares (auth + validate Zod)  →  Controller  →  Service  →  Repository  →  Model (Mongoose)
                                                                              ↕
                                                                       Entity (domaine POO)
```

- **Route** : déclare les endpoints, branche `requireAuth` / `requireRole(...)` et `validate({ body, params, query })`. C'est aussi le point de **composition** (voir ci-dessous).
- **Controller** : adapte HTTP ↔ Service. Aucune logique métier. Sérialise via `entity.toJSON()`.
- **Service** : orchestration et règles inter-entités. Reçoit des inputs déjà validés. Manipule des **Entities**, jamais des documents Mongoose.
- **Repository** : **SEULE couche autorisée à parler à Mongoose**. Mappe document → Entity via `toEntity()`. Étend `BaseRepository`.
- **Entity** : objet métier riche (POO). Porte l'état et les **règles de transition** (ex. `EventEntity.transitionTo()`, `reschedule()`). Étend `BaseEntity`. Lance des `BusinessRuleError`.
- **Model** : schéma Mongoose + validation native (la dernière ligne de défense).

Règle d'or : un Service ne voit jamais un document Mongoose brut, un Controller ne voit jamais le Model, et le Model n'est touché que par son Repository.

### Composition / wiring (non-évident)

Il n'y a **pas de conteneur d'injection de dépendances**. Chaque `*.routes.ts` instancie `repo → service → controller` puis **ré-exporte les singletons** :

```ts
// event.routes.ts
export { repo as eventRepository, service as eventService };
```

Les dépendances cross-module passent par ces exports : `dashboard.routes.ts` importe `eventRepository`, `itemRepository`, `routeRepository` ; `event.controller.ts` importe `itemService` depuis `item.routes`. Pour câbler une nouvelle dépendance, importer le singleton exporté par le `*.routes.ts` du module cible.

### Anatomie d'un module (`src/modules/<nom>/`)

`*.entity.ts` (domaine) · `*.model.ts` (Mongoose + types `Raw`/`Doc`) · `*.repository.ts` · `*.service.ts` · `*.controller.ts` · `*.routes.ts` · `*.schemas.ts` (Zod). Modules : `auth`, `events`, `items`, `routes`, `dashboard` (composition seule, pas d'entité propre).

## Conventions transverses

- **Alias `@/*`** → `src/*` (tsconfig + jest `moduleNameMapper` + `tsc-alias` au build). Toujours importer en `@/...`.
- **Verrouillage optimiste / sync offline** : toute entité porte une `version` (mappée sur `__v` Mongo). Les updates passent par `BaseRepository.updateWithVersion(id, expectedVersion, …)` qui lève `ConflictError` (409) si la version est périmée. Pattern voulu pour le merge offline→online — ne pas contourner par un `save()` naïf.
- **Erreurs** : toute erreur métier hérite de `AppError` (`src/core/errors/`) et porte `code` + `httpStatus`. `error-handler.middleware.ts` les traduit en JSON `{ error: { code, message, details? } }`, et convertit aussi `ZodError` et les erreurs Mongoose (validation, cast, duplicate key 11000). Lancer une sous-classe d'`AppError`, jamais un objet brut.
- **Double validation** : Zod valide les inputs HTTP **avant** le service (`validate` middleware) ; Mongoose re-valide à l'ODM. Les deux sont voulues.
- **Sérialisation polymorphe** : `BaseEntity.toJSON()` expose les champs communs ; chaque entité surcharge avec `super.toJSON()`. C'est le seul format de sortie HTTP.
- **Auth** : JWT Bearer obligatoire (`requireAuth`) ; RBAC via `requireRole('admin' | 'logistics_manager' | 'field_agent' | 'transporter')`. `req.user` typé dans `src/types/express.d.ts`.
- **API versionnée** sous `/api/v1/...`. REST Richardson niveau 2 (codes HTTP + `Location` en création).

## Services métier (`src/services/`) — distincts des `modules/*/service`

Logique algorithmique transverse, montrable à l'oral, à manipuler avec soin :

- **CarbonFootprintService** : empreinte carbone selon la méthodologie ADEME Base Carbone® (fabrication amortie sur durée de vie + transport `tonnes × km × facteur`). Le long commentaire d'en-tête documente les formules — le garder synchronisé avec le code.
- **AdemeFactorService** : consomme l'API Open Data ADEME en *stale-while-revalidate* (cache mémoire 24h + fallback hardcodé). `ademeFactorService.warmup()` est appelé au boot dans `index.ts` ; l'API reste fonctionnelle si ADEME est down. Singleton exporté.
- **ResourceAllocationService** : algorithme du banquier (Dijkstra) adapté à l'allocation d'équipements aux événements (détection d'état sûr / deadlock). Refuse une allocation non sûre en 422.

## Outils

- **Bruno** (`bruno/`) : collection de requêtes API servant de documentation vivante (Health, Auth, Items, Events, Routes, Dashboard).
- **Docker** : `Dockerfile` multi-stage Alpine non-root ; `docker-compose.yml` monte Mongo `rs0` + l'API derrière Traefik (HTTPS Let's Encrypt) en prod. Mongo n'est jamais exposé publiquement.
