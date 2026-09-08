# LogiChain API — MP3

> API REST de la plateforme logistique événementielle **LogiChain**
> (Node.js + TypeScript + Express + MongoDB + Mongoose)
> Projet noté — Module MP3 (Back + API REST).

L'API expose les endpoints qui seront consommés par la PWA mobile-first
`logichain.fulkia.fr` (autre repo, autres MPs) et alimente le tableau de
bord d'aide à la décision pour les administrateurs et responsables
logistiques.

---

## 1. Démarrage rapide

### Prérequis

- Node.js ≥ 20 (`engines.node` dans `package.json`)
- npm (fourni avec Node)
- Docker + Docker Compose (pour Mongo en local, ou un `mongod` local monté
  en replica set `rs0`)
- `git`, et [`gh`](https://cli.github.com/) authentifié pour les commandes
  de passation (`CONTRIBUTING.md`, § 8)

### En local (Node 20+ requis)

```bash
cp .env.example .env
# Édite .env, en particulier JWT_SECRET (`openssl rand -base64 64`)

npm install
docker compose up -d mongo        # ou un mongod local en replica set
npm run dev                       # API sur http://localhost:3000
```

### Variables d'environnement

Source de vérité : le schéma Zod de `src/config/env.ts` (validé au boot,
échec rapide si invalide). Voir aussi `.env.example`.

| Variable                     | Obligatoire | Défaut          | Description                                                                 |
|-------------------------------|:-----------:|-----------------|-------------------------------------------------------------------------------|
| `NODE_ENV`                    | non         | `development`   | `development` \| `test` \| `production`                                      |
| `PORT`                        | non         | `3000`           | Port d'écoute HTTP                                                            |
| `LOG_LEVEL`                   | non         | `info`           | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace`                  |
| `MONGO_URI`                   | **oui**     | —                | URI MongoDB (replica set `rs0` requis — Change Streams + transactions ACID)   |
| `JWT_SECRET`                  | **oui**     | —                | ≥ 32 caractères (`openssl rand -base64 64`)                                   |
| `JWT_EXPIRES_IN`               | non         | `2h`             | Durée de vie du token d'accès                                                 |
| `JWT_REFRESH_EXPIRES_IN`       | non         | `7d`             | Durée de vie du refresh token                                                 |
| `CORS_ORIGIN`                 | non         | `*`              | Origine autorisée (ex. `https://logichain.fulkia.fr` en prod)                 |
| `BCRYPT_ROUNDS`               | non         | `12`             | Coût bcrypt, entre 4 et 15                                                     |
| `RATE_LIMIT_WINDOW_MS`         | non         | `900000` (15 min)| Fenêtre du limiteur global `/api/v1`                                          |
| `RATE_LIMIT_MAX`              | non         | `1000`           | Requêtes max par fenêtre (limiteur global)                                    |
| `AUTH_RATE_LIMIT_WINDOW_MS`    | non         | `300000` (5 min) | Fenêtre du limiteur anti brute-force sur `/auth/login`                        |
| `AUTH_RATE_LIMIT_MAX`          | non         | `10`             | Requêtes max par fenêtre (limiteur login)                                     |
| `DOCS_USER`                    | non         | (vide)           | Identifiant Basic Auth pour `/docs` et `/openapi.json` (doc ouverte si absent) |
| `DOCS_PASSWORD`                | non         | (vide)           | Mot de passe Basic Auth associé à `DOCS_USER`                                 |

> Ne jamais committer de valeur réelle de `JWT_SECRET`, mot de passe ou URI
> Mongo avec identifiants — ce dépôt est **public**. `.env` est ignoré par
> git ; seul `.env.example` (valeurs factices) est versionné.

### En production (VPS Docker + Traefik)

```bash
cp .env.example .env
# Renseigner JWT_SECRET et CORS_ORIGIN (https://logichain.fulkia.fr)

docker compose up -d --build
```

L'API est alors derrière Traefik sur `https://api-logichain.fulkia.fr`,
healthcheck sur `/health`, certificat Let's Encrypt automatique
(`certresolver=letsencrypt`). Mongo n'est jamais exposé publiquement —
il vit sur le réseau interne `logichain-internal`.

### Scripts npm utiles

| Commande               | Effet                                                  |
|------------------------|--------------------------------------------------------|
| `npm run dev`          | Démarre l'API avec rechargement à chaud (tsx watch)   |
| `npm run build`        | Compile TypeScript vers `dist/`                       |
| `npm start`            | Démarre l'image compilée                               |
| `npm test`             | Lance la suite Jest                                    |
| `npm run test:coverage`| Couverture (HTML dans `coverage/`)                    |
| `npm run lint`         | ESLint + règles import                                |
| `npm run typecheck`    | Vérification TypeScript stricte sans émission         |

---

## 2. Architecture

### Pattern N-Tier strict

```
┌──────────┐   HTTP/JSON   ┌────────────┐
│ Client   │ ────────────► │ Controller │  ─ validation Zod
│ (PWA)    │ ◄──────────── │            │
└──────────┘               └─────┬──────┘
                                 │ Entity (DTO métier)
                                 ▼
                          ┌────────────┐
                          │  Service   │  ─ logique métier pure
                          │            │     (aucun req/res)
                          └─────┬──────┘
                                │ Entity
                                ▼
                          ┌────────────┐
                          │ Repository │  ─ SEULE couche
                          │            │    autorisée à parler à Mongoose
                          └─────┬──────┘
                                │ Document ↔ Entity
                                ▼
                          ┌────────────┐
                          │  Mongoose  │
                          │   Model    │
                          └────────────┘
```

| Couche      | Responsabilité                                            | Fichiers types                             |
|-------------|-----------------------------------------------------------|--------------------------------------------|
| Entity      | Objet métier, encapsulation, transitions d'état           | `src/modules/*/...entity.ts`              |
| Model       | Schéma Mongoose, validation native                         | `src/modules/*/...model.ts`               |
| Repository  | Mapping Doc ↔ Entity, pipelines d'agrégation, version OCC | `src/modules/*/...repository.ts`          |
| Service     | Logique métier, orchestration                              | `src/modules/*/...service.ts`             |
| Controller  | HTTP → service → HTTP, validation Zod                      | `src/modules/*/...controller.ts`          |
| Routes      | Définition des endpoints + middlewares                     | `src/modules/*/...routes.ts`              |

### Démonstration POO

| Concept           | Où le voir                                                              |
|-------------------|-------------------------------------------------------------------------|
| **Encapsulation** | `ItemEntity`, `EventEntity`, `RouteEntity` — toutes les props sont `private`, lecture par getters, mutations via méthodes métier (`allocateTo`, `recordScan`, etc.) |
| **Héritage**      | `BaseEntity` (id/version/dates) ← Item/Event/Route/User. `BaseRepository<TEntity, TDocument>` ← tous les repos. `AppError` ← `NotFoundError`, `ValidationError`, `ConflictError`, `BusinessRuleError`, … |
| **Polymorphisme** | `BaseEntity.toJSON()` surchargé par chaque entité. `BaseRepository.toEntity()` abstrait, implémenté par chaque repo concret. `AppError.toJSON()` surchargeable. |
| **Génériques**    | `BaseRepository<TEntity, TDocument>` paramétré — sécurise le typage CRUD |

### Modélisation MongoDB

Trois collections principales (toutes en `replSet rs0` pour les
transactions ACID et les futurs Change Streams) :

| Collection | Particularités                                                                          |
|------------|------------------------------------------------------------------------------------------|
| `items`    | QR code unique, statut machine-à-états, GeoJSON Point + index `2dsphere`, historique imbriqué (mouvements), `optimisticConcurrency` |
| `events`   | GeoJSON Polygon par zone (index `2dsphere`), slug unique, validation startDate < endDate native |
| `routes`   | Étapes (`stops`) imbriquées, mode transport, distance planifiée/réelle, références items |
| `users`    | Bcrypt hash en `select:false`, rôles enum, index unique sur email                       |

**Index composés clés :** `{ eventId: 1, status: 1 }`, `{ category: 1, status: 1 }` sur `items` ; `{ eventId: 1, status: 1 }` sur `routes`.

**Verrouillage optimiste** : `optimisticConcurrency: true` sur tous les
schémas — Mongoose maintient `__v`, et `BaseRepository.updateWithVersion()`
lève `ConflictError` (HTTP 409) si la version locale est obsolète.
Indispensable pour la future synchronisation offline → online.

---

## 3. API REST — conventions

### Versioning

Toutes les routes sont préfixées par `/api/v1`.

### Verbes et URL (Richardson niveau 2)

| Action            | Verbe    | Exemple                                  |
|-------------------|----------|------------------------------------------|
| Lister            | `GET`    | `/api/v1/events/:id/items?status=in_stock` |
| Détail            | `GET`    | `/api/v1/items/:id`                      |
| Créer             | `POST`   | `/api/v1/items`                          |
| Modifier partiel  | `PATCH`  | `/api/v1/items/:id`                      |
| Supprimer         | `DELETE` | `/api/v1/items/:id`                      |
| Action métier     | `POST`   | `/api/v1/items/:id/scan`                 |

### Codes statut

`200` lecture/maj · `201` création (+ header `Location`) · `204` suppression
· `400` validation Zod · `401` JWT manquant/invalide · `403` rôle insuffisant
· `404` ressource inconnue · `409` version stale (OCC) ou unique violé
· `422` règle métier violée · `500` erreur inattendue.

### Format réponse

```jsonc
// Liste
{ "data": [...], "count": 42, "page": 1, "limit": 20, "totalPages": 3 }

// Détail : ressource directe
{ "id": "…", "label": "…", … }

// Erreur (toutes les erreurs métier passent par AppError.toJSON())
{ "error": { "code": "BUSINESS_RULE_VIOLATION", "message": "…", "details": { … } } }
```

### Sécurité

- **JWT obligatoire** sur tout `/api/v1/*` sauf `/auth/login` et `/auth/refresh`
- **Helmet** activé (headers de sécurité) + couche Traefik en redondance
- **CORS** restreint à `logichain.fulkia.fr` (`CORS_ORIGIN` env)
- **Validation Zod** systématique avant chaque controller
- **Bcrypt** pour les mots de passe (`BCRYPT_ROUNDS=12` par défaut)
- **Secrets en env vars** — `.env` jamais versionné

---

## 4. Logique métier signature

### 4.1 Calcul d'empreinte carbone (méthodologie ADEME)

→ `src/services/CarbonFootprintService.ts` + tests
`tests/unit/services/CarbonFootprintService.test.ts`

**Empreinte fabrication** amortie au prorata de la durée d'événement :

```
co2_fabrication = (manufacturingCo2Kg / lifespanYears) × (eventDurationDays / 365)
```

Exemple : projecteur 50 kg, 500 kgCO2e de fabrication, durée de vie 10 ans
→ 50 kgCO2e/an → 4 jours d'usage = 0,55 kgCO2e attribués à l'événement.

**Empreinte transport** — formule canonique ADEME Base Carbone® :

```
co2_transport = (totalWeightKg / 1000) × distanceKm × facteur[mode]
```

Facteurs d'émission Base Carbone® ADEME (kgCO2e par tonne·km) :

| Mode             | Facteur courant | Source                                |
|------------------|-----------------|---------------------------------------|
| `truck`          | 0,058           | API ADEME live · Rigide · ID 28030    |
| `rail`           | 0,00401         | API ADEME live · Train · ID 43732     |
| `electric_truck` | 0,020           | Fallback (pas de valeur ADEME 2026)   |
| `van`            | 0,082           | Fallback (ADEME en kgCO2e/km, ID 28280) |
| `bike_cargo`     | 0               | Fallback (négligeable)                |

**Les facteurs sont chargés depuis l'API Open Data ADEME** au démarrage
de l'application, puis rafraîchis toutes les 24h. Si l'API ADEME est
indisponible, on retombe sur les valeurs hardcodées correspondantes.

→ Endpoint debug : `GET /api/v1/dashboard/emission-factors` expose
l'état courant du cache (source : `ademe-live`, `ademe-cached`, ou `fallback`).

→ Endpoint admin : `POST /api/v1/dashboard/emission-factors/refresh` force
un re-fetch immédiat depuis l'ADEME.

La distance réelle (`actualDistanceKm`) prime sur la planifiée si disponible.

**Endpoint** : `GET /api/v1/dashboard/events/:id/carbon-footprint` →
breakdown par catégorie d'équipement et par mode de transport, total
consolidé temps réel pour le tableau de bord KPI.

### 4.2 Algorithme du banquier (allocation des ressources)

→ `src/services/ResourceAllocationService.ts` + tests
`tests/unit/services/ResourceAllocationService.test.ts`

Adaptation de l'algorithme du banquier (Dijkstra, 1965) :

| OS classique         | LogiChain                                  |
|----------------------|--------------------------------------------|
| processus            | événement                                  |
| type de ressource    | catégorie d'item (lighting, sound, …)      |
| max claim            | besoin total prévisionnel par catégorie    |
| allocation           | items déjà alloués à l'événement           |
| available            | items `in_stock` (par catégorie)           |

Un état est **sûr** s'il existe une séquence d'événements où chaque
besoin restant (`need = max - allocated`) peut être satisfait
séquentiellement avec les ressources disponibles + celles libérées par
les événements déjà servis.

À chaque demande d'allocation, le service simule l'allocation, exécute
le safety algorithm sur l'état résultant, et refuse si l'état devient
non-sûr (HTTP 422). Empêche les **goulots d'étranglement structurels**
pendant les phases de montage/démontage simultané.

**Endpoint** : `POST /api/v1/dashboard/allocations/check`
→ `{ granted, reason, safeSequence?, resultingState? }`

---

## 5. Périmètre MP3 — ce qui est fait

- [x] Setup TypeScript strict + ESLint/Prettier/Jest
- [x] Modélisation Mongoose des 3 collections + User
- [x] Validation Mongoose native (côté ODM)
- [x] `BaseEntity` / `BaseRepository` génériques (héritage justifié)
- [x] Hiérarchie d'erreurs `AppError` (polymorphisme `toJSON`)
- [x] Slice complet `Item` (entity, repository, service, controller, routes, schemas Zod)
- [x] Slice complet `Event` (avec sous-ressource `/events/:id/items`)
- [x] Slice complet `Route` (feuilles de route, stops imbriqués)
- [x] Auth JWT (bcrypt, refresh token, rôles, middleware `requireAuth` / `requireRole`)
- [x] `CarbonFootprintService` + tests unitaires
- [x] `ResourceAllocationService` (banquier) + tests unitaires
- [x] Collection Bruno (`bruno/`) — documentation vivante
- [x] Dockerfile multi-stage Alpine non-root + healthcheck
- [x] `docker-compose.yml` Mongo replica set rs0 auto-init + labels Traefik HTTPS

## 6. Préparé pour la suite (PWA front + MP4/MP5)

| Sujet                        | Préparation côté API                                                   |
|------------------------------|-------------------------------------------------------------------------|
| **CORS**                     | Origin configurable via `CORS_ORIGIN`, défaut `logichain.fulkia.fr`     |
| **Pagination**               | Tous les `GET /list` exposent `page`, `limit`, `totalPages`             |
| **Filtres**                  | Query strings standardisées (`?status=…&category=…`)                    |
| **Format JSON stable**       | `data/count/page/limit` pour les listes, objet direct pour le détail    |
| **Sync offline → online**    | `optimisticConcurrency` actif sur toutes les entités, 409 Conflict porté par `BaseRepository.updateWithVersion()` |
| **Scan QR**                  | `GET /api/v1/items/by-qr/:qrCode` pour récupération rapide              |
| **Géolocalisation**          | GeoJSON Point + index `2dsphere`, méthode `recordScan()` qui géoréférence |
| **Empreinte temps réel**     | Service idempotent, prêt à être branché à Change Streams                |

### Hors-périmètre MP3 (à câbler plus tard)

- **WebSockets / SSE** pour alertes critiques sur secteur — les hooks
  Change Streams sont à installer dans les repositories (`item.repository`)
- **Sync offline complète** : la PWA mettra les scans en file (IndexedDB),
  rejouera POST `/items/:id/scan` au retour réseau ; les 409 Conflict
  déclencheront un merge côté client
- **Dashboard front** : consommera `/api/v1/dashboard/events/:id/carbon-footprint`

---

## 7. Arborescence du repo

```
logichain-api/
├── bruno/                        # collection d'API tests (documentation vivante)
├── src/
│   ├── config/env.ts             # chargement & validation des env vars (Zod)
│   ├── core/
│   │   ├── BaseEntity.ts         # racine de la hiérarchie d'entités
│   │   ├── BaseRepository.ts     # repository générique avec OCC
│   │   ├── logger.ts             # pino
│   │   └── errors/               # AppError + sous-classes
│   ├── db/mongoose.ts            # connexion Mongo
│   ├── middlewares/
│   │   ├── auth.middleware.ts    # requireAuth / requireRole
│   │   ├── validate.middleware.ts # Zod -> req
│   │   └── error-handler.middleware.ts
│   ├── modules/
│   │   ├── auth/   ├── items/   ├── events/   ├── routes/   └── dashboard/
│   ├── services/
│   │   ├── CarbonFootprintService.ts      # méthodologie ADEME
│   │   └── ResourceAllocationService.ts   # algorithme du banquier
│   ├── types/express.d.ts        # augmentation Request.user
│   ├── app.ts                    # configuration Express
│   └── index.ts                  # bootstrap (DB + serveur)
├── tests/unit/services/          # tests Jest (focus services)
├── Dockerfile                    # multi-stage Alpine non-root
├── docker-compose.yml            # mongo rs0 + api + labels Traefik
├── .env.example
├── jest.config.js · tsconfig.json · .eslintrc.json · .prettierrc
└── README.md
```

---

## 8. À l'oral — antisèche

- **Pourquoi MongoDB et pas du relationnel ?** Modèle documentaire dénormalisé,
  imbrication des historiques, données géospatiales natives, Change Streams
  pour le temps réel, transactions ACID dispo sur replica set.
- **Pourquoi un replica set sur 1 nœud ?** Pour activer Change Streams et les
  transactions ACID — pas pour la haute disponibilité. C'est le mode dev
  classique.
- **Pourquoi Zod en plus de la validation Mongoose ?** Zod valide les
  inputs HTTP **avant** d'atteindre les services ; Mongoose valide les
  documents **avant** persistance. Deux couches, deux rôles.
- **Pourquoi le verrouillage optimiste ?** Parce qu'un agent terrain peut
  scanner hors-ligne et synchroniser plus tard ; il faut savoir détecter
  qu'un autre agent a modifié l'item entre-temps.
- **Pourquoi un état "sûr" au sens de Dijkstra ?** Parce qu'on peut avoir
  assez de stock à l'instant T pour servir une demande, mais s'engager
  à la servir mettrait à terme un autre événement en goulot. L'algorithme
  prouve mathématiquement qu'il existe (ou non) une séquence d'allocation
  sans blocage.

---

## 9. Comptes utiles

Au premier démarrage la base est vide. Crée le premier admin manuellement
(ex : via `mongosh` ou un seed) puis utilise `POST /api/v1/auth/login`.

```js
// mongosh sur le container logichain-mongo
use logichain
db.users.insertOne({
  email: "admin@logichain.fr",
  // bcrypt de "changeme-now-please" avec 12 rounds — à remplacer
  passwordHash: "$2b$12$....",
  fullName: "Admin",
  role: "admin",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  __v: 0
});
```

Pour générer le hash localement :
```bash
node -e "require('bcrypt').hash('changeme-now-please', 12).then(console.log)"
```

---

## 10. Contribution & passation

Ce dépôt suit un modèle Gitflow (`main` ← `develop` ← `feature/*`), avec des
règles de protection GitHub actives sur `main` et `develop` (checks CI
obligatoires, historique linéaire sur `main`, pas d'acteur de contournement).

Voir [`CONTRIBUTING.md`](./CONTRIBUTING.md) pour : le détail du modèle de
branches, la convention de commit (Conventional Commits), le cycle de vie
d'une Pull Request, la checklist de revue, et la **procédure de passation**
à une future équipe (notamment le passage de la revue obligatoire de 0 à 1
approbation).

Pour l'exploitation et le déploiement de l'infrastructure qui héberge cette
API (VM, Ansible, sauvegardes, procédures d'incident), voir le
[`RUNBOOK.md`](https://github.com/Fulkiaaa/logichain-infra/blob/main/RUNBOOK.md)
du dépôt `logichain-infra` (à venir — rédigé dans une tâche ultérieure du
plan d'industrialisation).

---

## Crédits

Projet académique — **LA MANU** (NOVEI), module **MP3**.
