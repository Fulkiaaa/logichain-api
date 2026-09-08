import { EventEntity } from '@/modules/events/event.entity';
import type { EventRepository } from '@/modules/events/event.repository';
import { ItemEntity } from '@/modules/items/item.entity';
import type { ItemRepository } from '@/modules/items/item.repository';
import { RouteEntity } from '@/modules/routes/route.entity';
import type { RouteRepository } from '@/modules/routes/route.repository';
import { CarbonFootprintService, TRANSPORT_EMISSION_FACTORS } from '@/services/CarbonFootprintService';

const buildItem = (overrides: Partial<ConstructorParameters<typeof ItemEntity>[0]> = {}): ItemEntity =>
  new ItemEntity({
    id: '507f1f77bcf86cd799439011',
    qrCode: 'QR-001',
    label: 'Projecteur LED',
    category: 'lighting',
    status: 'in_stock',
    weightKg: 12,
    lifespanYears: 10,
    manufacturingCo2Kg: 500,
    history: [],
    ...overrides,
  });

const buildEvent = (start: Date, end: Date): EventEntity =>
  new EventEntity({
    id: '507f1f77bcf86cd799439010',
    name: 'Festival éco',
    slug: 'festival-eco',
    status: 'active',
    startDate: start,
    endDate: end,
    zones: [],
    managerId: 'mgr-1',
  });

const buildRoute = (
  overrides: Partial<ConstructorParameters<typeof RouteEntity>[0]> = {},
): RouteEntity =>
  new RouteEntity({
    id: '507f1f77bcf86cd799439020',
    reference: 'R-001',
    eventId: '507f1f77bcf86cd799439010',
    transporterId: 'transporter-1',
    mode: 'truck',
    status: 'planned',
    plannedDistanceKm: 200,
    totalWeightKg: 3000,
    stops: [
      {
        sequence: 0,
        label: 'Dépôt',
        type: 'pickup',
        location: { type: 'Point', coordinates: [2.35, 48.85] },
        scheduledAt: new Date('2026-06-01T08:00:00Z'),
        itemIds: [],
      },
      {
        sequence: 1,
        label: 'Site',
        type: 'dropoff',
        location: { type: 'Point', coordinates: [2.5, 48.9] },
        scheduledAt: new Date('2026-06-01T12:00:00Z'),
        itemIds: [],
      },
    ],
    ...overrides,
  });

describe('CarbonFootprintService', () => {
  let service: CarbonFootprintService;
  let itemRepo: jest.Mocked<ItemRepository>;
  let eventRepo: jest.Mocked<EventRepository>;
  let routeRepo: jest.Mocked<RouteRepository>;

  beforeEach(() => {
    itemRepo = {
      listWithFilters: jest.fn(),
    } as unknown as jest.Mocked<ItemRepository>;
    eventRepo = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<EventRepository>;
    routeRepo = {
      listWithFilters: jest.fn(),
    } as unknown as jest.Mocked<RouteRepository>;

    service = new CarbonFootprintService(itemRepo, eventRepo, routeRepo);
  });

  describe('computeItemFootprint', () => {
    it('amortit la fabrication au prorata de la durée événement', () => {
      const item = buildItem({ manufacturingCo2Kg: 500, lifespanYears: 10 });
      const fp = service.computeItemFootprint(item, 4);
      // 500 / 10 = 50 kgCO2e/an ; sur 4 jours : 50 × 4/365 ≈ 0.55
      expect(fp.amortizedCo2Kg).toBeCloseTo(0.55, 2);
      expect(fp.category).toBe('lighting');
    });

    it('retourne 0 si manufacturingCo2Kg vaut 0', () => {
      const item = buildItem({ manufacturingCo2Kg: 0 });
      const fp = service.computeItemFootprint(item, 30);
      expect(fp.amortizedCo2Kg).toBe(0);
    });

    it('ne crash pas avec une durée nulle', () => {
      const item = buildItem();
      const fp = service.computeItemFootprint(item, 0);
      expect(fp.amortizedCo2Kg).toBe(0);
    });

    it('protège contre une durée de vie quasi-nulle (évite division par zéro)', () => {
      const item = buildItem({ lifespanYears: 0 });
      const fp = service.computeItemFootprint(item, 365);
      // lifespanYears est borné à 0.1 → 500 / 0.1 = 5000 kgCO2e/an × 1 an
      expect(fp.amortizedCo2Kg).toBeCloseTo(5000, 0);
    });
  });

  describe('computeRouteFootprint', () => {
    it('applique la formule ADEME (tonnes × km × facteur)', () => {
      const route = buildRoute({ mode: 'truck', plannedDistanceKm: 200, totalWeightKg: 3000 });
      const fp = service.computeRouteFootprint(route);
      // 3 tonnes × 200 km × 0.058 (Rigide ADEME #28030) = 34,8 kgCO2e
      expect(fp.co2Kg).toBeCloseTo(34.8, 1);
      expect(fp.emissionFactor).toBe(TRANSPORT_EMISSION_FACTORS.truck);
    });

    it('utilise la distance réelle si disponible', () => {
      const route = buildRoute({ plannedDistanceKm: 200, totalWeightKg: 3000 });
      route.recordActualDistance(150);
      const fp = service.computeRouteFootprint(route);
      // 3 × 150 × 0.058 = 26,1 kgCO2e
      expect(fp.co2Kg).toBeCloseTo(26.1, 1);
    });

    it('renvoie 0 pour le vélo cargo (facteur = 0)', () => {
      const route = buildRoute({ mode: 'bike_cargo' });
      const fp = service.computeRouteFootprint(route);
      expect(fp.co2Kg).toBe(0);
    });

    it('le rail émet beaucoup moins qu\'un camion équivalent', () => {
      const truck = service.computeRouteFootprint(buildRoute({ mode: 'truck' }));
      const rail = service.computeRouteFootprint(buildRoute({ mode: 'rail' }));
      expect(rail.co2Kg).toBeLessThan(truck.co2Kg);
    });
  });

  describe('computeEventDurationDays', () => {
    it('arrondit au jour supérieur', () => {
      const event = buildEvent(new Date('2026-06-01T08:00:00Z'), new Date('2026-06-03T20:00:00Z'));
      expect(service.computeEventDurationDays(event)).toBe(3);
    });

    it('renvoie au minimum 1', () => {
      const start = new Date('2026-06-01T10:00:00Z');
      const event = buildEvent(start, new Date(start.getTime() + 1000));
      expect(service.computeEventDurationDays(event)).toBe(1);
    });
  });

  describe('computeEventReport', () => {
    it('agrège fabrication + transport et catégorise les résultats', async () => {
      const event = buildEvent(new Date('2026-06-01T00:00:00Z'), new Date('2026-06-05T00:00:00Z'));
      eventRepo.findById.mockResolvedValue(event);

      itemRepo.listWithFilters.mockResolvedValue({
        data: [
          buildItem({ category: 'lighting', manufacturingCo2Kg: 500, lifespanYears: 10 }),
          buildItem({ category: 'sound', manufacturingCo2Kg: 1000, lifespanYears: 5 }),
        ],
        count: 2,
        page: 1,
        limit: 100,
        totalPages: 1,
      });

      routeRepo.listWithFilters.mockResolvedValue({
        data: [buildRoute({ mode: 'truck', plannedDistanceKm: 100, totalWeightKg: 2000 })],
        count: 1,
        page: 1,
        limit: 100,
        totalPages: 1,
      });

      const report = await service.computeEventReport('507f1f77bcf86cd799439010');

      expect(report.eventDurationDays).toBe(4);
      expect(report.manufacturingCo2Kg).toBeGreaterThan(0);
      // 2t × 100km × 0.058 (Rigide ADEME #28030) = 11,6 kgCO2e
      expect(report.transportCo2Kg).toBeCloseTo(11.6, 1);
      expect(report.totalCo2Kg).toBeCloseTo(
        report.manufacturingCo2Kg + report.transportCo2Kg,
        2,
      );
      expect(report.byCategory.lighting).toBeDefined();
      expect(report.byCategory.sound).toBeDefined();
      expect(report.byTransportMode.truck).toBeCloseTo(11.6, 1);
    });

    it('lève NotFoundError si l\'événement n\'existe pas', async () => {
      eventRepo.findById.mockResolvedValue(null);
      await expect(service.computeEventReport('507f1f77bcf86cd799439010')).rejects.toThrow(
        /Event.*introuvable/,
      );
    });

    it('renvoie un rapport vide pour un événement sans items ni routes', async () => {
      const event = buildEvent(new Date('2026-06-01'), new Date('2026-06-02'));
      eventRepo.findById.mockResolvedValue(event);
      itemRepo.listWithFilters.mockResolvedValue({
        data: [],
        count: 0,
        page: 1,
        limit: 100,
        totalPages: 0,
      });
      routeRepo.listWithFilters.mockResolvedValue({
        data: [],
        count: 0,
        page: 1,
        limit: 100,
        totalPages: 0,
      });

      const report = await service.computeEventReport('507f1f77bcf86cd799439010');
      expect(report.totalCo2Kg).toBe(0);
      expect(report.itemCount).toBe(0);
      expect(report.routeCount).toBe(0);
    });
  });
});
