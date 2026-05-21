import { logger } from '@/core/logger';
import type { TransportMode } from '@/modules/routes/route.model';

/**
 * ============================================================================
 *  AdemeFactorService — consomme l'API Open Data ADEME pour récupérer les
 *  facteurs d'émission de la Base Carbone® en temps réel.
 * ============================================================================
 *
 *  Endpoint public :
 *      https://data.ademe.fr/data-fair/api/v1/datasets/base-carboner/lines
 *
 *  Pattern : **stale-while-revalidate** avec fallback.
 *   1. Au démarrage, fetch initial asynchrone des 5 modes en parallèle.
 *   2. Valeurs mises en cache mémoire pendant `CACHE_TTL_MS` (24h par défaut).
 *   3. Toute requête `getFactor(mode)` :
 *        - cache à jour → renvoyée immédiatement
 *        - cache périmé  → renvoyée + refresh asynchrone en arrière-plan
 *        - aucune valeur → fallback hardcodé + tentative de refresh
 *   4. Si l'API ADEME est indisponible, on retombe sur les valeurs hardcodées.
 *      L'API LogiChain reste fonctionnelle même si ADEME est down.
 *
 *  À l'oral :
 *      "On consomme l'API Open Data ADEME au démarrage et toutes les 24h.
 *      Les facteurs sont toujours frais sans dépendre du réseau à chaque
 *      calcul. En cas d'indisponibilité ADEME on retombe sur les dernières
 *      valeurs connues, et en dernier recours sur des constantes baseline."
 * ============================================================================
 */

export interface FactorEntry {
  value: number;
  source: 'ademe-live' | 'ademe-cached' | 'fallback';
  fetchedAt: Date;
  ademeId?: string;
}

interface AdemeRequest {
  query: string;
  match: (item: AdemeLine) => boolean;
}

interface AdemeLine {
  ['Nom_base_français']?: string;
  ['Code_de_la_catégorie']?: string;
  ['Sous-localisation_géographique_français']?: string;
  ['Localisation_géographique']?: string;
  ['Statut_de_l\'élément']?: string;
  ['Type_Ligne']?: string;
  ['Type_de_l\'élément']?: string;
  ['Unité_français']?: string;
  ['Total_poste_non_décomposé']?: number;
  CO2f?: number;
  ['Identifiant_de_l\'élément']?: string;
}

const ADEME_BASE_URL = 'https://data.ademe.fr/data-fair/api/v1/datasets/base-carboner/lines';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 8000;

/**
 * Valeurs de secours hardcodées issues de la Base Carbone® ADEME
 * (consultée mai 2026, France continentale, statut « Valide générique »).
 * Utilisées si l'API est inatteignable.
 *
 * Exportées aussi sous le nom historique TRANSPORT_EMISSION_FACTORS pour
 * compatibilité avec le code existant.
 */
export const TRANSPORT_EMISSION_FACTORS: Record<TransportMode, number> = {
  truck: 0.058, // Camion Rigide — ID ADEME 28030
  electric_truck: 0.02, // Pas de récent en FR continentale → estimation
  van: 0.082, // Utilitaire <3,5t — ID ADEME 28280 (en kgCO2e/km, ordre de grandeur)
  rail: 0.00401, // Train fret électrique — ID ADEME 43732
  bike_cargo: 0,
};

const FALLBACK_FACTORS = TRANSPORT_EMISSION_FACTORS;

/**
 * Pour chaque mode, on construit une requête ADEME et un prédicat de
 * sélection qui retient la ligne la plus pertinente parmi les résultats.
 *
 * - On préfère systématiquement France continentale et statut « Valide générique »
 * - Type_Ligne « Elément » = facteur agrégé (pas une décomposition par poste)
 */
/**
 * Pour chaque mode on cible un identifiant ADEME précis
 * (`Identifiant_de_l'élément`). C'est plus robuste qu'une recherche par
 * libellé : on est immunisés contre les changements de nommage.
 *
 * On filtre aussi sur l'unité kgCO2e/t.km (rejet des facteurs « par km
 * véhicule » qui ne se composent pas avec notre formule tonnes × km).
 */
const isValidPerTonneKm = (l: AdemeLine): boolean => {
  const unit = l['Unité_français'];
  return (
    l.Type_Ligne === 'Elément' &&
    l['Statut_de_l\'élément'] === 'Valide générique' &&
    l.Localisation_géographique === 'France continentale' &&
    (unit === 'kgCO2e/t.km' || unit === 'kgCO2e/tonne.km')
  );
};

const matchById = (id: string) => (l: AdemeLine): boolean =>
  isValidPerTonneKm(l) && l['Identifiant_de_l\'élément'] === id;

const ADEME_REQUESTS: Record<TransportMode, AdemeRequest | null> = {
  // Camion Rigide France continentale (Base Carbone® ADEME)
  truck: { query: '28030', match: matchById('28030') },
  // Fret ferroviaire France continentale — Train marchandises
  rail: { query: '43732', match: matchById('43732') },
  // Utilitaire <3,5t : facteur ADEME exprimé en kgCO2e/km (pas par t.km)
  //   → incompatible avec la formule t × km, on garde le fallback.
  van: null,
  // Camion électrique : pas de facteur Valide générique France continentale
  //   en mai 2026 (l'estimation fallback inclut le mix électrique amont).
  electric_truck: null,
  // Vélo-cargo : émissions négligeables, pas de facteur ADEME requis.
  bike_cargo: null,
};

export class AdemeFactorService {
  private cache: Map<TransportMode, FactorEntry> = new Map();

  private refreshPromise: Promise<void> | null = null;

  constructor(private readonly fetchFn: typeof fetch = fetch) {
    // bootstrap : on initialise le cache avec les fallbacks immédiatement
    // pour qu'aucun appel ne reparte vide pendant que le fetch ADEME tourne.
    const now = new Date();
    for (const mode of Object.keys(FALLBACK_FACTORS) as TransportMode[]) {
      this.cache.set(mode, {
        value: FALLBACK_FACTORS[mode],
        source: 'fallback',
        fetchedAt: now,
      });
    }
  }

  /**
   * Démarre un refresh asynchrone (fire-and-forget). À appeler au boot
   * de l'application pour que le cache soit chaud à la première requête.
   */
  public warmup(): void {
    void this.refresh().catch((err) => {
      logger.warn({ err }, 'AdemeFactorService warmup failed — fallback values en place');
    });
  }

  /**
   * Renvoie le facteur d'émission courant pour un mode.
   * Déclenche un refresh asynchrone si le cache est périmé (>24h).
   */
  public getFactor(mode: TransportMode): number {
    const entry = this.cache.get(mode);
    if (!entry) {
      return FALLBACK_FACTORS[mode];
    }
    if (this.isStale(entry)) {
      void this.refresh().catch((err) => {
        logger.warn({ err }, 'Refresh ADEME échoué — on conserve le cache');
      });
    }
    return entry.value;
  }

  /** Renvoie un instantané complet du cache (pour endpoint debug / monitoring). */
  public snapshot(): Record<TransportMode, FactorEntry> {
    const out = {} as Record<TransportMode, FactorEntry>;
    for (const [mode, entry] of this.cache.entries()) {
      out[mode] = { ...entry };
    }
    return out;
  }

  /**
   * Force un refresh complet du cache depuis l'API ADEME.
   * Idempotent : si un refresh est déjà en cours, on attend celui-là.
   */
  public async refresh(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.doRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<void> {
    const modes = Object.keys(ADEME_REQUESTS) as TransportMode[];
    const results = await Promise.allSettled(
      modes.map((mode) => this.fetchOne(mode).then((entry) => ({ mode, entry }))),
    );

    let liveCount = 0;
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.entry) {
        this.cache.set(r.value.mode, r.value.entry);
        if (r.value.entry.source === 'ademe-live') liveCount += 1;
      }
    }
    logger.info({ liveCount, total: modes.length }, 'Facteurs ADEME rafraîchis');
  }

  private async fetchOne(mode: TransportMode): Promise<FactorEntry | null> {
    const req = ADEME_REQUESTS[mode];
    if (!req) {
      // Mode sans correspondance ADEME (ex: bike_cargo)
      return {
        value: FALLBACK_FACTORS[mode],
        source: 'fallback',
        fetchedAt: new Date(),
      };
    }

    const url = `${ADEME_BASE_URL}?q=${encodeURIComponent(req.query)}&size=20`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await this.fetchFn(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`ADEME HTTP ${res.status}`);
      }
      const data = (await res.json()) as { results?: AdemeLine[] };
      const match = (data.results ?? []).find(req.match);
      if (!match) {
        logger.warn({ mode, query: req.query }, 'Aucune ligne ADEME ne matche');
        return null;
      }
      const raw = match['Total_poste_non_décomposé'] ?? match.CO2f;
      if (typeof raw !== 'number' || raw < 0 || raw > 100) {
        logger.warn({ mode, raw }, 'Valeur ADEME inattendue, fallback retenu');
        return null;
      }
      return {
        value: raw,
        source: 'ademe-live',
        fetchedAt: new Date(),
        ademeId: match['Identifiant_de_l\'élément'],
      };
    } catch (err) {
      logger.warn({ err, mode }, 'Échec fetch ADEME — fallback maintenu');
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private isStale(entry: FactorEntry): boolean {
    return Date.now() - entry.fetchedAt.getTime() > CACHE_TTL_MS;
  }
}

/** Instance partagée par toute l'application. */
export const ademeFactorService = new AdemeFactorService();
