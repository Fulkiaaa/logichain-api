/**
 * Génération du document OpenAPI 3.0 à partir des schémas Zod existants.
 *
 * Single source of truth : les mêmes schémas qui valident les requêtes HTTP
 * (middleware `validate`) servent à documenter l'API. Aucune doc à maintenir
 * à la main — elle est toujours synchro avec les règles de validation.
 */
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from '@/modules/auth/auth.schemas';
import { USER_ROLES } from '@/modules/auth/user.model';
import {
  addZoneSchema,
  allocateItemsSchema,
  createEventSchema,
  listEventsQuerySchema,
  transitionEventSchema,
  updateEventSchema,
  zoneIdParamSchema,
} from '@/modules/events/event.schemas';
import { ITEM_CATEGORIES } from '@/modules/items/item.model';
import {
  allocateSchema,
  anomalySchema,
  createItemSchema,
  deploySchema,
  idParamSchema,
  listItemsQuerySchema,
  lostSchema,
  objectIdSchema,
  scanSchema,
  transitSchema,
  updateItemSchema,
} from '@/modules/items/item.schemas';
import {
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_TYPES,
} from '@/modules/notifications/notification.model';
import { listNotificationsQuerySchema } from '@/modules/notifications/notification.schemas';
import {
  addItemsToStopSchema,
  completeStopSchema,
  createRouteSchema,
  listRoutesQuerySchema,
  recordDistanceSchema,
  stopParamSchema,
  transitionRouteSchema,
} from '@/modules/routes/route.schemas';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});
const SECURED = [{ [bearerAuth.name]: [] as string[] }];

// ----- Schémas de réponse réutilisables (forme des entity.toJSON()) ---------
const errorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .openapi('Error');

const json = (schema: z.ZodTypeAny) => ({ content: { 'application/json': { schema } } });
const err = (description: string) => ({ description, content: { 'application/json': { schema: errorSchema } } });

const paginated = (item: z.ZodTypeAny, name: string) =>
  z
    .object({
      data: z.array(item),
      count: z.number().int(),
      page: z.number().int(),
      limit: z.number().int(),
      totalPages: z.number().int(),
    })
    .openapi(name);

const userSchema = z
  .object({
    id: z.string(),
    email: z.string().email(),
    fullName: z.string(),
    role: z.enum(USER_ROLES),
    active: z.boolean(),
    mustChangePassword: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('User');

const tokenSchema = z
  .object({ token: z.string(), refreshToken: z.string(), user: userSchema })
  .openapi('AuthTokens');

const movementSchema = z.object({
  at: z.string(),
  type: z.enum(['scan', 'allocation', 'transit', 'deploy', 'maintenance', 'anomaly', 'return']),
  fromStatus: z.string().optional(),
  toStatus: z.string(),
  location: z.unknown().nullable().optional(),
  operatorId: z.string(),
  note: z.string().optional(),
});

const itemSchema = z
  .object({
    id: z.string(),
    version: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
    qrCode: z.string(),
    label: z.string(),
    category: z.enum(ITEM_CATEGORIES),
    status: z.string(),
    eventId: z.string().nullable(),
    location: z.unknown().nullable(),
    weightKg: z.number(),
    purchasePriceEur: z.number().nullable(),
    lifespanYears: z.number(),
    manufacturingCo2Kg: z.number(),
    history: z.array(movementSchema),
  })
  .openapi('Item');

const eventSchema = z
  .object({
    id: z.string(),
    version: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
    name: z.string(),
    slug: z.string(),
    status: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    expectedAttendance: z.number().nullable().optional(),
    zones: z.array(z.unknown()),
    managerId: z.string(),
  })
  .openapi('Event');

const routeSchema = z
  .object({
    id: z.string(),
    version: z.number().int(),
    reference: z.string(),
    eventId: z.string(),
    transporterId: z.string(),
    mode: z.string(),
    status: z.string(),
    plannedDistanceKm: z.number(),
    actualDistanceKm: z.number().nullable().optional(),
    totalWeightKg: z.number(),
    stops: z.array(z.unknown()),
  })
  .openapi('Route');

const qrParam = z.object({ qrCode: z.string() });

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------
registry.registerPath({
  method: 'post', path: '/api/v1/auth/login', tags: ['Auth'], summary: 'Authentification (JWT)',
  request: { body: json(loginSchema) },
  responses: { 200: { description: 'Tokens émis', ...json(tokenSchema) }, 400: err('Validation'), 401: err('Identifiants invalides') },
});
registry.registerPath({
  method: 'post', path: '/api/v1/auth/refresh', tags: ['Auth'], summary: 'Renouveler le token',
  request: { body: json(refreshSchema) },
  responses: { 200: { description: 'Nouveaux tokens', ...json(tokenSchema) }, 401: err('Refresh token invalide') },
});
registry.registerPath({
  method: 'post', path: '/api/v1/auth/register', tags: ['Auth'], summary: 'Créer un utilisateur (admin)',
  security: SECURED, request: { body: json(registerSchema) },
  responses: { 201: { description: 'Utilisateur créé', ...json(userSchema) }, 401: err('Non authentifié'), 403: err('Rôle insuffisant'), 409: err('Email déjà utilisé') },
});
registry.registerPath({
  method: 'patch', path: '/api/v1/auth/password', tags: ['Auth'],
  summary: 'Changer son mot de passe (obligatoire à la première connexion)',
  description:
    "Un compte créé par un admin porte un mot de passe temporaire : toutes les " +
    'routes métier lui répondent 403 PASSWORD_CHANGE_REQUIRED tant qu\'il ne l\'a ' +
    'pas remplacé ici. La réponse contient une NOUVELLE paire de jetons — ' +
    "l'ancienne porte encore le drapeau et resterait bloquée.",
  security: SECURED, request: { body: json(changePasswordSchema) },
  responses: {
    200: { description: 'Mot de passe changé, jetons renouvelés', ...json(tokenSchema) },
    400: err('Validation'),
    401: err('Non authentifié ou mot de passe actuel invalide'),
    422: err('Le nouveau mot de passe est identique à l\'actuel'),
  },
});
registry.registerPath({
  method: 'get', path: '/api/v1/auth/me', tags: ['Auth'], summary: 'Profil courant',
  security: SECURED, responses: { 200: { description: 'Utilisateur', ...json(userSchema) }, 401: err('Non authentifié') },
});

// ---------------------------------------------------------------------------
// ITEMS
// ---------------------------------------------------------------------------
registry.registerPath({
  method: 'get', path: '/api/v1/items', tags: ['Items'], summary: 'Lister les items',
  security: SECURED, request: { query: listItemsQuerySchema },
  responses: { 200: { description: 'Liste paginée', ...json(paginated(itemSchema, 'ItemPage')) }, 401: err('Non authentifié') },
});
registry.registerPath({
  method: 'post', path: '/api/v1/items', tags: ['Items'], summary: 'Créer un item',
  security: SECURED, request: { body: json(createItemSchema) },
  responses: { 201: { description: 'Item créé', ...json(itemSchema) }, 400: err('Validation'), 403: err('Réservé aux admins et responsables logistiques'), 409: err('QR déjà existant') },
});
registry.registerPath({
  method: 'get', path: '/api/v1/items/by-qr/{qrCode}', tags: ['Items'], summary: 'Item par code QR (scan)',
  security: SECURED, request: { params: qrParam },
  responses: { 200: { description: 'Item', ...json(itemSchema) }, 404: err('Introuvable') },
});
registry.registerPath({
  method: 'get', path: '/api/v1/items/{id}', tags: ['Items'], summary: 'Item par id',
  security: SECURED, request: { params: idParamSchema },
  responses: { 200: { description: 'Item', ...json(itemSchema) }, 404: err('Introuvable') },
});
registry.registerPath({
  method: 'patch', path: '/api/v1/items/{id}', tags: ['Items'], summary: 'Modifier un item',
  security: SECURED, request: { params: idParamSchema, body: json(updateItemSchema) },
  responses: { 200: { description: 'Item modifié', ...json(itemSchema) }, 403: err('Réservé aux admins et responsables logistiques'), 409: err('Conflit de version') },
});
registry.registerPath({
  method: 'delete', path: '/api/v1/items/{id}', tags: ['Items'], summary: 'Supprimer un item',
  security: SECURED, request: { params: idParamSchema },
  responses: { 204: { description: 'Supprimé' }, 403: err('Réservé aux admins'), 404: err('Introuvable'), 422: err('Item en cours d\'utilisation') },
});
const itemActions: Array<[string, string, z.ZodTypeAny]> = [
  ['scan', 'Scan terrain (géolocalisé)', scanSchema],
  ['allocate', 'Allouer à un événement', allocateSchema],
  ['transit', 'Démarrer le transit', transitSchema],
  ['deploy', 'Déployer sur site', deploySchema],
  ['anomaly', 'Déclarer une anomalie', anomalySchema],
  ['lost', 'Marquer perdu', lostSchema],
];
for (const [action, summary, schema] of itemActions) {
  registry.registerPath({
    method: 'post', path: `/api/v1/items/{id}/${action}`, tags: ['Items'], summary,
    security: SECURED, request: { params: idParamSchema, body: json(schema) },
    responses: { 200: { description: 'Item mis à jour', ...json(itemSchema) }, 404: err('Introuvable'), 409: err('Conflit de version'), 422: err('Transition interdite') },
  });
}
registry.registerPath({
  method: 'post', path: '/api/v1/items/{id}/return', tags: ['Items'], summary: 'Retour au stock',
  security: SECURED, request: { params: idParamSchema },
  responses: { 200: { description: 'Item retourné', ...json(itemSchema) }, 422: err('Transition interdite') },
});

// ---------------------------------------------------------------------------
// EVENTS
// ---------------------------------------------------------------------------
registry.registerPath({
  method: 'get', path: '/api/v1/events', tags: ['Events'], summary: 'Lister les événements',
  security: SECURED, request: { query: listEventsQuerySchema },
  responses: { 200: { description: 'Liste paginée', ...json(paginated(eventSchema, 'EventPage')) } },
});
registry.registerPath({
  method: 'post', path: '/api/v1/events', tags: ['Events'], summary: 'Créer un événement',
  security: SECURED, request: { body: json(createEventSchema) },
  responses: { 201: { description: 'Événement créé', ...json(eventSchema) }, 400: err('Validation'), 403: err('Rôle insuffisant') },
});
registry.registerPath({
  method: 'get', path: '/api/v1/events/{id}', tags: ['Events'], summary: 'Événement par id',
  security: SECURED, request: { params: idParamSchema },
  responses: { 200: { description: 'Événement', ...json(eventSchema) }, 404: err('Introuvable') },
});
registry.registerPath({
  method: 'patch', path: '/api/v1/events/{id}', tags: ['Events'], summary: 'Modifier un événement',
  security: SECURED, request: { params: idParamSchema, body: json(updateEventSchema) },
  responses: { 200: { description: 'Événement modifié', ...json(eventSchema) }, 409: err('Conflit de version') },
});
registry.registerPath({
  method: 'delete', path: '/api/v1/events/{id}', tags: ['Events'], summary: 'Supprimer un événement',
  security: SECURED, request: { params: idParamSchema },
  responses: { 204: { description: 'Supprimé' }, 403: err('Rôle insuffisant'), 404: err('Introuvable') },
});
registry.registerPath({
  method: 'post', path: '/api/v1/events/{id}/transition', tags: ['Events'], summary: 'Changer le statut',
  security: SECURED, request: { params: idParamSchema, body: json(transitionEventSchema) },
  responses: { 200: { description: 'Statut changé', ...json(eventSchema) }, 422: err('Transition interdite') },
});
registry.registerPath({
  method: 'post', path: '/api/v1/events/{id}/zones', tags: ['Events'], summary: 'Ajouter une zone (GeoJSON)',
  security: SECURED, request: { params: idParamSchema, body: json(addZoneSchema) },
  responses: { 201: { description: 'Zone ajoutée', ...json(eventSchema) }, 400: err('Polygone invalide') },
});
registry.registerPath({
  method: 'delete', path: '/api/v1/events/{id}/zones/{zoneId}', tags: ['Events'], summary: 'Supprimer une zone',
  security: SECURED, request: { params: zoneIdParamSchema },
  responses: { 200: { description: 'Zone supprimée', ...json(eventSchema) }, 404: err('Introuvable') },
});
registry.registerPath({
  method: 'get', path: '/api/v1/events/{id}/items', tags: ['Events'], summary: 'Items d\'un événement',
  security: SECURED, request: { params: idParamSchema },
  responses: { 200: { description: 'Liste paginée', ...json(paginated(itemSchema, 'EventItemPage')) } },
});
registry.registerPath({
  method: 'post', path: '/api/v1/events/{id}/allocate', tags: ['Events'],
  summary: 'Allocation atomique d\'un lot (transaction ACID)',
  description: 'Tout-ou-rien : un seul échec (404/422/409) annule l\'allocation de tout le lot.',
  security: SECURED, request: { params: idParamSchema, body: json(allocateItemsSchema) },
  responses: {
    200: { description: 'Lot alloué', ...json(z.object({ eventId: z.string(), allocated: z.number().int(), items: z.array(itemSchema) }).openapi('AllocateBatchResult')) },
    404: err('Item ou événement introuvable (rollback)'),
    409: err('Conflit de version (rollback)'),
    422: err('Item non allouable (rollback)'),
  },
});

// ---------------------------------------------------------------------------
// ROUTES
// ---------------------------------------------------------------------------
registry.registerPath({
  method: 'get', path: '/api/v1/routes', tags: ['Routes'], summary: 'Lister les feuilles de route',
  security: SECURED, request: { query: listRoutesQuerySchema },
  responses: { 200: { description: 'Liste paginée', ...json(paginated(routeSchema, 'RoutePage')) } },
});
registry.registerPath({
  method: 'post', path: '/api/v1/routes', tags: ['Routes'], summary: 'Créer une feuille de route',
  security: SECURED, request: { body: json(createRouteSchema) },
  responses: { 201: { description: 'Route créée', ...json(routeSchema) }, 400: err('Validation'), 403: err('Rôle insuffisant') },
});
registry.registerPath({
  method: 'get', path: '/api/v1/routes/{id}', tags: ['Routes'], summary: 'Route par id',
  security: SECURED, request: { params: idParamSchema },
  responses: { 200: { description: 'Route', ...json(routeSchema) }, 404: err('Introuvable') },
});
registry.registerPath({
  method: 'delete', path: '/api/v1/routes/{id}', tags: ['Routes'], summary: 'Supprimer une route',
  security: SECURED, request: { params: idParamSchema },
  responses: { 204: { description: 'Supprimée' }, 403: err('Rôle insuffisant') },
});
registry.registerPath({
  method: 'post', path: '/api/v1/routes/{id}/transition', tags: ['Routes'], summary: 'Changer le statut',
  security: SECURED, request: { params: idParamSchema, body: json(transitionRouteSchema) },
  responses: { 200: { description: 'Statut changé', ...json(routeSchema) }, 422: err('Transition interdite') },
});
registry.registerPath({
  method: 'post', path: '/api/v1/routes/{id}/distance', tags: ['Routes'], summary: 'Enregistrer la distance réelle',
  security: SECURED, request: { params: idParamSchema, body: json(recordDistanceSchema) },
  responses: { 200: { description: 'Distance enregistrée', ...json(routeSchema) } },
});
registry.registerPath({
  method: 'post', path: '/api/v1/routes/{id}/stops/{stopId}/complete', tags: ['Routes'], summary: 'Valider une étape',
  security: SECURED, request: { params: stopParamSchema, body: json(completeStopSchema) },
  responses: { 200: { description: 'Étape validée', ...json(routeSchema) }, 422: err('Route non démarrée') },
});
registry.registerPath({
  method: 'post', path: '/api/v1/routes/{id}/stops/{stopId}/items', tags: ['Routes'], summary: 'Affecter des items à une étape',
  security: SECURED, request: { params: stopParamSchema, body: json(addItemsToStopSchema) },
  responses: { 200: { description: 'Items affectés', ...json(routeSchema) }, 403: err('Rôle insuffisant') },
});

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
const allocationRequestSchema = z
  .object({
    eventId: objectIdSchema,
    category: z.enum(ITEM_CATEGORIES),
    quantity: z.number().int().positive(),
    forecasts: z.record(z.string(), z.record(z.string(), z.number().nonnegative())),
  })
  .openapi('AllocationCheckRequest');

registry.registerPath({
  method: 'get', path: '/api/v1/dashboard/events/{id}/carbon-footprint', tags: ['Dashboard'],
  summary: 'Empreinte carbone consolidée (ADEME)',
  security: SECURED, request: { params: idParamSchema },
  responses: { 200: { description: 'Rapport carbone', ...json(z.record(z.string(), z.unknown())) }, 404: err('Introuvable') },
});
const routeLatencySchema = z
  .object({
    route: z.string(),
    method: z.string(),
    count: z.number().int(),
    avgMs: z.number(),
    p95Ms: z.number(),
    maxMs: z.number(),
  })
  .openapi('RouteLatency');

registry.registerPath({
  method: 'get', path: '/api/v1/dashboard/metrics', tags: ['Dashboard'],
  summary: 'Latences par route (Time Series, admin)',
  description: 'Agrégation des latences HTTP sur la dernière heure depuis la collection Time Series de monitoring.',
  security: SECURED,
  responses: {
    200: { description: 'Latences agrégées', ...json(z.object({ windowMinutes: z.number().int(), routes: z.array(routeLatencySchema) })) },
    403: err('Rôle insuffisant'),
  },
});
registry.registerPath({
  method: 'get', path: '/api/v1/dashboard/emission-factors', tags: ['Dashboard'], summary: 'Facteurs d\'émission (cache ADEME)',
  security: SECURED, responses: { 200: { description: 'Snapshot des facteurs', ...json(z.record(z.string(), z.unknown())) } },
});
registry.registerPath({
  method: 'post', path: '/api/v1/dashboard/emission-factors/refresh', tags: ['Dashboard'], summary: 'Forcer le refresh ADEME (admin)',
  security: SECURED, responses: { 200: { description: 'Cache rafraîchi', ...json(z.record(z.string(), z.unknown())) }, 403: err('Rôle insuffisant') },
});
registry.registerPath({
  method: 'post', path: '/api/v1/dashboard/allocations/check', tags: ['Dashboard'],
  summary: 'Vérifier la sûreté d\'une allocation (algorithme du banquier)',
  security: SECURED, request: { body: json(allocationRequestSchema) },
  responses: {
    200: { description: 'Allocation sûre (accordée)', ...json(z.record(z.string(), z.unknown())) },
    422: { description: 'État non sûr (refusée)', ...json(z.record(z.string(), z.unknown())) },
  },
});

// ---------------------------------------------------------------------------
// NOTIFICATIONS (temps réel)
// ---------------------------------------------------------------------------
const notificationSchema = z
  .object({
    id: z.string(),
    version: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
    type: z.enum(NOTIFICATION_TYPES),
    severity: z.enum(NOTIFICATION_SEVERITIES),
    title: z.string(),
    message: z.string(),
    eventId: z.string().nullable(),
    itemId: z.string().nullable(),
    audience: z.array(z.enum(USER_ROLES)),
    read: z.boolean(),
  })
  .openapi('Notification');

registry.registerPath({
  method: 'get', path: '/api/v1/notifications/stream', tags: ['Notifications'],
  summary: 'Flux temps réel (Server-Sent Events)',
  description:
    'Ouvre un flux SSE. Authentification par header Bearer **ou** paramètre `?token=` ' +
    '(pour `EventSource`). Émet un event `notification` à chaque incident critique ' +
    '(anomalie, perte d\'équipement, annulation d\'événement), détecté en temps réel ' +
    'via les **Change Streams** MongoDB.',
  security: SECURED,
  responses: {
    200: { description: 'Flux SSE ouvert (text/event-stream)', content: { 'text/event-stream': { schema: z.string() } } },
    401: err('Non authentifié'),
  },
});
registry.registerPath({
  method: 'get', path: '/api/v1/notifications', tags: ['Notifications'], summary: 'Lister les notifications',
  security: SECURED, request: { query: listNotificationsQuerySchema },
  responses: { 200: { description: 'Liste paginée', ...json(paginated(notificationSchema, 'NotificationPage')) } },
});
registry.registerPath({
  method: 'post', path: '/api/v1/notifications/{id}/read', tags: ['Notifications'], summary: 'Marquer comme lue',
  security: SECURED, request: { params: idParamSchema },
  responses: { 200: { description: 'Notification lue', ...json(notificationSchema) }, 404: err('Introuvable') },
});

// ---------------------------------------------------------------------------
// HEALTH
// ---------------------------------------------------------------------------
registry.registerPath({
  method: 'get', path: '/health', tags: ['Health'], summary: 'Sonde de santé',
  responses: { 200: { description: 'Service en ligne', ...json(z.object({ status: z.string(), service: z.string(), timestamp: z.string() })) } },
});

// ---------------------------------------------------------------------------
const generator = new OpenApiGeneratorV3(registry.definitions);

export const openApiDocument = generator.generateDocument({
  openapi: '3.0.0',
  info: {
    title: 'LogiChain API',
    version: '1.0.0',
    description:
      'API REST de la plateforme logistique événementielle LogiChain (MP3). ' +
      'Documentation générée automatiquement depuis les schémas de validation Zod. ' +
      'Authentification : `POST /api/v1/auth/login` puis bouton **Authorize** (Bearer JWT).',
  },
  servers: [
    { url: 'https://api-logichain.fulkia.fr', description: 'Production' },
    { url: 'http://localhost:3000', description: 'Local' },
  ],
  tags: [
    { name: 'Auth', description: 'Authentification & utilisateurs' },
    { name: 'Items', description: 'Équipements et cycle de vie' },
    { name: 'Events', description: 'Événements, zones, allocation' },
    { name: 'Routes', description: 'Feuilles de route transporteurs' },
    { name: 'Dashboard', description: 'KPI, empreinte carbone, allocation sûre' },
    { name: 'Notifications', description: 'Alertes temps réel (SSE + Change Streams)' },
    { name: 'Health', description: 'Supervision' },
  ],
});
