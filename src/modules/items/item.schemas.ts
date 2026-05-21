import { z } from 'zod';

import { ITEM_CATEGORIES, ITEM_STATUSES } from './item.model';

const objectIdRegex = /^[a-f0-9]{24}$/i;

export const objectIdSchema = z.string().regex(objectIdRegex, 'ObjectId invalide');

export const geoPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number().gte(-180).lte(180), z.number().gte(-90).lte(90)]),
});

export const createItemSchema = z.object({
  qrCode: z.string().min(4).max(64),
  label: z.string().min(1).max(120),
  category: z.enum(ITEM_CATEGORIES),
  status: z.enum(ITEM_STATUSES).optional().default('in_stock'),
  eventId: objectIdSchema.optional(),
  location: geoPointSchema.optional(),
  weightKg: z.number().positive().max(100_000),
  purchasePriceEur: z.number().nonnegative().optional(),
  lifespanYears: z.number().positive().max(50).optional().default(10),
  manufacturingCo2Kg: z.number().nonnegative().optional().default(0),
});

export const updateItemSchema = z
  .object({
    label: z.string().min(1).max(120),
  })
  .partial();

export const idParamSchema = z.object({ id: objectIdSchema });

export const scanSchema = z.object({
  location: geoPointSchema,
  note: z.string().max(500).optional(),
});

export const allocateSchema = z.object({
  eventId: objectIdSchema,
});

export const transitSchema = z.object({
  location: geoPointSchema.optional(),
});

export const deploySchema = z.object({
  location: geoPointSchema,
});

export const anomalySchema = z.object({
  location: geoPointSchema,
  note: z.string().min(1).max(500),
});

export const lostSchema = z.object({
  note: z.string().max(500).optional(),
});

export const listItemsQuerySchema = z.object({
  eventId: objectIdSchema.optional(),
  status: z.enum(ITEM_STATUSES).optional(),
  category: z.enum(ITEM_CATEGORIES).optional(),
  qrCode: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;
