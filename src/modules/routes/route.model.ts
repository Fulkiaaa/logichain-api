import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const ROUTE_STATUSES = ['draft', 'planned', 'in_progress', 'completed', 'cancelled'] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export const TRANSPORT_MODES = ['truck', 'electric_truck', 'van', 'rail', 'bike_cargo'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

const geoPointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

/**
 * Une étape de la feuille de route — chargement/déchargement à un point géographique.
 * Sous-document : on imbrique car les étapes n'ont aucun sens hors d'une route.
 */
const stopSchema = new Schema(
  {
    sequence: { type: Number, required: true, min: 0 },
    label: { type: String, required: true, maxlength: 120 },
    type: { type: String, required: true, enum: ['pickup', 'dropoff', 'transit'] },
    location: { type: geoPointSchema, required: true },
    scheduledAt: { type: Date, required: true },
    completedAt: { type: Date, required: false },
    itemIds: { type: [Schema.Types.ObjectId], default: [], ref: 'Item' },
    note: { type: String, maxlength: 500 },
  },
  { _id: true },
);

export const routeSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true, trim: true, maxlength: 32 },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    transporterId: { type: String, required: true },
    mode: { type: String, required: true, enum: TRANSPORT_MODES },
    status: { type: String, required: true, enum: ROUTE_STATUSES, default: 'draft' },
    plannedDistanceKm: { type: Number, required: true, min: 0, max: 50_000 },
    actualDistanceKm: { type: Number, required: false, min: 0 },
    totalWeightKg: { type: Number, required: true, min: 0, default: 0 },
    stops: {
      type: [stopSchema],
      validate: {
        validator: (v: { sequence: number }[]): boolean => v.length >= 2,
        message: 'Une route doit avoir au moins 2 étapes',
      },
    },
  },
  {
    collection: 'routes',
    timestamps: true,
    optimisticConcurrency: true,
  },
);

routeSchema.index({ eventId: 1, status: 1 });
routeSchema.index({ transporterId: 1, status: 1 });
routeSchema.index({ 'stops.location': '2dsphere' });

export type RouteRaw = InferSchemaType<typeof routeSchema>;
export type RouteDoc = HydratedDocument<RouteRaw>;
export const RouteModel = model<RouteRaw>('Route', routeSchema);
