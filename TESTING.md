# Tester LogiChain API — pas à pas

Guide pratique pour valider chaque pan de l'API en local. Suppose que
`docker compose up -d mongo` tourne et que `npm run dev` est lancé.

---

## Étape 0 — Vérifier que ça vit

Dans un terminal séparé (sans tuer `npm run dev`) :

```bash
curl http://localhost:3000/health
```

Réponse attendue :
```json
{"status":"ok","service":"logichain-api","timestamp":"..."}
```

---

## Étape 1 — Créer le premier admin

Il faut un compte pour pouvoir s'authentifier. Génère un hash bcrypt :

```bash
node -e "require('bcrypt').hash('motdepasse123', 12).then(console.log)"
```

Copie le hash, puis dans un autre terminal :

```bash
docker exec -it logichain-mongo mongosh
```

Dans `mongosh` :

```js
use logichain
db.users.insertOne({
  email: "admin@logichain.fr",
  passwordHash: "$2b$12$...COLLE_TON_HASH_ICI...",
  fullName: "Clara Admin",
  role: "admin",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  __v: 0
})
exit
```

 <!-- db.users.insertOne({
    email: "admin@logichain.fr",
    passwordHash: "$2b$12$...........................",
    fullName: "Clara Admin",
    role: "admin",
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    __v: 0
  }) -->



---

## Étape 2 — Se connecter avec curl

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@logichain.fr","password":"Admin123."}'
```

Tu récupères `{ "token": "...", "refreshToken": "...", "user": {...} }`.

Pour s'épargner la copie à chaque fois, stocke le token en variable shell :

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@logichain.fr","password":"motdepasse123"}' | jq -r .token)
echo $TOKEN
```

(installe `jq` avec `brew install jq` si tu ne l'as pas)

---

## Étape 3 — Créer un événement

```bash
curl -X POST http://localhost:3000/api/v1/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Festival Vert 2026",
    "slug":"festival-vert-2026",
    "startDate":"2026-06-01T00:00:00Z",
    "endDate":"2026-06-05T00:00:00Z",
    "expectedAttendance":10000,
    "managerId":"clara",
    "zones":[]
  }'
```

Récupère l'`id` renvoyé :

```bash
EVENT_ID="6a0edd6de1552eeb8e20c388"
```

---

## Étape 4 — Créer un item

```bash
curl -X POST http://localhost:3000/api/v1/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "qrCode":"QR-LED-001",
    "label":"Projecteur LED 200W",
    "category":"lighting",
    "weightKg":8.5,
    "purchasePriceEur":1200,
    "lifespanYears":8,
    "manufacturingCo2Kg":320
  }'
```

Récupère son `id` :

```bash
ITEM_ID="6a0edd98e1552eeb8e20c38b"
```

---

## Étape 5 — Faire vivre l'item (machine à états)

```bash
# Allouer l'item à l'événement (in_stock → allocated)
curl -X POST http://localhost:3000/api/v1/items/$ITEM_ID/allocate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"eventId\":\"$EVENT_ID\"}"

# Scanner sur le terrain
curl -X POST http://localhost:3000/api/v1/items/$ITEM_ID/scan \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"location":{"type":"Point","coordinates":[2.35,48.85]},"note":"Scan dépôt"}'

# Démarrer le transit
curl -X POST http://localhost:3000/api/v1/items/$ITEM_ID/transit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Déployer sur site
curl -X POST http://localhost:3000/api/v1/items/$ITEM_ID/deploy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"location":{"type":"Point","coordinates":[2.50,48.95]}}'

# Lire l'historique complet
curl http://localhost:3000/api/v1/items/$ITEM_ID \
  -H "Authorization: Bearer $TOKEN"
```

Regarde le champ `history` — tu vois toute la traçabilité avec
géolocalisation et opérateur.

---

## Étape 6 — Tester une violation de règle métier

Crée un autre item, puis essaye de le transiter alors qu'il est encore
en stock :


```bash
AUTRE_ITEM_ID=$(curl -s -X POST http://localhost:3000/api/v1/items \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "qrCode":"QR-LED-002",
      "label":"Projecteur LED 200W bis",
      "category":"lighting",
      "weightKg":8.5,
      "lifespanYears":8,
      "manufacturingCo2Kg":320
    }' | jq -r .id)

  echo $AUTRE_ITEM_ID
```

Récupère son `id` :

```bash
AUTRE_ITEM_ID="6a0ede3ae1552eeb8e20c397"
```

```bash
curl -X POST http://localhost:3000/api/v1/items/$AUTRE_ITEM_ID/transit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Réponse attendue (HTTP 422) :

```json
{
  "error": {
    "code": "BUSINESS_RULE_VIOLATION",
    "message": "Transition interdite : in_stock → in_transit",
    "details": {
      "rule": "item.invalid_transition",
      "from": "in_stock",
      "to": "in_transit",
      "allowed": ["allocated", "in_maintenance", "lost"]
    }
  }
}
```

C'est l'**entité** qui refuse — pas le contrôleur. C'est ça qu'il faut
montrer en démo POO.

---

## Étape 7 — Tester l'empreinte carbone

Crée d'abord une route de transport (voir Bruno `04-Routes/Create route`) :

```bash
curl -X POST http://localhost:3000/api/v1/routes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"reference\":\"RTE-001\",
    \"eventId\":\"$EVENT_ID\",
    \"transporterId\":\"transporter-1\",
    \"mode\":\"electric_truck\",
    \"plannedDistanceKm\":180,
    \"totalWeightKg\":2500,
    \"stops\":[
      {\"sequence\":0,\"label\":\"Dépôt\",\"type\":\"pickup\",
       \"location\":{\"type\":\"Point\",\"coordinates\":[2.30,48.80]},
       \"scheduledAt\":\"2026-05-31T08:00:00Z\",\"itemIds\":[]},
      {\"sequence\":1,\"label\":\"Site\",\"type\":\"dropoff\",
       \"location\":{\"type\":\"Point\",\"coordinates\":[2.50,48.95]},
       \"scheduledAt\":\"2026-05-31T12:00:00Z\",\"itemIds\":[]}
    ]
  }"
```

Puis demande le rapport :

```bash
curl http://localhost:3000/api/v1/dashboard/events/$EVENT_ID/carbon-footprint \
  -H "Authorization: Bearer $TOKEN"
```

Tu vois le breakdown : `manufacturingCo2Kg`, `transportCo2Kg`,
`byCategory`, `byTransportMode`.

**Vérifie à la main avec la formule du README §4.1** — c'est ce que le
prof te demandera.

Calcul attendu pour ce camion électrique :
```
co2_transport = (2500 / 1000) tonnes × 180 km × 0.040 = 18 kgCO2e
```

---

## Étape 8 — Tester le banquier

```bash
curl -X POST http://localhost:3000/api/v1/dashboard/allocations/check \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"eventId\":\"$EVENT_ID\",
    \"category\":\"lighting\",
    \"quantity\":3,
    \"forecasts\":{\"$EVENT_ID\":{\"lighting\":10}}
  }"
```

Deux issues possibles :

- **`granted: true`** → l'allocation laisse le système en état sûr.
  `safeSequence` te donne l'ordre dans lequel les événements pourraient
  être servis sans blocage.

- **`granted: false`** (HTTP 422) → la raison te dit pourquoi :
  - stock insuffisant
  - dépasse le besoin max
  - état résultant non-sûr (risque de goulot)

---

## Étape 9 — Utiliser Bruno (plus confortable que curl)

Installe Bruno : <https://www.usebruno.com/downloads>

Puis : `File → Open Collection → choisis le dossier bruno/` du projet.
Sélectionne l'env `local`. Tu lances `01-Auth/Login`, le token se stocke
automatiquement, et toutes les autres requêtes l'utilisent.

Lance dans l'ordre :
1. `01-Auth/Login`
2. `03-Events/Create event` (stocke `eventId`)
3. `02-Items/Create item` (stocke `itemId`)
4. `02-Items/Allocate to event`
5. `02-Items/Scan item (terrain)`
6. `04-Routes/Create route`
7. `05-Dashboard/Carbon footprint of event`
8. `05-Dashboard/Check allocation (Banker's)`

---

## Étape 10 — Les tests automatiques

```bash
npm test
```

26 tests sur les 2 services signature. Ils prouvent que :

- L'amortissement carbone respecte la formule ADEME
- Les facteurs de transport sont les bons (truck 0.105, rail 0.0095…)
- Le banquier détecte les états non-sûrs (test « exemple Dijkstra classique »)
- L'immutabilité de `ResourceState.withAllocation()` est garantie

Pour la couverture détaillée :

```bash
npm run test:coverage
open coverage/lcov-report/index.html
```
