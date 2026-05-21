import { ResourceState } from '@/services/ResourceAllocationService';

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
