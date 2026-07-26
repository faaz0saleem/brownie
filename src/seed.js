// Seeds Fudgio's catalog: three signature flavours, made from our secret
// small-batch recipe. Idempotent — only seeds when no products exist.
import { store, initStore } from './data/index.js';

const CATALOG = [
  {
    slug: 'chocolate',
    name: 'Classic Chocolate',
    tagline: 'The original, impossibly fudgy',
    description:
      'Our signature square: dense, gooey and deeply chocolatey with a crackly, paper-thin top. Made from our secret small-batch recipe using premium dark chocolate and real butter. The one everyone comes back for.',
    price: 900,
    gradient: 'linear-gradient(135deg, #5b3a29 0%, #2b1a12 100%)',
    emoji: '🍫',
    flavors: ['Classic Chocolate'],
    sizes: [
      { label: 'Box of 6', pieces: 6, price: 900 },
      { label: 'Box of 9', pieces: 9, price: 1290 },
      { label: 'Box of 12', pieces: 12, price: 1650 }
    ],
    allergens: ['Gluten (wheat)', 'Dairy', 'Eggs', 'Soy'],
    containsNuts: false,
    stock: 60, sold: 0, featured: true, active: true, sort: 0
  },
  {
    slug: 'nutty-delight',
    name: 'Nutty Delight',
    tagline: 'Loaded with toasted nuts',
    description:
      'A rich chocolate brownie packed with roasted walnuts and hazelnuts for a satisfying crunch in every bite. Made from our secret small-batch recipe. For serious nut lovers.',
    price: 1050,
    gradient: 'linear-gradient(135deg, #6d4c2f 0%, #3a2417 100%)',
    emoji: '🌰',
    flavors: ['Nutty Delight'],
    sizes: [
      { label: 'Box of 6', pieces: 6, price: 1050 },
      { label: 'Box of 9', pieces: 9, price: 1490 },
      { label: 'Box of 12', pieces: 12, price: 1920 }
    ],
    allergens: ['Tree nuts (walnut, hazelnut)', 'Gluten (wheat)', 'Dairy', 'Eggs', 'Soy'],
    containsNuts: true,
    stock: 45, sold: 0, featured: true, active: true, sort: 1
  },
  {
    slug: 'salted-caramel',
    name: 'Salted Caramel',
    tagline: 'Sweet, salty, unforgettable',
    description:
      'Ribbons of golden salted caramel swirled through a fudgy chocolate brownie and finished with a pinch of flaky sea salt. Made from our secret small-batch recipe. The perfect balance of sweet and salty.',
    price: 1050,
    gradient: 'linear-gradient(135deg, #a06a34 0%, #3b230f 100%)',
    emoji: '🍯',
    flavors: ['Salted Caramel'],
    sizes: [
      { label: 'Box of 6', pieces: 6, price: 1050 },
      { label: 'Box of 9', pieces: 9, price: 1490 },
      { label: 'Box of 12', pieces: 12, price: 1920 }
    ],
    allergens: ['Gluten (wheat)', 'Dairy', 'Eggs', 'Soy'],
    containsNuts: false,
    stock: 50, sold: 0, featured: true, active: true, sort: 2
  }
];

export async function seed() {
  await initStore();
  const existing = await store.listProducts({ includeInactive: true });
  if (existing.length > 0) {
    return { seeded: 0, message: `Products already present (${existing.length}).` };
  }
  for (const p of CATALOG) await store.createProduct(p);
  return { seeded: CATALOG.length, message: `Seeded ${CATALOG.length} flavours.` };
}

// Allow running directly: `npm run seed`
if (import.meta.url === `file://${process.argv[1]}`) {
  seed().then((r) => { console.log(r.message); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
