// Seeds the store with a curated brownie catalog. Idempotent-ish: only seeds
// products if none exist yet (so orders/users are preserved on restart).
import { db, save, id } from './db.js';

const CATALOG = [
  {
    name: 'Classic Fudge Brownie',
    tagline: 'The one that started it all',
    description:
      'Dense, gooey and impossibly rich. Belgian dark chocolate folded into a molten centre with a crackly, paper-thin top. Our best seller for a reason.',
    price: 350,
    gradient: 'linear-gradient(135deg, #5b3a29 0%, #2b1a12 100%)',
    emoji: '🍫',
    flavors: ['Original', 'Extra Fudgy', 'Sea Salt'],
    stock: 60,
    sold: 0,
    featured: true,
    active: true
  },
  {
    name: 'Walnut Crunch Brownie',
    tagline: 'Chocolate meets crunch',
    description:
      'Toasted California walnuts baked into a deep cocoa base. A satisfying crunch in every bite balanced by a soft, chewy middle.',
    price: 420,
    gradient: 'linear-gradient(135deg, #6d4c2f 0%, #3a2417 100%)',
    emoji: '🌰',
    flavors: ['Walnut', 'Walnut + Caramel', 'Double Nut'],
    stock: 40,
    sold: 0,
    featured: true,
    active: true
  },
  {
    name: 'Triple Chocolate Brownie',
    tagline: 'For the serious chocoholic',
    description:
      'Dark, milk and white chocolate chunks in one decadent square. Melts on the tongue, lingers on the mind.',
    price: 450,
    gradient: 'linear-gradient(135deg, #7b4b32 0%, #241009 100%)',
    emoji: '🍩',
    flavors: ['Triple Choc', 'Molten Core', 'Choc Overload'],
    stock: 50,
    sold: 0,
    featured: true,
    active: true
  },
  {
    name: 'Salted Caramel Brownie',
    tagline: 'Sweet, salty, unforgettable',
    description:
      'Ribbons of golden salted caramel swirled through a fudgy brownie, finished with a pinch of flaky sea salt.',
    price: 460,
    gradient: 'linear-gradient(135deg, #a06a34 0%, #3b230f 100%)',
    emoji: '🍯',
    flavors: ['Salted Caramel', 'Caramel + Pecan', 'Burnt Butter'],
    stock: 35,
    sold: 0,
    featured: false,
    active: true
  },
  {
    name: 'Nutella Stuffed Brownie',
    tagline: 'A molten hazelnut surprise',
    description:
      'A generous core of warm Nutella hidden inside a rich chocolate brownie. Cut it open and watch it flow.',
    price: 490,
    gradient: 'linear-gradient(135deg, #8a5a3c 0%, #2e1a11 100%)',
    emoji: '🫙',
    flavors: ['Nutella Core', 'Hazelnut Praline', 'Choco Hazel'],
    stock: 30,
    sold: 0,
    featured: true,
    active: true
  },
  {
    name: 'Red Velvet Brownie',
    tagline: 'Velvet smooth, cocoa kissed',
    description:
      'A striking crimson brownie with a subtle cocoa depth and a cream-cheese frosting swirl on top.',
    price: 470,
    gradient: 'linear-gradient(135deg, #7a2233 0%, #2a0a10 100%)',
    emoji: '❤️',
    flavors: ['Red Velvet', 'Cream Cheese Swirl', 'Berry Velvet'],
    stock: 25,
    sold: 0,
    featured: false,
    active: true
  },
  {
    name: 'Mint Chocolate Brownie',
    tagline: 'Cool meets cocoa',
    description:
      'A refreshing hit of peppermint through dark chocolate. Rich, cooling and endlessly moreish.',
    price: 440,
    gradient: 'linear-gradient(135deg, #2f6b52 0%, #12251c 100%)',
    emoji: '🌿',
    flavors: ['Mint Choc', 'After Eight', 'Cool Fudge'],
    stock: 28,
    sold: 0,
    featured: false,
    active: true
  },
  {
    name: 'Biscoff Blondie',
    tagline: 'The golden sibling',
    description:
      'A buttery brown-butter blondie loaded with Lotus Biscoff spread and crushed cookie pieces. Caramelised perfection.',
    price: 480,
    gradient: 'linear-gradient(135deg, #c8894a 0%, #4a2c14 100%)',
    emoji: '🍪',
    flavors: ['Biscoff', 'Cookie Butter', 'White Choc Biscoff'],
    stock: 32,
    sold: 0,
    featured: true,
    active: true
  }
];

const d = db();
if (d.products.length === 0) {
  for (const p of CATALOG) {
    d.products.push({ id: id(), createdAt: Date.now(), ...p });
  }
  save();
  console.log(`Seeded ${CATALOG.length} brownies.`);
} else {
  console.log(`Products already present (${d.products.length}). Skipping seed.`);
}
