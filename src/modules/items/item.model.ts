import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Statuts possibles d'un item dans son cycle de vie logistique.
 * Les transitions sont contrôlées par ItemEntity, pas par Mongoose.
 */
export const ITEM_STATUSES = [
  'in_stock',
  'allocated',
  'in_transit',
  'deployed',
  'in_maintenance',
  'lost',
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ITEM_CATEGORIES = [
  'staging',
  'sound',
  'lighting',
  'video',
  'power',
  'tent',
  'furniture',
  'sanitary',
  'fencing',
  'other',
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

const geoPointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]): boolean =>
          v.length === 2 &&
          v[0]! >= -180 &&
          v[0]! <= 180 &&
          v[1]! >= -90 &&
          v[1]! <= 90,
        message: 'Coordonnées GeoJSON invalides — attendu [longitude, latitude]',
      },
    },
  },
  { _id: false },
);

const movementSchema = new Schema(
  {
    at: { type: Date, required: true, default: () => new Date() },
    type: {
      type: String,
      required: true,
      enum: ['scan', 'allocation', 'transit', 'deploy', 'maintenance', 'anomaly', 'return'],
    },
    fromStatus: { type: String, enum: ITEM_STATUSES },
    toStatus: { type: String, enum: ITEM_STATUSES, required: true },
    location: { type: geoPointSchema, required: false },
    operatorId: { type: String, required: true },
    note: { type: String, maxlength: 500 },
  },
  { _id: false },
);

export const itemSchema = new Schema(
  {
    qrCode: {
      type: String,
      required: [true, 'Le code QR est obligatoire'],
      unique: true,
      trim: true,
      minlength: 4,
      maxlength: 64,
    },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, enum: ITEM_CATEGORIES },
    status: { type: String, required: true, enum: ITEM_STATUSES, default: 'in_stock' },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: false, index: true },
    location: { type: geoPointSchema, required: false },
    weightKg: {
      type: Number,
      required: true,
      min: [0, 'Le poids doit être positif'],
      max: 100_000,
    },
    purchasePriceEur: { type: Number, required: false, min: 0 },
    lifespanYears: { type: Number, required: false, min: 0.1, max: 50, default: 10 },
    manufacturingCo2Kg: {
      type: Number,
      required: false,
      min: 0,
      default: 0,
    },
    history: { type: [movementSchema], default: [] },
  },
  {
    collection: 'items',
    timestamps: true,
    optimisticConcurrency: true,
    minimize: false,
  },
);

itemSchema.index({ eventId: 1, status: 1 });
itemSchema.index({ category: 1, status: 1 });
itemSchema.index({ location: '2dsphere' });

/**
 * Index PARTIEL : seuls les items perdus sont indexés (`partialFilterExpression`).
 * C'est un sous-ensemble minuscule mais « chaud » — le dashboard interroge
 * fréquemment les items perdus pour la détection d'incidents. L'index reste
 * ainsi bien plus petit qu'un index plein sur `status`, tout en accélérant
 * exactement cette requête. Trié par récence pour lister les pertes récentes.
 */
itemSchema.index(
  { eventId: 1, updatedAt: -1 },
  { partialFilterExpression: { status: 'lost' }, name: 'lost_items_by_event' },
);

export type ItemRaw = InferSchemaType<typeof itemSchema>;
export type ItemDoc = HydratedDocument<ItemRaw>;
export const ItemModel = model<ItemRaw>('Item', itemSchema);
