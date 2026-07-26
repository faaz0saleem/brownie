const STORAGE_KEYS = {
  products: "brownie_products",
  orders: "brownie_orders",
  cart: "brownie_cart"
};

const DEFAULT_PRODUCTS = [
  {
    id: "p1",
    name: "Classic Fudge",
    shortDescription: "Deep chocolate, soft texture, and glossy finish.",
    description: "A bakery-style brownie with a crackly top and extra fudgy center.",
    pricePkr: 1290,
    badge: "Best Seller",
    tone: "tone-1"
  },
  {
    id: "p2",
    name: "Nutty Delight",
    shortDescription: "Rich brownies topped with roasted nuts.",
    description: "Chocolate brownie finished with crunchy almond and walnut mix.",
    pricePkr: 1590,
    badge: "Premium",
    tone: "tone-2"
  },
  {
    id: "p3",
    name: "Chocolate Drizzle",
    shortDescription: "Decadent brownies with smooth chocolate drizzle.",
    description: "Dark brownie layer finished with a silky chocolate ribbon.",
    pricePkr: 1690,
    badge: "New",
    tone: "tone-3"
  },
  {
    id: "p4",
    name: "Salted Caramel Swirl",
    shortDescription: "Fudgy brownie with caramel and sea-salt notes.",
    description: "Balanced sweetness with buttery caramel swirls and cocoa depth.",
    pricePkr: 1790,
    badge: "Fan Favorite",
    tone: "tone-1"
  },
  {
    id: "p5",
    name: "Double Choco Chunk",
    shortDescription: "Loaded with premium chocolate chunks.",
    description: "Dense brownie packed with molten chocolate chunks in every bite.",
    pricePkr: 1890,
    badge: "Rich",
    tone: "tone-2"
  },
  {
    id: "p6",
    name: "Espresso Cocoa",
    shortDescription: "Chocolate brownies with subtle espresso finish.",
    description: "Crafted for coffee lovers, with deep cocoa and roasted espresso notes.",
    pricePkr: 1750,
    badge: "Limited",
    tone: "tone-3"
  }
];

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function initStore() {
  if (!localStorage.getItem(STORAGE_KEYS.products)) {
    writeJson(STORAGE_KEYS.products, DEFAULT_PRODUCTS);
  }
  if (!localStorage.getItem(STORAGE_KEYS.orders)) {
    writeJson(STORAGE_KEYS.orders, []);
  }
  if (!localStorage.getItem(STORAGE_KEYS.cart)) {
    writeJson(STORAGE_KEYS.cart, []);
  }
}

function getProducts() {
  return readJson(STORAGE_KEYS.products, []);
}

function saveProducts(products) {
  writeJson(STORAGE_KEYS.products, products);
}

function getProductById(id) {
  return getProducts().find((item) => item.id === id) || null;
}

function getCart() {
  return readJson(STORAGE_KEYS.cart, []);
}

function saveCart(items) {
  writeJson(STORAGE_KEYS.cart, items);
}

function addToCart(productId, qty) {
  const quantity = Number(qty) || 1;
  const cart = getCart();
  const existing = cart.find((item) => item.productId === productId);
  if (existing) {
    existing.qty += quantity;
  } else {
    cart.push({ productId, qty: quantity });
  }
  saveCart(cart);
}

function updateCartItem(productId, qty) {
  const quantity = Number(qty) || 1;
  let cart = getCart();
  cart = cart.map((item) => {
    if (item.productId === productId) {
      return { ...item, qty: quantity };
    }
    return item;
  });
  cart = cart.filter((item) => item.qty > 0);
  saveCart(cart);
}

function clearCart() {
  saveCart([]);
}

function removeCartItem(productId) {
  const cart = getCart().filter((item) => item.productId !== productId);
  saveCart(cart);
}

function getCartWithDetails() {
  const products = getProducts();
  const cart = getCart();
  return cart
    .map((entry) => {
      const product = products.find((p) => p.id === entry.productId);
      if (!product) {
        return null;
      }
      const lineTotal = product.pricePkr * entry.qty;
      return {
        ...entry,
        product,
        lineTotal
      };
    })
    .filter(Boolean);
}

function getCartTotals() {
  const items = getCartWithDetails();
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const delivery = subtotal > 0 ? 250 : 0;
  const total = subtotal + delivery;
  return { subtotal, delivery, total };
}

function getOrders() {
  return readJson(STORAGE_KEYS.orders, []);
}

function saveOrders(orders) {
  writeJson(STORAGE_KEYS.orders, orders);
}

function placeOrder(customer) {
  const items = getCartWithDetails();
  const totals = getCartTotals();
  if (!items.length) {
    return null;
  }

  const order = {
    id: `ORD-${Date.now()}`,
    createdAt: new Date().toISOString(),
    paymentMethod: "Cash on Delivery",
    status: "Pending",
    customer,
    items: items.map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      qty: item.qty,
      unitPricePkr: item.product.pricePkr,
      lineTotalPkr: item.lineTotal
    })),
    totals
  };

  const orders = getOrders();
  orders.unshift(order);
  saveOrders(orders);
  clearCart();
  return order;
}

function updateOrderStatus(orderId, status) {
  const orders = getOrders().map((order) => {
    if (order.id === orderId) {
      return { ...order, status };
    }
    return order;
  });
  saveOrders(orders);
}

function createProduct(payload) {
  const products = getProducts();
  const newProduct = {
    id: `p${Date.now()}`,
    name: payload.name,
    shortDescription: payload.shortDescription,
    description: payload.description,
    pricePkr: Number(payload.pricePkr),
    badge: payload.badge || "Fresh",
    tone: payload.tone || "tone-1"
  };
  products.push(newProduct);
  saveProducts(products);
}

function deleteProduct(productId) {
  const products = getProducts().filter((item) => item.id !== productId);
  saveProducts(products);

  const cart = getCart().filter((item) => item.productId !== productId);
  saveCart(cart);
}

function formatPkr(value) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0
  }).format(value);
}

initStore();

window.BrownieStore = {
  getProducts,
  getProductById,
  saveProducts,
  addToCart,
  getCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  getCartWithDetails,
  getCartTotals,
  getOrders,
  placeOrder,
  updateOrderStatus,
  createProduct,
  deleteProduct,
  formatPkr
};
