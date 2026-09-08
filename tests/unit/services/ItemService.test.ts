import { BusinessRuleError, NotFoundError } from '@/core/errors';
import { ItemEntity, type ItemProps } from '@/modules/items/item.entity';
import type { ItemRepository } from '@/modules/items/item.repository';
import { ItemService } from '@/modules/items/item.service';

const EVENT_ID = '507f1f77bcf86cd799439010';

const buildItem = (id: string, overrides: Partial<ItemProps> = {}): ItemEntity =>
  new ItemEntity({
    id,
    qrCode: `QR-${id.slice(-4)}`,
    label: 'Projecteur LED',
    category: 'lighting',
    status: 'in_stock',
    weightKg: 12,
    lifespanYears: 10,
    manufacturingCo2Kg: 500,
    history: [],
    ...overrides,
  });

/**
 * Tests de l'allocation transactionnelle (ACID) d'un lot d'items à un événement.
 *
 * Le repository est mocké (pas de DB en unitaire) : `withTransaction` exécute
 * simplement le travail avec une session factice. On vérifie ici la LOGIQUE
 * d'orchestration du service — atomicité du chemin nominal et interruption du
 * lot dès la première erreur (qui, en prod, déclenche le rollback Mongo).
 */
describe('ItemService.allocateBatch (transaction ACID)', () => {
  let repo: jest.Mocked<ItemRepository>;
  let service: ItemService;
  const fakeSession = {} as never;

  beforeEach(() => {
    repo = {
      withTransaction: jest.fn((work: (s: never) => Promise<unknown>) => work(fakeSession)),
      findByIdInSession: jest.fn(),
      saveInSession: jest.fn(async (entity: ItemEntity) => entity),
    } as unknown as jest.Mocked<ItemRepository>;
    service = new ItemService(repo);
  });

  it('alloue tout le lot à l\'événement (chemin nominal, un seul commit)', async () => {
    const a = buildItem('507f1f77bcf86cd799439101');
    const b = buildItem('507f1f77bcf86cd799439102');
    repo.findByIdInSession.mockResolvedValueOnce(a).mockResolvedValueOnce(b);

    const result = await service.allocateBatch(EVENT_ID, [a.id, b.id], 'op-1');

    expect(result).toHaveLength(2);
    expect(result.every((i) => i.status === 'allocated')).toBe(true);
    expect(result.every((i) => i.eventId === EVENT_ID)).toBe(true);
    expect(repo.withTransaction).toHaveBeenCalledTimes(1);
    expect(repo.saveInSession).toHaveBeenCalledTimes(2);
  });

  it('rejette un lot vide sans ouvrir de transaction', async () => {
    await expect(service.allocateBatch(EVENT_ID, [], 'op-1')).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
    expect(repo.withTransaction).not.toHaveBeenCalled();
  });

  it('interrompt le lot et propage 404 si un item est introuvable (rien n\'est commité après)', async () => {
    const a = buildItem('507f1f77bcf86cd799439101');
    repo.findByIdInSession
      .mockResolvedValueOnce(a) // 1er trouvé
      .mockResolvedValueOnce(null); // 2e introuvable

    await expect(
      service.allocateBatch(EVENT_ID, [a.id, '507f1f77bcf86cd799439199'], 'op-1'),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Le 1er a été sauvé dans la transaction, mais comme la 2e ligne jette,
    // withTransaction (réel) annule le tout. On vérifie au moins qu'on s'arrête net.
    expect(repo.saveInSession).toHaveBeenCalledTimes(1);
  });

  it('échoue tout le lot (422) si un item n\'est pas dans un état allouable', async () => {
    const a = buildItem('507f1f77bcf86cd799439101');
    const b = buildItem('507f1f77bcf86cd799439102', { status: 'deployed' });
    repo.findByIdInSession.mockResolvedValueOnce(a).mockResolvedValueOnce(b);

    await expect(
      service.allocateBatch(EVENT_ID, [a.id, b.id], 'op-1'),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    expect(repo.saveInSession).toHaveBeenCalledTimes(1);
  });

  it('dédoublonne les identifiants en double', async () => {
    const a = buildItem('507f1f77bcf86cd799439101');
    repo.findByIdInSession.mockResolvedValue(a);

    const result = await service.allocateBatch(EVENT_ID, [a.id, a.id, a.id], 'op-1');

    expect(result).toHaveLength(1);
    expect(repo.findByIdInSession).toHaveBeenCalledTimes(1);
  });
});

/**
 * Mise en maintenance — machine à états.
 *
 * La règle vit dans l'entité (`ALLOWED_TRANSITIONS`), pas dans le service : on
 * la teste donc directement sur `ItemEntity`, sans repository. Le point
 * sensible est le sort d'`eventId` : la maintenance CONSERVE le rattachement
 * (l'équipement reste dans le secteur mis en cache par l'app mobile), seul le
 * retour au stock détache.
 */
describe('ItemEntity.sendToMaintenance (machine à états)', () => {
  it('in_stock → in_maintenance, et trace le mouvement daté', () => {
    const item = buildItem('507f1f77bcf86cd799439201');

    item.sendToMaintenance('op-1', 'Révision préventive');

    expect(item.status).toBe('in_maintenance');
    const last = item.history.at(-1)!;
    expect(last).toMatchObject({
      type: 'maintenance',
      fromStatus: 'in_stock',
      toStatus: 'in_maintenance',
      operatorId: 'op-1',
      note: 'Révision préventive',
    });
  });

  it('deployed → in_maintenance CONSERVE eventId (l\'item reste dans le secteur)', () => {
    const item = buildItem('507f1f77bcf86cd799439202', {
      status: 'deployed',
      eventId: EVENT_ID,
    });

    item.sendToMaintenance('op-1');

    expect(item.status).toBe('in_maintenance');
    expect(item.eventId).toBe(EVENT_ID);
  });

  it('la note est facultative', () => {
    const item = buildItem('507f1f77bcf86cd799439203');
    item.sendToMaintenance('op-1');
    expect(item.history.at(-1)).not.toHaveProperty('note');
  });

  it('in_transit → in_maintenance est refusé (422) : on répare, on n\'immobilise pas un camion', () => {
    const item = buildItem('507f1f77bcf86cd799439204', { status: 'in_transit' });
    expect(() => item.sendToMaintenance('op-1')).toThrow(BusinessRuleError);
    expect(item.status).toBe('in_transit');
  });

  it('lost → in_maintenance est refusé : « perdu » est un état terminal', () => {
    const item = buildItem('507f1f77bcf86cd799439205', { status: 'lost' });
    expect(() => item.sendToMaintenance('op-1')).toThrow(BusinessRuleError);
  });

  it('boucle complète : deployed → maintenance → in_stock, et LÀ eventId est détaché', () => {
    const item = buildItem('507f1f77bcf86cd799439206', {
      status: 'deployed',
      eventId: EVENT_ID,
    });

    item.sendToMaintenance('op-1', 'Ballast HS');
    expect(item.eventId).toBe(EVENT_ID);

    item.returnToStock('op-1');
    expect(item.status).toBe('in_stock');
    expect(item.eventId).toBeUndefined();
  });
});
