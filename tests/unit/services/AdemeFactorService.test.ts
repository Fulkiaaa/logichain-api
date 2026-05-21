import { AdemeFactorService } from '@/services/AdemeFactorService';

const makeResponse = (results: unknown[]): Response =>
  new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const railLine = {
  Type_Ligne: 'Elément',
  "Statut_de_l'élément": 'Valide générique',
  Localisation_géographique: 'France continentale',
  Nom_base_français: 'Train',
  Code_de_la_catégorie: 'Transport de marchandises > Ferroviaire > France',
  'Total_poste_non_décomposé': 0.0042,
  CO2f: 0.0042,
  "Identifiant_de_l'élément": '43732',
  'Unité_français': 'kgCO2e/t.km',
};

const truckLine = {
  Type_Ligne: 'Elément',
  "Statut_de_l'élément": 'Valide générique',
  Localisation_géographique: 'France continentale',
  Nom_base_français: 'Rigide',
  Code_de_la_catégorie: 'Transport de marchandises > Routier > PL',
  'Total_poste_non_décomposé': 0.78,
  CO2f: 0.78,
  "Identifiant_de_l'élément": '28030',
  'Unité_français': 'kgCO2e/t.km',
};

// Note : actuellement van et electric_truck sont systématiquement en fallback
// (pas de requête ADEME associée). Les fixtures ci-dessous sont conservées
// pour documenter le format, mais ne sont pas activement utilisées par les
// tests — d'où le @ts-expect-error sur les imports inutilisés.

// @ts-expect-error fixture documentation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _vanLine = {
  Type_Ligne: 'Elément',
  "Statut_de_l'élément": 'Valide générique',
  Localisation_géographique: 'France continentale',
  Nom_base_français: 'Utilitaire <3,5t',
  'Total_poste_non_décomposé': 0.082,
  "Identifiant_de_l'élément": '28280',
  'Unité_français': 'kgCO2e/km',
};

describe('AdemeFactorService', () => {
  it('utilise les fallbacks tant qu\'aucun refresh n\'a eu lieu', () => {
    const fetchMock = jest.fn();
    const svc = new AdemeFactorService(fetchMock as unknown as typeof fetch);

    expect(svc.getFactor('truck')).toBeGreaterThan(0);
    expect(svc.getFactor('rail')).toBeGreaterThan(0);
    expect(svc.getFactor('bike_cargo')).toBe(0);

    const snap = svc.snapshot();
    expect(snap.truck.source).toBe('fallback');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refresh() peuple le cache depuis l\'API ADEME', async () => {
    // Le service interroge l'API par identifiant ADEME (q=ID).
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('q=43732')) {
        return makeResponse([{ ...railLine, "Identifiant_de_l'élément": '43732' }]);
      }
      if (url.includes('q=28030')) {
        return makeResponse([{ ...truckLine, "Identifiant_de_l'élément": '28030' }]);
      }
      return makeResponse([]);
    });

    const svc = new AdemeFactorService(fetchMock as unknown as typeof fetch);
    await svc.refresh();

    expect(svc.getFactor('rail')).toBe(0.0042);
    expect(svc.getFactor('truck')).toBe(0.78);
    // van et electric_truck n'ont pas de requête ADEME → fallback
    expect(svc.snapshot().van.source).toBe('fallback');
    expect(svc.snapshot().electric_truck.source).toBe('fallback');

    const snap = svc.snapshot();
    expect(snap.rail.source).toBe('ademe-live');
    expect(snap.rail.ademeId).toBe('43732');
  });

  it('garde les fallbacks si l\'API ADEME est en erreur', async () => {
    const fetchMock = jest.fn(async () =>
      new Response('Service Unavailable', { status: 503 }),
    );
    const svc = new AdemeFactorService(fetchMock as unknown as typeof fetch);

    await svc.refresh();
    const snap = svc.snapshot();
    expect(snap.truck.source).toBe('fallback');
    expect(svc.getFactor('truck')).toBeGreaterThan(0);
  });

  it('garde les fallbacks si le fetch jette une exception (timeout / réseau)', async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const svc = new AdemeFactorService(fetchMock as unknown as typeof fetch);

    await svc.refresh();
    expect(svc.snapshot().rail.source).toBe('fallback');
    expect(svc.getFactor('rail')).toBeGreaterThan(0);
  });

  it('ignore une valeur ADEME aberrante (négative ou hors plage)', async () => {
    const aberrant = { ...railLine, 'Total_poste_non_décomposé': 999, CO2f: 999 };
    const fetchMock = jest.fn(async () => makeResponse([aberrant]));
    const svc = new AdemeFactorService(fetchMock as unknown as typeof fetch);

    await svc.refresh();
    expect(svc.snapshot().rail.source).toBe('fallback');
  });

  it('ignore les lignes qui ne sont pas des facteurs agrégés (Type_Ligne ≠ Elément)', async () => {
    const poste = { ...railLine, Type_Ligne: 'Poste' };
    const fetchMock = jest.fn(async () => makeResponse([poste]));
    const svc = new AdemeFactorService(fetchMock as unknown as typeof fetch);

    await svc.refresh();
    expect(svc.snapshot().rail.source).toBe('fallback');
  });

  it('refresh() est idempotent : deux appels concurrents ne déclenchent qu\'un fetch', async () => {
    const fetchMock = jest.fn(async () => makeResponse([railLine]));
    const svc = new AdemeFactorService(fetchMock as unknown as typeof fetch);

    const initialCallCount = fetchMock.mock.calls.length;
    await Promise.all([svc.refresh(), svc.refresh()]);
    // 5 modes mais 1 sans API (bike_cargo) = 4 fetches max
    const callsAfter = fetchMock.mock.calls.length - initialCallCount;
    expect(callsAfter).toBeLessThanOrEqual(4);
  });

  it('bike_cargo reste à 0 sans appeler l\'API', async () => {
    const fetchMock = jest.fn(async (_url: string) => makeResponse([]));
    const svc = new AdemeFactorService(fetchMock as unknown as typeof fetch);

    await svc.refresh();
    expect(svc.getFactor('bike_cargo')).toBe(0);
    // Aucun des fetches n'a contenu une recherche "vélo" ou "cargo"
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.toLowerCase().includes('v%c3%a9lo'))).toBe(false);
  });

  it('warmup() ne propage pas l\'erreur du fetch', () => {
    const fetchMock = jest.fn(async () => {
      throw new Error('boom');
    });
    const svc = new AdemeFactorService(fetchMock as unknown as typeof fetch);
    expect(() => svc.warmup()).not.toThrow();
  });
});
