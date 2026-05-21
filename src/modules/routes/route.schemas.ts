import { z } from 'zod';

import { geoPointSchema, idParamSchema, objectIdSchema } from '@/modules/items/item.schemas';

import { ROUTE_STATUSES, TRANSPORT_MODES } from './route.model';

const stopInputSchema = z.object({
  sequence: z.number().int().nonnegative(),
  label: z.string().min(1).max(120),
  type: z.enum(['pickup', 'dropoff', 'transit']),
  location: geoPointSchema,
  scheduledAt: z.coerce.date(),
  itemIds: z.array(objectIdSchema).default([]),
  note: z.string().max(500).optional(),
});

export const createRouteSchema = z.object({
  reference: z.string().min(2).max(32),
  eventId: objectIdSchema,
  transporterId: z.string().min(1),
  mode: z.enum(TRANSPORT_MODES),
  plannedDistanceKm: z.number().positive().max(50_000),
  totalWeightKg: z.number().nonnegative().default(0),
  stops: z.array(stopInputSchema).min(2, 'Au moins 2 étapes'),
});

export const transitionRouteSchema = z.object({
  status: z.enum(ROUTE_STATUSES),
});

export const recordDistanceSchema = z.object({
  actualDistanceKm: z.number().nonnegative().max(100_000),
});

export const completeStopSchema = z.object({
  completedAt: z.coerce.date().optional(),
});

export const addItemsToStopSchema = z.object({
  itemIds: z.array(objectIdSchema).min(1),
});

export const stopParamSchema = idParamSchema.extend({ stopId: objectIdSchema });

export const listRoutesQuerySchema = z.object({
  eventId: objectIdSchema.optional(),
  transporterId: z.string().optional(),
  status: z.enum(ROUTE_STATUSES).optional(),
  mode: z.enum(TRANSPORT_MODES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type CreateRouteInput = z.infer<typeof createRouteSchema>;
