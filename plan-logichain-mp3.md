# Plan LogiChain — MP3 (Back + API REST)

## Vue d'ensemble

**Deux repos séparés :**

- `logichain-api` → ce que tu construis maintenant (MP3 → MP5 partie back)
- `logichain-front` → plus tard (autres MP)

**Domaines :**

- `api-logichain.fulkia.fr` → API REST + WebSockets
- `logichain.fulkia.fr` → PWA front (à prévoir, pas à coder)

---

## Phase 0 — Setup VPS et projet (hors 35h)

### Infra Docker sur VPS

- Container MongoDB 7 en replica set mono-noeud (obligatoire pour Change Streams + transactions ACID)
- Container API Node.js + TypeScript
- Volume persistant pour les données Mongo
- Réseau interne `logichain-internal` (Mongo non exposé publiquement)
- Réseau externe `traefik_network` pour exposer l'API derrière Traefik
- Labels Traefik pour HTTPS auto sur `api-logichain.fulkia.fr` (certresolver `letsencrypt`)
- Healthcheck sur `/health` pour Traefik et Docker

### Setup projet Node.js

- TypeScript en mode strict (`strict: true`)
- ESLint + Prettier
- Jest + ts-jest pour les tests
- `.env.example` versionné, `.env` ignoré
- Arborescence N-Tier dès le départ

### À faire avant le premier `docker compose up`

- Créer l'enregistrement DNS A `api-logichain.fulkia.fr` → IP VPS
- Générer `JWT_SECRET` (`openssl rand -base64 64`)

---

## Phase 1 — Modélisation MongoDB (priorité 1)

### Réflexion avant code (souvent négligée, pourtant capitale)

- Lister les requêtes attendues côté front → en déduire les collections et les index
- Pas de jointures Mongo → on dénormalise et on imbrique
- Décider pour chaque relation : référence (`eventId`) ou imbrication (sous-document) ?

### Trois collections principales

- `events` : événements avec zones géospatiales, dates, capacités
- `items` : équipements avec QR code, statut, localisation GeoJSON, historique imbriqué
- `routes` : feuilles de route des transporteurs avec étapes

### Choix Mongoose techniques

- Validation côté Mongoose (pas MongoDB natif, comme demandé en cours)
- Sous-documents imbriqués pour l'historisation (mouvements d'un item)
- GeoJSON Point + index `2dsphere` pour la localisation
- `optimisticConcurrency: true` → utilise `__v` automatiquement (verrouillage optimiste pour la sync offline plus tard)
- Index composés sur les requêtes fréquentes (ex : `{ eventId: 1, status: 1 }`)
- Collection Time Series pour le monitoring si tu veux aller jusque-là

---

## Phase 2 — Architecture N-Tier (priorité 1, c'est ce qui sera noté)

### Quatre couches strictement cloisonnées

```
HTTP → Controller → Service → Repository → Mongoose
            ↓          ↓          ↓
          Zod      Entity     Entity (jamais de doc brut)
```

### Entity (couche métier pure)

- Classes TypeScript indépendantes de Mongoose
- Propriétés privées + getters (encapsulation)
- Méthodes métier qui contrôlent les transitions (ex : `allocateTo()`, `recordScan()`)
- Une `BaseEntity` abstraite avec `id`, `version`, `createdAt`, `updatedAt` → héritage justifié
- Méthode `toJSON()` pour la sérialisation HTTP (polymorphisme)

### Model (schéma Mongoose uniquement)

- Définition du document, validation native
- Index
- Aucun accès depuis l'extérieur du repository

### Repository (accès DB)

- Seul à parler à Mongoose
- Méthodes CRUD qui renvoient des **Entity** (jamais des documents bruts)
- Pipelines d'agrégation isolés ici
- Une `BaseRepository<TEntity, TDocument>` abstraite avec génériques

### Service (logique métier)

- Orchestre les repositories
- Aucune connaissance d'HTTP (pas de `req`/`res`)
- Indépendant et testable unitairement

### Controller (HTTP uniquement)

- Validation Zod des inputs (body, params, query)
- Appel du service
- Mapping du résultat vers la bonne réponse HTTP
- Aucune logique métier

---

## Phase 3 — Logique métier signature (priorité 2)

### Calcul d'empreinte carbone

- Service dédié `CarbonFootprintService`
- Méthodologie ADEME Base Carbone (facteurs d'émission par catégorie + transport)
- Calcul fabrication amorti sur durée de vie de l'équipement
- Calcul transport = distance × poids × facteur mode (camion/électrique/rail)
- Agrégation par événement et par catégorie pour le dashboard
- **Savoir l'expliquer à l'oral** : c'est explicite dans tes notes

### Algorithme du banquier pour l'allocation

- Service dédié `ResourceAllocationService`
- Adaptation du Banker's Algorithm de Dijkstra à l'allocation logistique
- Prévenir les goulots d'étranglement : refuser une allocation si elle laisse le système dans un état non-sûr
- État sûr = il existe une séquence d'événements où chaque demande peut être satisfaite séquentiellement
- À écrire en POO avec une classe `ResourceState`

---

## Phase 4 — API REST (priorité 3)

### Conventions Richardson niveau 2 minimum

| Action            | Verbe    | URL exemple                     |
|-------------------|----------|---------------------------------|
| Lister            | `GET`    | `/api/v1/events/:id/items`      |
| Détail            | `GET`    | `/api/v1/items/:id`             |
| Créer             | `POST`   | `/api/v1/items`                 |
| Modifier complet  | `PUT`    | `/api/v1/items/:id`             |
| Modifier partiel  | `PATCH`  | `/api/v1/items/:id`             |
| Supprimer         | `DELETE` | `/api/v1/items/:id`             |
| Action métier     | `POST`   | `/api/v1/items/:id/scan`        |

### Codes statut à utiliser systématiquement

- `200 OK` : lecture / mise à jour réussie
- `201 Created` : création (avec le body de la ressource créée)
- `204 No Content` : suppression
- `400 Bad Request` : input malformé
- `401 Unauthorized` : JWT manquant ou invalide
- `403 Forbidden` : authentifié mais pas autorisé
- `404 Not Found` : ressource inexistante
- `409 Conflict` : verrouillage optimiste (version stale)
- `422 Unprocessable Entity` : règle métier violée

### Format de réponse cohérent

- Succès liste : `{ data: [...], count: N }` (et plus tard pagination)
- Succès détail : objet ressource direct
- Erreur : `{ error: { code, message, details? } }`

### Sécurité

- JWT obligatoire sur toutes les routes `/api/v1/*` (sauf `/auth/login`)
- Helmet (headers de sécurité)
- CORS configuré pour autoriser `logichain.fulkia.fr` (le futur front)
- Validation Zod systématique avant d'appeler les services
- Tous les secrets en variables d'environnement

---

## Phase 5 — Tests unitaires (priorité 3)

### Périmètre strict : services uniquement

- C'est explicite dans tes notes
- Mocks des repositories (pas de vraie DB pour les tests unit)
- Focus sur les services à logique riche : `CarbonFootprintService`, `ResourceAllocationService`, `ItemService`
- Tester les branches `try/catch`, `switch`, conditions métier
- Tester les cas d'erreur (`BusinessRuleError`, `NotFoundError`, etc.)
- Objectif : ~70-80% de couverture sur les services

### Tests d'intégration manuels

- Collection Bruno ou Postman avec tous les endpoints
- Sert aussi de documentation vivante pour toi et le futur front

---

## Phase 6 — Préparer le front sans le coder (priorité 4)

### Ce qu'il faut faire dans l'API maintenant

- CORS configuré pour le domaine du futur front
- Format de réponse JSON stable et documenté
- Pagination prévue sur tous les `GET /list` (`?page=1&limit=20`)
- Filtres en query string (`?eventId=X&status=Y`)
- Documentation OpenAPI/Swagger ou simplement la collection Bruno bien commentée
- Endpoints WebSocket pensés mais non implémentés (juste prévoir l'architecture)

### Ce que le front devra faire (à documenter dans le README)

- Mobile-First PWA (Vue, React ou Angular)
- Service Worker via Workbox pour le mode offline
- IndexedDB pour le stockage local des items scannés hors ligne
- File de synchronisation au retour réseau (avec gestion des conflits 409 du verrouillage optimiste)
- Scanner QR via API navigateur (`BarcodeDetector` ou `html5-qrcode`)
- Connexion WebSocket pour les alertes temps réel

---

## Phase 7 — Hors périmètre MP3 mais à préparer

À mentionner dans le README pour montrer que c'est pensé :

- WebSockets / SSE pour les alertes temps réel (hooks Change Streams à câbler dans les repositories)
- Synchronisation offline complète (le champ `__v` est déjà là, la mécanique de merge sera côté front + endpoint dédié)
- Dashboard front
- Tests de charge intensifs (k6 ou autocannon)

---

## Récapitulatif Docker

### Sur le VPS, à terme tu auras

```
Traefik (déjà installé)
   │
   ├─ api-logichain.fulkia.fr  → container logichain-api
   │                                 │
   │                                 └─ container logichain-mongo (replica set rs0)
   │
   └─ logichain.fulkia.fr      → container logichain-front (plus tard)
```

### `docker-compose.yml` du back contient

- Service `mongo` : image `mongo:7.0`, commande `--replSet rs0`, volume persistant, healthcheck qui auto-initialise le replica set, **non exposé** sur l'hôte
- Service `api` : build du Dockerfile multi-stage, dépend du healthcheck de Mongo, labels Traefik pour HTTPS, headers de sécurité, redirection HTTP → HTTPS
- Network `traefik_network` en `external: true`
- Network `logichain-internal` en bridge pour la communication API ↔ Mongo

### Dockerfile multi-stage

- Stage 1 : install des deps (cache)
- Stage 2 : build TypeScript
- Stage 3 : deps de prod uniquement
- Stage 4 : image finale Alpine, utilisateur non-root, healthcheck

### Quand viendra le front (autre repo, autre `docker-compose.yml`)

- Container Nginx servant les fichiers statiques PWA
- Labels Traefik pour `logichain.fulkia.fr`
- Connecté au même `traefik_network`
- Variable d'env `VITE_API_URL=https://api-logichain.fulkia.fr/api/v1`

---

## Ordre de bataille suggéré pour le MP3

1. Setup VPS + Docker + projet TypeScript (hors 35h)
2. Modélisation des 3 collections + schémas Mongoose
3. Base architecture : `BaseEntity`, `BaseRepository`, erreurs, config
4. Slice complet `Item` (entity → controller → route) qui sert de référence
5. Dupliquer pour `Event` et `Route`
6. `CarbonFootprintService` + tests
7. `ResourceAllocationService` (banquier) + tests
8. Auth JWT + middlewares
9. Collection Bruno/Postman complète
10. README final avec ce qui est fait et ce qui est préparé pour la suite
