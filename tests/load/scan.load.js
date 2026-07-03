/**
 * Test de charge k6 — scénario « pic de scans » (montage / démontage).
 *
 * Le sujet exige de valider la performance par des tests de charge intensifs.
 * On martèle ici `POST /api/v1/items/:id/scan`, l'endpoint le plus sollicité
 * sur le terrain, en simulant une montée en charge d'agents scannant en
 * parallèle.
 *
 * Prérequis : l'API tourne et un compte admin existe (voir README).
 *
 * Lancement :
 *   BASE_URL=http://localhost:3000 \
 *   ADMIN_EMAIL=admin@logichain.fr ADMIN_PASSWORD=motdepasse \
 *   k6 run tests/load/scan.load.js
 *
 * Note : sous forte concurrence sur un même item, le verrouillage optimiste
 * renvoie des 409 Conflict — c'est le comportement ATTENDU (isolation des
 * accès concurrents). On répartit donc les scans sur un pool d'items et on
 * suit les 409 dans une métrique dédiée plutôt que de les compter en erreurs.
 */
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@logichain.fr';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'ChangeMe!2026';
const POOL_SIZE = Number(__ENV.POOL_SIZE || 50);

const conflicts = new Counter('optimistic_conflicts'); // 409 attendus

export const options = {
  scenarios: {
    scan_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 25 }, // arrivée progressive des agents
        { duration: '30s', target: 50 }, // pic de scans simultanés
        { duration: '15s', target: 0 }, // fin de vague
      ],
      gracefulStop: '5s',
    },
  },
  thresholds: {
    // 95 % des scans doivent répondre sous 500 ms (écriture + verrou optimiste).
    http_req_duration: ['p(95)<500'],
    // Hors 409 (attendus), le taux d'échec réel doit rester marginal.
    checks: ['rate>0.98'],
  },
};

function authHeaders(token) {
  return { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
}

export function setup() {
  // 1) Authentification admin.
  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(loginRes, { 'login 200': (r) => r.status === 200 });
  const token = loginRes.json('token');
  if (!token) {
    throw new Error(`Login échoué (${loginRes.status}) — vérifie ADMIN_EMAIL/ADMIN_PASSWORD`);
  }

  // 2) Création d'un pool d'items à scanner (répartit la charge, limite les 409).
  const itemIds = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const res = http.post(
      `${BASE_URL}/api/v1/items`,
      JSON.stringify({
        qrCode: `LOAD-${Date.now()}-${i}`,
        label: `Item de charge ${i}`,
        category: 'sound',
        weightKg: 12.5,
      }),
      authHeaders(token),
    );
    if (res.status === 201) itemIds.push(res.json('id'));
  }
  if (itemIds.length === 0) {
    throw new Error('Impossible de créer des items pour le test de charge');
  }
  return { token, itemIds };
}

export default function (data) {
  const { token, itemIds } = data;
  // Chaque VU cible un item distinct autant que possible.
  const itemId = itemIds[(__VU - 1) % itemIds.length];

  const res = http.post(
    `${BASE_URL}/api/v1/items/${itemId}/scan`,
    JSON.stringify({
      location: {
        type: 'Point',
        coordinates: [2.3522 + Math.random() * 0.01, 48.8566 + Math.random() * 0.01],
      },
      note: 'scan de charge',
    }),
    authHeaders(token),
  );

  if (res.status === 409) conflicts.add(1);

  // Un scan est « OK » s'il aboutit (200) ou s'il est proprement rejeté par le
  // verrou optimiste (409). Tout autre code est une vraie anomalie.
  check(res, { 'scan 200 ou 409': (r) => r.status === 200 || r.status === 409 });
}
