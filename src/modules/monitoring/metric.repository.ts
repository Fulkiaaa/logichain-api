import type { PipelineStage } from 'mongoose';

import { MetricModel, type MetricRaw } from './metric.model';

export interface MetricInput {
  ts: Date;
  method: string;
  route: string;
  status: number;
  durationMs: number;
}

export interface RouteLatency {
  route: string;
  method: string;
  count: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
}

/**
 * SEULE couche autorisée à parler à Mongoose pour la collection de monitoring.
 *
 * Écriture **bufferisée** : on n'écrit pas en base à chaque requête HTTP (coût
 * prohibitif sous charge — c'est justement le scénario des tests de charge).
 * Les mesures sont accumulées en mémoire puis insérées par lots (`insertMany`),
 * soit quand le buffer est plein, soit toutes les `flushEvery` ms.
 *
 * Best-effort : une écriture de métrique ratée ne doit JAMAIS impacter l'API.
 */
export class MetricRepository {
  private buffer: MetricRaw[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly flushEvery = 5_000,
    private readonly maxBuffer = 500,
  ) {}

  /** Enregistre une mesure (synchrone, en mémoire). Ne bloque jamais la requête. */
  public record(input: MetricInput): void {
    this.buffer.push({
      ts: input.ts,
      meta: { method: input.method, route: input.route, status: input.status },
      durationMs: input.durationMs,
    } as MetricRaw);

    if (this.buffer.length >= this.maxBuffer) {
      void this.flush();
    }
  }

  /** Démarre le flush périodique en tâche de fond (appelé au boot). */
  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.flushEvery);
    // `unref` : ce timer ne doit pas empêcher le process de se terminer.
    this.timer.unref();
  }

  /** Stoppe le timer et vide le buffer restant (appelé à l'arrêt). */
  public async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  /** Insère le buffer courant par lot, sans jamais propager d'erreur. */
  public async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    try {
      await MetricModel.insertMany(batch, { ordered: false });
    } catch {
      // Monitoring best-effort : on avale l'erreur (Mongo momentanément
      // indisponible, etc.). Perdre une métrique est acceptable ; casser
      // une requête métier ne l'est pas.
    }
  }

  /**
   * Agrégation des latences par route sur une fenêtre glissante.
   * `$percentile` (MongoDB 7.0) fournit un vrai p95 approché.
   */
  public async summary(sinceMinutes = 60): Promise<RouteLatency[]> {
    const since = new Date(Date.now() - sinceMinutes * 60_000);

    // `$percentile` (accumulateur MongoDB 7.0) n'est pas encore connu des
    // typings Mongoose → on caste cet étage seul. Le runtime le supporte.
    const groupStage = {
      $group: {
        _id: { route: '$meta.route', method: '$meta.method' },
        count: { $sum: 1 },
        avgMs: { $avg: '$durationMs' },
        p95Ms: { $percentile: { input: '$durationMs', p: [0.95], method: 'approximate' } },
        maxMs: { $max: '$durationMs' },
      },
    } as unknown as PipelineStage;

    const rows = await MetricModel.aggregate<{
      _id: { route: string; method: string };
      count: number;
      avgMs: number;
      p95Ms: number[];
      maxMs: number;
    }>([{ $match: { ts: { $gte: since } } }, groupStage, { $sort: { count: -1 } }]).exec();

    return rows.map((r) => ({
      route: r._id.route,
      method: r._id.method,
      count: r.count,
      avgMs: Math.round(r.avgMs * 100) / 100,
      p95Ms: Math.round((r.p95Ms[0] ?? 0) * 100) / 100,
      maxMs: Math.round(r.maxMs * 100) / 100,
    }));
  }
}

/** Singleton partagé (middleware d'écriture + endpoint de lecture dashboard). */
export const metricRepository = new MetricRepository();
