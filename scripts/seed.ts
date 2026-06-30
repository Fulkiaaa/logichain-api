/**
 * Seed d'un jeu de données réaliste pour la démo / le développement.
 *
 *   npm run seed
 *
 * Réinitialise les collections (users, events, items, routes) puis recrée un
 * « Festival Vert 2026 » cohérent : 7 utilisateurs (mots de passe hashés),
 * ~66 équipements répartis par statut, 3 feuilles de route.
 * URI lue depuis MONGO_URI (.env), sinon fallback localhost en replica set.
 */
import 'dotenv/config';

import bcrypt from 'bcrypt';
import mongoose from 'mongoose';

import { EventModel } from '@/modules/events/event.model';
import { ItemModel } from '@/modules/items/item.model';
import { RouteModel } from '@/modules/routes/route.model';
import { UserModel } from '@/modules/auth/user.model';

const URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/logichain?directConnection=true';
const PASSWORD = process.env.SEED_PASSWORD ?? 'LogiChain2026!';
const C: [number, number] = [2.4053, 48.929]; // centre du site (Parc de la Courneuve)

const rect = (lng: number, lat: number, dd: number) => ({
  type: 'Polygon' as const,
  coordinates: [[
    [lng - dd, lat - dd], [lng + dd, lat - dd], [lng + dd, lat + dd], [lng - dd, lat + dd], [lng - dd, lat - dd],
  ]],
});
const pt = (lng: number, lat: number) => ({ type: 'Point' as const, coordinates: [lng, lat] as [number, number] });
const dt = (s: string) => new Date(s);

async function main(): Promise<void> {
  await mongoose.connect(URI);
  console.log('Connecté à', URI, '\nRéinitialisation des collections…');
  await Promise.all([
    UserModel.deleteMany({}), EventModel.deleteMany({}),
    ItemModel.deleteMany({}), RouteModel.deleteMany({}),
  ]);

  // ---------- UTILISATEURS ----------
  const hash = await bcrypt.hash(PASSWORD, 12);
  const usersSpec = [
    { email: 'admin@logichain.fr',           fullName: 'Clara Admin',                    role: 'admin' },
    { email: 'responsable@logichain.fr',     fullName: 'Marc Dubois',                    role: 'logistics_manager' },
    { email: 'sofia@logichain.fr',           fullName: 'Sofia Lemaire',                  role: 'field_agent' },
    { email: 'yanis@logichain.fr',           fullName: 'Yanis Moreau',                   role: 'field_agent' },
    { email: 'ines@logichain.fr',            fullName: 'Inès Garcia',                    role: 'field_agent' },
    { email: 'transports-vert@logichain.fr', fullName: 'Paul Rivière (Transports Vert)', role: 'transporter' },
    { email: 'ecofret@logichain.fr',         fullName: 'Lucie Bernard (EcoFret)',        role: 'transporter' },
  ];
  const users = await UserModel.insertMany(
    usersSpec.map((u) => ({ ...u, passwordHash: hash, active: true })),
  );
  const byEmail = Object.fromEntries(users.map((u) => [u.email, String(u._id)]));
  const managerId = byEmail['responsable@logichain.fr']!;
  const agents = [byEmail['sofia@logichain.fr']!, byEmail['yanis@logichain.fr']!, byEmail['ines@logichain.fr']!];
  const transporters = [byEmail['transports-vert@logichain.fr']!, byEmail['ecofret@logichain.fr']!];

  // ---------- ÉVÉNEMENT ----------
  const event = await EventModel.create({
    name: 'Festival Vert 2026',
    slug: 'festival-vert-2026',
    status: 'active',
    startDate: dt('2026-07-10T08:00:00Z'),
    endDate: dt('2026-07-13T23:00:00Z'),
    expectedAttendance: 12000,
    managerId,
    zones: [
      { name: 'Scène principale',      category: 'stage',     capacity: 8000, area: rect(C[0], C[1] + 0.0016, 0.0012) },
      { name: 'Backstage / Loges',     category: 'backstage', capacity: 120,  area: rect(C[0] + 0.0022, C[1] + 0.0016, 0.0008) },
      { name: 'Village restauration',  category: 'public',    capacity: 3000, area: rect(C[0] - 0.0020, C[1], 0.0011) },
      { name: 'Zone logistique',       category: 'logistics', capacity: 0,    area: rect(C[0] + 0.0024, C[1] - 0.0018, 0.0010) },
      { name: 'Parking transporteurs', category: 'parking',   capacity: 40,   area: rect(C[0] - 0.0026, C[1] - 0.0020, 0.0012) },
    ],
  });
  const eventId = event._id;

  // ---------- ITEMS ----------
  const specs = [
    { cat: 'lighting', pfx: 'LIGHT', label: 'Projecteur LED 200W',       w: 12,   co2: 320,  price: 450,   life: 10, n: 8 },
    { cat: 'lighting', pfx: 'LIGHT', label: 'Découpe asservie 300W',     w: 9,    co2: 280,  price: 1200,  life: 8,  n: 4 },
    { cat: 'sound',    pfx: 'SOUND', label: 'Enceinte line-array',       w: 38,   co2: 850,  price: 4500,  life: 12, n: 6 },
    { cat: 'sound',    pfx: 'SOUND', label: 'Caisson de basse SB28',     w: 55,   co2: 1100, price: 3800,  life: 12, n: 4 },
    { cat: 'video',    pfx: 'VIDEO', label: 'Régie vidéo mobile',        w: 60,   co2: 1500, price: 12000, life: 8,  n: 3 },
    { cat: 'video',    pfx: 'VIDEO', label: 'Écran LED 3x2m',            w: 90,   co2: 2200, price: 18000, life: 8,  n: 2 },
    { cat: 'staging',  pfx: 'STAGE', label: 'Praticable 2x1m',           w: 45,   co2: 180,  price: 320,   life: 15, n: 10 },
    { cat: 'power',    pfx: 'POWER', label: 'Groupe électrogène 100kVA', w: 1200, co2: 8000, price: 25000, life: 15, n: 2 },
    { cat: 'power',    pfx: 'POWER', label: 'Coffret distribution 63A',  w: 35,   co2: 400,  price: 900,   life: 15, n: 4 },
    { cat: 'tent',     pfx: 'TENT',  label: 'Chapiteau 10x15m',          w: 800,  co2: 6000, price: 22000, life: 12, n: 2 },
    { cat: 'tent',     pfx: 'TENT',  label: 'Tente accueil 3x3m',        w: 28,   co2: 350,  price: 600,   life: 10, n: 4 },
    { cat: 'sanitary', pfx: 'SANIT', label: 'Bloc sanitaire mobile',     w: 450,  co2: 3000, price: 9000,  life: 15, n: 3 },
    { cat: 'fencing',  pfx: 'FENCE', label: 'Barrière Vauban 2m',        w: 16,   co2: 75,   price: 60,    life: 20, n: 10 },
    { cat: 'furniture',pfx: 'FURN',  label: 'Table pliante pro',         w: 14,   co2: 90,   price: 120,   life: 12, n: 4 },
  ] as const;

  const statusPlan = [
    'deployed', 'deployed', 'deployed', 'deployed', 'in_transit',
    'allocated', 'deployed', 'in_stock', 'deployed', 'allocated',
    'in_transit', 'deployed', 'in_stock', 'deployed', 'in_maintenance',
    'allocated', 'deployed', 'in_stock', 'in_transit', 'lost',
  ] as const;

  const buildHistory = (status: string, op: string, base: Date, loc: ReturnType<typeof pt>) => {
    const h: Record<string, unknown>[] = [];
    const t0 = new Date(base);
    if (['allocated', 'in_transit', 'deployed'].includes(status))
      h.push({ at: t0, type: 'allocation', fromStatus: 'in_stock', toStatus: 'allocated', operatorId: op });
    if (['in_transit', 'deployed'].includes(status))
      h.push({ at: new Date(t0.getTime() + 36e5), type: 'transit', fromStatus: 'allocated', toStatus: 'in_transit', operatorId: op });
    if (status === 'deployed')
      h.push({ at: new Date(t0.getTime() + 72e5), type: 'deploy', fromStatus: 'in_transit', toStatus: 'deployed', location: loc, operatorId: op });
    if (status === 'in_maintenance')
      h.push({ at: t0, type: 'maintenance', fromStatus: 'in_stock', toStatus: 'in_maintenance', operatorId: op, note: 'Révision préventive' });
    if (status === 'lost')
      h.push({ at: t0, type: 'anomaly', fromStatus: 'in_stock', toStatus: 'lost', operatorId: op, note: 'Non retrouvé après inventaire' });
    return h;
  };

  const counters: Record<string, number> = {};
  const itemDocs: Record<string, unknown>[] = [];
  let k = 0;
  for (const s of specs) {
    for (let i = 0; i < s.n; i += 1) {
      counters[s.pfx] = (counters[s.pfx] ?? 0) + 1;
      const status = statusPlan[k % statusPlan.length]!;
      const op = agents[k % agents.length]!;
      const onSite = ['allocated', 'in_transit', 'deployed'].includes(status);
      const loc = pt(C[0] + ((k % 7) - 3) * 0.0006, C[1] + ((k % 5) - 2) * 0.0006);
      const base = dt('2026-07-08T07:00:00Z');
      const doc: Record<string, unknown> = {
        qrCode: `LC-${s.pfx}-${String(counters[s.pfx]).padStart(3, '0')}`,
        label: s.label, category: s.cat, status,
        weightKg: s.w, purchasePriceEur: s.price, lifespanYears: s.life, manufacturingCo2Kg: s.co2,
        history: buildHistory(status, op, base, loc),
      };
      if (onSite) { doc.eventId = eventId; doc.location = loc; }
      itemDocs.push(doc);
      k += 1;
    }
  }
  const items = await ItemModel.insertMany(itemDocs);
  const movingIds = items.filter((i) => ['in_transit', 'deployed'].includes(i.status)).map((i) => i._id);

  // ---------- FEUILLES DE ROUTE ----------
  const depot = pt(2.3870, 48.9120);
  const depotSud = pt(1.4440, 43.6045);
  await RouteModel.insertMany([
    {
      reference: 'RTE-2026-01', eventId, transporterId: transporters[0], mode: 'truck',
      status: 'completed', plannedDistanceKm: 18, actualDistanceKm: 19.5, totalWeightKg: 4200,
      stops: [
        { sequence: 0, label: 'Dépôt Aubervilliers', type: 'pickup', location: depot, scheduledAt: dt('2026-07-08T06:00:00Z'), completedAt: dt('2026-07-08T06:30:00Z'), itemIds: movingIds.slice(0, 5) },
        { sequence: 1, label: 'Zone logistique – site', type: 'dropoff', location: pt(C[0] + 0.0024, C[1] - 0.0018), scheduledAt: dt('2026-07-08T07:15:00Z'), completedAt: dt('2026-07-08T07:40:00Z'), itemIds: movingIds.slice(0, 5) },
      ],
    },
    {
      reference: 'RTE-2026-02', eventId, transporterId: transporters[1], mode: 'electric_truck',
      status: 'in_progress', plannedDistanceKm: 22, totalWeightKg: 2600,
      stops: [
        { sequence: 0, label: 'Dépôt Aubervilliers', type: 'pickup', location: depot, scheduledAt: dt('2026-07-09T05:30:00Z'), completedAt: dt('2026-07-09T06:00:00Z'), itemIds: movingIds.slice(5, 9) },
        { sequence: 1, label: 'Backstage – site', type: 'dropoff', location: pt(C[0] + 0.0022, C[1] + 0.0016), scheduledAt: dt('2026-07-09T06:45:00Z') },
      ],
    },
    {
      reference: 'RTE-2026-03', eventId, transporterId: transporters[0], mode: 'rail',
      status: 'planned', plannedDistanceKm: 680, totalWeightKg: 9800,
      stops: [
        { sequence: 0, label: 'Dépôt régional Toulouse', type: 'pickup', location: depotSud, scheduledAt: dt('2026-07-07T20:00:00Z') },
        { sequence: 1, label: 'Gare fret Paris', type: 'transit', location: pt(2.3600, 48.8800), scheduledAt: dt('2026-07-08T08:00:00Z') },
        { sequence: 2, label: 'Zone logistique – site', type: 'dropoff', location: pt(C[0] + 0.0024, C[1] - 0.0018), scheduledAt: dt('2026-07-08T10:00:00Z') },
      ],
    },
  ]);

  // ---------- RÉSUMÉ ----------
  const byStatus = await ItemModel.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  console.log('\n=== SEED TERMINÉ ===');
  console.log('Utilisateurs :', users.length, '| mot de passe commun :', PASSWORD);
  console.log('Événement    :', event.name, `(${event.status})`, '— zones:', event.zones.length, '— _id:', String(eventId));
  console.log('Items        :', items.length, '→', byStatus.map((s) => `${s._id}:${s.n}`).join('  '));
  console.log('Routes       : 3 (truck completed · electric_truck in_progress · rail planned)');
  console.log('\nComptes :');
  usersSpec.forEach((u) => console.log(`  ${u.role.padEnd(18)} ${u.email}`));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
