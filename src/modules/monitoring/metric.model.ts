import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Collection Time Series MongoDB — monitoring des latences HTTP.
 *
 * - `timeField` (`ts`) : horodatage de la mesure, obligatoire pour une Time Series.
 * - `metaField` (`meta`) : dimensions à faible cardinalité (méthode, route, statut)
 *   sur lesquelles MongoDB regroupe et compresse les mesures — d'où l'importance
 *   d'utiliser le *pattern* de route (`/api/v1/items/:id`) et non l'URL réelle.
 * - `granularity: 'seconds'` : adapté aux pics de scans rapprochés (montage/démontage).
 * - `expireAfterSeconds` : rétention automatique de 7 jours (purge native, pas de cron).
 *
 * La collection est créée automatiquement en Time Series au premier insert
 * (MongoDB ≥ 5.0 ; ici 7.0).
 */
export const metricSchema = new Schema(
  {
    ts: { type: Date, required: true },
    meta: {
      method: { type: String, required: true },
      route: { type: String, required: true },
      status: { type: Number, required: true },
    },
    durationMs: { type: Number, required: true, min: 0 },
  },
  {
    collection: 'monitoring_metrics',
    timeseries: {
      timeField: 'ts',
      metaField: 'meta',
      granularity: 'seconds',
    },
    expireAfterSeconds: 60 * 60 * 24 * 7,
    versionKey: false,
  },
);

export type MetricRaw = InferSchemaType<typeof metricSchema>;
export const MetricModel = model<MetricRaw>('Metric', metricSchema);
