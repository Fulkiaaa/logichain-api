import type { Router } from 'express';

import type { UserRole } from '@/middlewares/auth.middleware';
import { itemRouter } from '@/modules/items/item.routes';
import { routeRouter } from '@/modules/routes/route.routes';

/**
 * Verrou de la matrice des permissions.
 *
 * Ce test ne vérifie pas un comportement isolé mais le CONTRAT d'autorisation
 * de l'API dans son ensemble : quel rôle peut appeler quel endpoint. Toute
 * ouverture ou fermeture de droit devient un échec de test explicite, ce qui
 * empêche qu'une permission parte à la dérive sans qu'on s'en aperçoive.
 *
 * `null` = ouvert à tout compte authentifié (requireAuth seul).
 */
type Expected = Record<string, readonly UserRole[] | null>;

/** Extrait la garde de rôle réellement branchée sur chaque route d'un routeur. */
function readMatrix(router: Router): Record<string, readonly UserRole[] | null> {
  const found: Record<string, readonly UserRole[] | null> = {};
  for (const layer of (router as unknown as { stack: RouterLayer[] }).stack) {
    if (!layer.route) continue;
    const method = Object.keys(layer.route.methods)[0]!.toUpperCase();
    const guard = layer.route.stack
      .map((l) => (l.handle as { allowedRoles?: readonly UserRole[] }).allowedRoles)
      .find((r): r is readonly UserRole[] => Array.isArray(r));
    found[`${method} ${layer.route.path}`] = guard ?? null;
  }
  return found;
}

interface RouterLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: unknown }[];
  };
}

const ITEMS: Expected = {
  'GET /': null,
  'POST /': ['admin', 'logistics_manager'],
  'GET /by-qr/:qrCode': null,
  'GET /:id': null,
  'PATCH /:id': ['admin', 'logistics_manager'],
  'DELETE /:id': ['admin'],
  // Gestes de terrain : ouverts, y compris au transporteur qui constate une
  // perte ou une anomalie pendant l'acheminement.
  'POST /:id/scan': null,
  'POST /:id/transit': null,
  'POST /:id/anomaly': null,
  'POST /:id/lost': null,
  // Décision de planification, pas un geste de terrain.
  'POST /:id/allocate': ['admin', 'logistics_manager'],
  // Un transporteur achemine, il n'installe pas sur site.
  'POST /:id/deploy': ['admin', 'logistics_manager', 'field_agent'],
  'POST /:id/maintenance': ['admin', 'logistics_manager', 'field_agent'],
  'POST /:id/return': ['admin', 'logistics_manager', 'field_agent'],
};

const ROUTES: Expected = {
  'GET /': null,
  'POST /': ['admin', 'logistics_manager'],
  'GET /:id': null,
  'DELETE /:id': ['admin', 'logistics_manager'],
  'POST /:id/transition': ['admin', 'logistics_manager'],
  // Les deux gestes propres au transporteur.
  'POST /:id/distance': ['admin', 'logistics_manager', 'transporter'],
  'POST /:id/stops/:stopId/complete': ['admin', 'logistics_manager', 'transporter'],
  'POST /:id/stops/:stopId/items': ['admin', 'logistics_manager'],
};

describe('matrice des permissions', () => {
  it('items : chaque endpoint porte la garde attendue', () => {
    expect(readMatrix(itemRouter)).toEqual(ITEMS);
  });

  it('itinéraires : chaque endpoint porte la garde attendue', () => {
    expect(readMatrix(routeRouter)).toEqual(ROUTES);
  });

  it('field_agent et transporter ne sont plus interchangeables', () => {
    const all = {...readMatrix(itemRouter), ...readMatrix(routeRouter)};
    const guards = Object.values(all).filter((g): g is readonly UserRole[] => g !== null);
    // Au moins un endpoint autorise l'un sans l'autre, dans les deux sens.
    expect(guards.some((g) => g.includes('field_agent') && !g.includes('transporter'))).toBe(true);
    expect(guards.some((g) => g.includes('transporter') && !g.includes('field_agent'))).toBe(true);
  });
});
