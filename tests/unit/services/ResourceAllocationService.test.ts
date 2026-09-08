import { EventEntity } from '@/modules/events/event.entity';
import type { EventRepository } from '@/modules/events/event.repository';
import { ItemEntity } from '@/modules/items/item.entity';
import type { ItemRepository } from '@/modules/items/item.repository';
import { ResourceAllocationService, ResourceState } from '@/services/ResourceAllocationService';

const buildEvent = (id: string): EventEntity =>
  new EventEntity({
    id,
    name: 'Festival éco',
    slug: 'festival-eco',
    status: 'active',
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-06-05'),
    zones: [],
    managerId: 'mgr-1',
  });

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

describe('ResourceState (Banker\'s Algorithm)', () => {
  describe('isSafe', () => {
    it('considère sûr un état vide', () => {
      const state = new ResourceState({}, []);
      expect(state.isSafe().safe).toBe(true);
    });

    it('considère sûr un état où chaque besoin peut être satisfait avec le stock courant', () => {
      const state = new ResourceState(
        { lighting: 10, sound: 5 },
        [
          { eventId: 'E1', max: { lighting: 5, sound: 2 }, allocated: { lighting: 2, sound: 1 } },
          { eventId: 'E2', max: { lighting: 3, sound: 2 }, allocated: { lighting: 1, sound: 0 } },
        ],
      );
      const result = state.isSafe();
      expect(result.safe).toBe(true);
      expect(result.sequence).toHaveLength(2);
      expect(result.sequence).toEqual(expect.arrayContaining(['E1', 'E2']));
    });

    it('détecte un état non-sûr : aucun événement ne peut terminer', () => {
      // E1 a besoin de 5 lighting de plus, E2 de 5 ; on n'a que 3 disponibles
      // Si on en alloue 3 à E1, il a toujours besoin de 2 — pas terminable
      // Et E2 n'a rien à libérer
      const state = new ResourceState(
        { lighting: 3 },
        [
          { eventId: 'E1', max: { lighting: 10 }, allocated: { lighting: 5 } },
          { eventId: 'E2', max: { lighting: 10 }, allocated: { lighting: 5 } },
        ],
      );
      const result = state.isSafe();
      // 3 dispo, E1 a besoin de 5, E2 a besoin de 5 → ni l'un ni l'autre ne peut finir
      expect(result.safe).toBe(false);
    });

    it('exemple Dijkstra classique : état sûr car séquence existe', () => {
      // P0 alloc=(0,1,0), max=(7,5,3), need=(7,4,3)
      // P1 alloc=(2,0,0), max=(3,2,2), need=(1,2,2)
      // P2 alloc=(3,0,2), max=(9,0,2), need=(6,0,0)
      // P3 alloc=(2,1,1), max=(2,2,2), need=(0,1,1)
      // P4 alloc=(0,0,2), max=(4,3,3), need=(4,3,1)
      // available = (3,3,2)
      const state = new ResourceState(
        { A: 3, B: 3, C: 2 },
        [
          { eventId: 'P0', max: { A: 7, B: 5, C: 3 }, allocated: { A: 0, B: 1, C: 0 } },
          { eventId: 'P1', max: { A: 3, B: 2, C: 2 }, allocated: { A: 2, B: 0, C: 0 } },
          { eventId: 'P2', max: { A: 9, B: 0, C: 2 }, allocated: { A: 3, B: 0, C: 2 } },
          { eventId: 'P3', max: { A: 2, B: 2, C: 2 }, allocated: { A: 2, B: 1, C: 1 } },
          { eventId: 'P4', max: { A: 4, B: 3, C: 3 }, allocated: { A: 0, B: 0, C: 2 } },
        ],
      );
      const { safe, sequence } = state.isSafe();
      expect(safe).toBe(true);
      expect(sequence).toHaveLength(5);
      // P1 doit être le premier (need=(1,2,2) ≤ work=(3,3,2))
      expect(sequence[0]).toBe('P1');
    });
  });

  describe('withAllocation', () => {
    it('décrémente available et incrémente allocated', () => {
      const state = new ResourceState(
        { lighting: 5 },
        [{ eventId: 'E1', max: { lighting: 4 }, allocated: { lighting: 1 } }],
      );
      const next = state.withAllocation('E1', 'lighting', 2);
      expect(next.available.lighting).toBe(3);
      expect(next.claims[0]!.allocated.lighting).toBe(3);
    });

    it('ne mute pas l\'état d\'origine (immutabilité)', () => {
      const state = new ResourceState(
        { lighting: 5 },
        [{ eventId: 'E1', max: { lighting: 4 }, allocated: { lighting: 1 } }],
      );
      state.withAllocation('E1', 'lighting', 2);
      expect(state.available.lighting).toBe(5);
      expect(state.claims[0]!.allocated.lighting).toBe(1);
    });

    it('refuse si le stock disponible est insuffisant', () => {
      const state = new ResourceState(
        { lighting: 1 },
        [{ eventId: 'E1', max: { lighting: 10 }, allocated: { lighting: 0 } }],
      );
      expect(() => state.withAllocation('E1', 'lighting', 5)).toThrow(/Stock insuffisant/);
    });

    it('refuse si la demande dépasse le besoin restant (max - allocated)', () => {
      const state = new ResourceState(
        { lighting: 10 },
        [{ eventId: 'E1', max: { lighting: 3 }, allocated: { lighting: 2 } }],
      );
      // need = 1, on essaie 2
      expect(() => state.withAllocation('E1', 'lighting', 2)).toThrow(/excède le besoin/);
    });

    it('refuse une quantité ≤ 0', () => {
      const state = new ResourceState({ lighting: 5 }, [
        { eventId: 'E1', max: { lighting: 5 }, allocated: {} },
      ]);
      expect(() => state.withAllocation('E1', 'lighting', 0)).toThrow(/positive/);
      expect(() => state.withAllocation('E1', 'lighting', -1)).toThrow(/positive/);
    });

    it('refuse pour un événement inconnu', () => {
      const state = new ResourceState({ lighting: 5 }, []);
      expect(() => state.withAllocation('E-ghost', 'lighting', 1)).toThrow(/Aucune prévision/);
    });
  });

  describe('needFor', () => {
    it('calcule max - allocated', () => {
      const state = new ResourceState({}, [
        {
          eventId: 'E1',
          max: { lighting: 10, sound: 5 },
          allocated: { lighting: 3, sound: 0 },
        },
      ]);
      expect(state.needFor('E1')).toEqual({ lighting: 7, sound: 5 });
    });

    it('renvoie un vecteur vide pour un event inconnu', () => {
      const state = new ResourceState({}, []);
      expect(state.needFor('E-ghost')).toEqual({});
    });
  });

  describe('scénario complet : transition sûr → non-sûr', () => {
    it('refuse une allocation qui mènerait à un état non-sûr', () => {
      // 2 events partagent 10 lighting. Chacun en réclame potentiellement 8.
      // E1 a déjà 4, E2 a déjà 4. Available = 2.
      // Si on alloue 1 de plus à E1, il aura 5, need = 3 ; E2 need = 4 ; avail = 1
      // Pas terminable → unsafe
      const state = new ResourceState(
        { lighting: 2 },
        [
          { eventId: 'E1', max: { lighting: 8 }, allocated: { lighting: 4 } },
          { eventId: 'E2', max: { lighting: 8 }, allocated: { lighting: 4 } },
        ],
      );
      // état initial : avail=2, needs=(4,4) — non sûr
      expect(state.isSafe().safe).toBe(false);
      // une nouvelle allocation aggraverait
      const next = state.withAllocation('E1', 'lighting', 1);
      expect(next.isSafe().safe).toBe(false);
    });
  });
});

describe('ResourceAllocationService', () => {
  let service: ResourceAllocationService;
  let itemRepo: jest.Mocked<ItemRepository>;
  let eventRepo: jest.Mocked<EventRepository>;

  beforeEach(() => {
    itemRepo = {
      listWithFilters: jest.fn(),
    } as unknown as jest.Mocked<ItemRepository>;
    eventRepo = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<EventRepository>;

    service = new ResourceAllocationService(itemRepo, eventRepo);
  });

  describe('buildCurrentState', () => {
    it('agrège le stock disponible sur plusieurs pages (pagination)', async () => {
      // 2 pages d'items in_stock : la boucle de pagination de computeAvailableStock
      // doit consommer toutes les pages, pas seulement la première.
      itemRepo.listWithFilters.mockImplementation(async (_filters, options) => {
        if (options.page === 1) {
          return {
            data: [buildItem({ category: 'lighting' }), buildItem({ category: 'sound' })],
            count: 3,
            page: 1,
            limit: 2,
            totalPages: 2,
          };
        }
        return {
          data: [buildItem({ category: 'lighting' })],
          count: 3,
          page: 2,
          limit: 2,
          totalPages: 2,
        };
      });

      const state = await service.buildCurrentState({});
      // 2 lighting (une par page) + 1 sound
      expect(state.available.lighting).toBe(2);
      expect(state.available.sound).toBe(1);
      expect(itemRepo.listWithFilters).toHaveBeenCalledTimes(2);
    });

    it('ne compte comme "alloué" que les items allocated/in_transit/deployed, pas in_maintenance ni lost', async () => {
      // Règle métier : un item en maintenance ou perdu ne bloque plus de capacité
      // sur l'événement — computeEventAllocation doit les exclure du décompte.
      itemRepo.listWithFilters.mockImplementation(async (filters) => {
        if ('status' in filters && filters.status === 'in_stock') {
          return { data: [], count: 0, page: 1, limit: 200, totalPages: 0 };
        }
        return {
          data: [
            buildItem({ category: 'lighting', status: 'allocated' }),
            buildItem({ category: 'lighting', status: 'in_transit' }),
            buildItem({ category: 'lighting', status: 'deployed' }),
            buildItem({ category: 'lighting', status: 'in_maintenance' }),
            buildItem({ category: 'lighting', status: 'lost' }),
          ],
          count: 5,
          page: 1,
          limit: 200,
          totalPages: 1,
        };
      });
      eventRepo.findById.mockResolvedValue(buildEvent('evt-1'));

      const state = await service.buildCurrentState({ 'evt-1': { lighting: 10 } });
      // 3 items comptent (allocated, in_transit, deployed) ; maintenance et lost sont ignorés
      expect(state.claims[0]!.allocated.lighting).toBe(3);
    });

    it('lève NotFoundError si une prévision référence un événement inexistant', async () => {
      itemRepo.listWithFilters.mockResolvedValue({ data: [], count: 0, page: 1, limit: 200, totalPages: 0 });
      eventRepo.findById.mockResolvedValue(null);

      await expect(service.buildCurrentState({ 'evt-ghost': { lighting: 1 } })).rejects.toThrow(
        /Event.*introuvable/,
      );
    });
  });

  describe('requestAllocation', () => {
    it('refuse (sans lever d\'exception) une allocation dont le stock est insuffisant', async () => {
      itemRepo.listWithFilters.mockImplementation(async (filters) => {
        if ('status' in filters && filters.status === 'in_stock') {
          return {
            data: [buildItem({ category: 'lighting' })],
            count: 1,
            page: 1,
            limit: 200,
            totalPages: 1,
          };
        }
        return { data: [], count: 0, page: 1, limit: 200, totalPages: 0 };
      });
      eventRepo.findById.mockResolvedValue(buildEvent('evt-1'));

      const decision = await service.requestAllocation('evt-1', 'lighting', 5, {
        'evt-1': { lighting: 10 },
      });

      expect(decision.granted).toBe(false);
      expect(decision.reason).toMatch(/Stock insuffisant/);
      expect(decision.safeSequence).toBeUndefined();
    });

    it('refuse une allocation qui mènerait à un état non sûr, même si le stock brut suffit', async () => {
      // available lighting = 3. E1 et E2 réclament chacun un max de 8, chacun a déjà 4 alloués.
      // Allouer 1 de plus à E1 le fait passer à need=3 ; E2 garde need=4 ; il ne reste que 2
      // dispo après l'allocation → aucune séquence ne termine → état non sûr (422 attendu par l'appelant).
      itemRepo.listWithFilters.mockImplementation(async (filters) => {
        if ('status' in filters && filters.status === 'in_stock') {
          return {
            data: [buildItem({ category: 'lighting' }), buildItem({ category: 'lighting' }), buildItem({ category: 'lighting' })],
            count: 3,
            page: 1,
            limit: 200,
            totalPages: 1,
          };
        }
        if ('eventId' in filters && filters.eventId === 'evt-1') {
          return {
            data: [
              buildItem({ category: 'lighting', status: 'allocated' }),
              buildItem({ category: 'lighting', status: 'allocated' }),
              buildItem({ category: 'lighting', status: 'allocated' }),
              buildItem({ category: 'lighting', status: 'allocated' }),
            ],
            count: 4,
            page: 1,
            limit: 200,
            totalPages: 1,
          };
        }
        // evt-2
        return {
          data: [
            buildItem({ category: 'lighting', status: 'allocated' }),
            buildItem({ category: 'lighting', status: 'allocated' }),
            buildItem({ category: 'lighting', status: 'allocated' }),
            buildItem({ category: 'lighting', status: 'allocated' }),
          ],
          count: 4,
          page: 1,
          limit: 200,
          totalPages: 1,
        };
      });
      eventRepo.findById.mockImplementation(async (id: string) => buildEvent(id));

      const decision = await service.requestAllocation('evt-1', 'lighting', 1, {
        'evt-1': { lighting: 8 },
        'evt-2': { lighting: 8 },
      });

      expect(decision.granted).toBe(false);
      expect(decision.reason).toMatch(/pas sûr/);
    });

    it('accorde une allocation sûre et renvoie l\'état résultant (needs par événement, séquence sûre)', async () => {
      itemRepo.listWithFilters.mockImplementation(async (filters) => {
        if ('status' in filters && filters.status === 'in_stock') {
          return {
            data: [buildItem({ category: 'lighting' }), buildItem({ category: 'lighting' })],
            count: 2,
            page: 1,
            limit: 200,
            totalPages: 1,
          };
        }
        return { data: [], count: 0, page: 1, limit: 200, totalPages: 0 };
      });
      eventRepo.findById.mockResolvedValue(buildEvent('evt-1'));

      const decision = await service.requestAllocation('evt-1', 'lighting', 1, {
        'evt-1': { lighting: 2 },
      });

      expect(decision.granted).toBe(true);
      expect(decision.reason).toBe('Allocation possible');
      expect(decision.safeSequence).toEqual(['evt-1']);
      expect(decision.resultingState?.available.lighting).toBe(1);
      expect(decision.resultingState?.needs['evt-1']).toEqual({ lighting: 1 });
    });
  });
});
