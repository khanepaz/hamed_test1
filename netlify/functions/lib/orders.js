// ============================================================
// HamedShop - Orders
// ============================================================

const { readJsonFile, writeJsonFile } = require("./github");
const {
  nowISO,
  generateId,
  safeNumber,
  safeText,
  safeArray
} = require("./utils");
const {
  getProductsFile,
  saveProductsFile,
  normalizeProduct,
  syncIndexes
} = require("./products");
const { ORDER_STATUSES, ORDER_STATUS_LABELS, JSON_DEFAULTS } = require("./config");

async function getOrdersFile() {
  return readJsonFile("data/orders.json", []);
}

async function getOrderById(orderId) {
  if (!orderId) return null;
  const file = await getOrdersFile();
  return (
    file.data.find((o) => String(o.id) === String(orderId)) || null
  );
}

async function createOrder(body) {
  const productsFile = await getProductsFile();
  const products = productsFile.data.map(normalizeProduct);
  const items = safeArray(body.items);

  if (items.length === 0) {
    throw new Error("Order items are empty");
  }

  let subtotal = 0;
  const orderItems = [];

  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      throw new Error(`Product not found: ${item.productId}`);
    }

    const quantity = Math.max(1, parseInt(item.quantity || 1, 10));
    let variant = null;
    let unitPrice = product.finalPrice;
    let variantName = "";

    if (item.variantId) {
      variant = product.variants.find((v) => v.id === item.variantId);
      if (!variant) throw new Error("Variant not found");
      if (variant.stock < quantity) {
        throw new Error("Insufficient variant stock");
      }
      unitPrice = variant.price || unitPrice;
      variantName = variant.name || "";
    } else {
      if (product.totalStock < quantity) {
        throw new Error("Insufficient stock");
      }
    }

    const total = unitPrice * quantity;
    subtotal += total;

    const image =
      (Array.isArray(product.images) && product.images[0]) ||
      product.image ||
      null;

    orderItems.push({
      productId: product.id,
      variantId: variant ? variant.id : null,
      name: product.name,
      variantName,
      image,
      quantity,
      unitPrice,
      total
    });
  }

  for (const item of orderItems) {
    const product = products.find((p) => p.id === item.productId);

    if (item.variantId) {
      const variant = product.variants.find((v) => v.id === item.variantId);
      variant.stock -= item.quantity;
    } else {
      product.stock = Math.max(0, product.stock - item.quantity);
    }

    normalizeProduct(product);
  }

  const settingsFile = await readJsonFile(
    "data/settings.json",
    JSON_DEFAULTS["data/settings.json"]
  );

  const shippingCost =
    body.shippingCost !== undefined
      ? safeNumber(body.shippingCost)
      : settingsFile.data.freeShippingThreshold > 0 &&
          subtotal >= settingsFile.data.freeShippingThreshold
        ? 0
        : safeNumber(settingsFile.data.shippingCost);

  let discount = 0;
  let discountCode = null;

  if (body.discountCode) {
    const discountsFile = await readJsonFile("data/discounts.json", []);
    const code = safeText(body.discountCode).toLowerCase();
    const found = discountsFile.data.find(
      (d) =>
        safeText(d.code).toLowerCase() === code &&
        d.active !== false
    );

    if (found) {
      discountCode = found.code;
      if (found.type === "percent") {
        discount = Math.round((subtotal * safeNumber(found.value)) / 100);
      } else {
        discount = Math.min(subtotal, safeNumber(found.value));
      }
    }
  }

  const order = {
    id: generateId("ORD"),
    items: orderItems,
    subtotal,
    discount,
    discountCode,
    shipping: shippingCost,
    total: Math.max(0, subtotal - discount + shippingCost),
    status: "pending",
    paymentStatus: "unpaid",
    customer: body.customer || {},
    note: safeText(body.note),
    baleChatId: body.baleChatId || null,
    createdAt: nowISO(),
    updatedAt: nowISO()
  };

  const ordersFile = await getOrdersFile();
  ordersFile.data.push(order);

  await saveProductsFile(
    products,
    productsFile.sha,
    `Reserve stock for order ${order.id}`
  );
  await syncIndexes(products);

  await writeJsonFile(
    "data/orders.json",
    ordersFile.data,
    `Create order ${order.id}`,
    ordersFile.sha
  );

  return order;
}

async function updateOrderStatus(orderId, newStatus) {
  if (!ORDER_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }

  const ordersFile = await getOrdersFile();
  const index = ordersFile.data.findIndex((o) => o.id === orderId);

  if (index === -1) throw new Error("Order not found");

  const order = ordersFile.data[index];
  const prevStatus = order.status;

  const shouldRestore =
    ["cancelled", "returned"].includes(newStatus) &&
    !["cancelled", "returned"].includes(prevStatus);

  if (shouldRestore) {
    const productsFile = await getProductsFile();
    const products = productsFile.data.map(normalizeProduct);

    for (const item of order.items || []) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;

      if (item.variantId) {
        const variant = product.variants.find((v) => v.id === item.variantId);
        if (variant) variant.stock += item.quantity;
      } else {
        product.stock = (product.stock || 0) + item.quantity;
      }
      normalizeProduct(product);
    }

    await saveProductsFile(
      products,
      productsFile.sha,
      `Restore stock for order ${orderId}`
    );
    await syncIndexes(products);
  }

  order.status = newStatus;
  order.updatedAt = nowISO();
  ordersFile.data[index] = order;

  await writeJsonFile(
    "data/orders.json",
    ordersFile.data,
    `Update order ${orderId} → ${newStatus}`,
    ordersFile.sha
  );

  return order;
}

async function linkOrderToChat(orderId, chatId) {
  const ordersFile = await getOrdersFile();
  const index = ordersFile.data.findIndex(
    (o) => String(o.id) === String(orderId)
  );
  if (index === -1) throw new Error("Order not found");

  const order = ordersFile.data[index];
  if (String(order.baleChatId) === String(chatId)) {
    return order;
  }

  order.baleChatId = chatId;
  order.customer = order.customer || {};
  order.customer.baleChatId = chatId;
  order.updatedAt = nowISO();
  ordersFile.data[index] = order;

  await writeJsonFile(
    "data/orders.json",
    ordersFile.data,
    `Link order ${orderId} to Bale chat`,
    ordersFile.sha
  );

  return order;
}

async function markOrderPaid(orderId, paymentMeta = {}) {
  const ordersFile = await getOrdersFile();
  const index = ordersFile.data.findIndex(
    (o) => String(o.id) === String(orderId)
  );
  if (index === -1) throw new Error("Order not found");

  const order = ordersFile.data[index];
  order.paymentStatus = "paid";
  order.paidAt = paymentMeta.paidAt || nowISO();
  order.payment = {
    ...(order.payment || {}),
    ...paymentMeta
  };

  if (paymentMeta.chatId) {
    order.baleChatId = paymentMeta.chatId;
    order.customer = order.customer || {};
    order.customer.baleChatId = paymentMeta.chatId;
  }

  if (order.status === "pending" || order.status === "awaiting_payment") {
    order.status = "confirmed";
  }

  order.updatedAt = nowISO();
  ordersFile.data[index] = order;

  await writeJsonFile(
    "data/orders.json",
    ordersFile.data,
    `Mark order ${orderId} paid`,
    ordersFile.sha
  );

  return order;
}

module.exports = {
  getOrdersFile,
  getOrderById,
  createOrder,
  updateOrderStatus,
  linkOrderToChat,
  markOrderPaid,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS
};
