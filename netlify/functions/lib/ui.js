// ============================================================
// HamedShop - Admin UI (messages & lists)
// ============================================================

const { sendMessage, inlineKeyboard, SITE_URL } = require("./bale");
const { getProductsFile, getProduct, deleteProduct, updateProduct } = require("./products");
const { getCategoriesFile, deleteCategory } = require("./categories");
const { getBadgesFile, deleteBadge, updateBadge } = require("./badges");
const { getOrdersFile, updateOrderStatus, ORDER_STATUS_LABELS } = require("./orders");
const { readJsonFile } = require("./github");
const { JSON_DEFAULTS } = require("./config");
const {
  escapeMd,
  formatPrice,
  safeNumber,
  safeText
} = require("./utils");
const { saveDraft, deleteDraft } = require("./drafts");

async function showProducts(chatId) {
  const file = await getProductsFile();
  const products = file.data;

  if (!products.length) {
    return sendMessage(
      chatId,
      "هنوز محصولی ثبت نشده است.",
      inlineKeyboard([
        [{ text: "➕ افزودن محصول", callback_data: "product:new" }]
      ])
    );
  }

  const rows = products.map((p) => [
    {
      text: `${p.active === false ? "🚫 " : ""}${p.name} — ${formatPrice(p.finalPrice)}`,
      callback_data: `product:manage:${p.id}`
    }
  ]);

  rows.push([{ text: "➕ افزودن محصول", callback_data: "product:new" }]);
  rows.push([{ text: "🏠 منوی اصلی", callback_data: "menu" }]);

  return sendMessage(
    chatId,
    `📦 *محصولات* (${products.length})\nیکی را انتخاب کنید:`,
    inlineKeyboard(rows)
  );
}

async function showProductManagement(chatId, productId) {
  const product = await getProduct(productId);

  if (!product) {
    return sendMessage(chatId, "❌ محصول پیدا نشد.");
  }

  const text =
    `*مدیریت محصول*\n\n` +
    `*نام:* ${escapeMd(product.name)}\n` +
    `*دسته:* ${escapeMd(product.category || "-")}\n` +
    `*قیمت اصلی:* ${formatPrice(product.compareAtPrice)}\n` +
    `*تخفیف:* ${escapeMd(product.discountLabel || "بدون تخفیف")}\n` +
    `*قیمت نهایی:* ${formatPrice(product.finalPrice)}\n` +
    `*موجودی:* ${product.totalStock}\n` +
    `*وضعیت:* ${product.active ? "✅ فعال" : "🚫 غیرفعال"}\n` +
    `*ویژه:* ${product.featured ? "⭐ بله" : "خیر"}\n` +
    `*برچسب‌ها:* ${
      product.tags?.length
        ? escapeMd(product.tags.join(", "))
        : "ندارد"
    }`;

  return sendMessage(
    chatId,
    text,
    inlineKeyboard([
      [
        { text: "✏️ نام", callback_data: `product:edit_name:${productId}` },
        { text: "✏️ توضیحات", callback_data: `product:edit_desc:${productId}` }
      ],
      [
        { text: "💰 قیمت و تخفیف", callback_data: `product:edit_price:${productId}` },
        { text: "📊 موجودی", callback_data: `product:edit_stock:${productId}` }
      ],
      [
        { text: "📂 دسته", callback_data: `product:edit_cat:${productId}` },
        { text: "🏷️ برچسب‌ها", callback_data: `product:edit_tags:${productId}` }
      ],
      [
        {
          text: product.active ? "🚫 غیرفعال کردن" : "✅ فعال کردن",
          callback_data: `product:toggle:${productId}`
        },
        {
          text: product.featured ? "⭐ حذف ویژه" : "⭐ ویژه کردن",
          callback_data: `product:toggle_featured:${productId}`
        }
      ],
      [{ text: "🗑️ حذف محصول", callback_data: `product:delete:${productId}` }],
      [{ text: "◀️ بازگشت", callback_data: "products.list" }]
    ])
  );
}

async function showCategories(chatId) {
  const file = await getCategoriesFile();

  const rows = file.data.map((c) => [
    {
      text: `${c.icon || "📦"} ${c.name}${c.active === false ? " (غیرفعال)" : ""}`,
      callback_data: `category:detail:${c.id}`
    }
  ]);

  rows.push([{ text: "➕ دسته‌بندی جدید", callback_data: "category:new" }]);
  rows.push([{ text: "🏠 منوی اصلی", callback_data: "menu" }]);

  return sendMessage(
    chatId,
    `📂 *دسته‌بندی‌ها* (${file.data.length})`,
    inlineKeyboard(rows)
  );
}

async function showCategoryDetail(chatId, categoryId) {
  const file = await getCategoriesFile();
  const category = file.data.find((c) => String(c.id) === String(categoryId));

  if (!category) {
    return sendMessage(chatId, "❌ دسته‌بندی پیدا نشد.");
  }

  return sendMessage(
    chatId,
    `*دسته‌بندی*\n\n` +
      `آیکون: ${category.icon || "📦"}\n` +
      `نام: ${escapeMd(category.name)}\n` +
      `وضعیت: ${category.active !== false ? "فعال" : "غیرفعال"}`,
    inlineKeyboard([
      [
        { text: "✏️ نام", callback_data: `category:edit_name:${categoryId}` },
        { text: "✏️ آیکون", callback_data: `category:edit_icon:${categoryId}` }
      ],
      [{ text: "🗑️ حذف", callback_data: `category:delete:${categoryId}` }],
      [{ text: "◀️ بازگشت", callback_data: "categories.list" }]
    ])
  );
}

async function showBadges(chatId) {
  const file = await getBadgesFile();

  const rows = file.data.map((b) => [
    {
      text: `${b.icon || "🏷️"} ${b.name}`,
      callback_data: `badge:detail:${b.id}`
    }
  ]);

  rows.push([{ text: "➕ برچسب جدید", callback_data: "badge:new" }]);
  rows.push([{ text: "🏠 منوی اصلی", callback_data: "menu" }]);

  return sendMessage(
    chatId,
    `🏷️ *گزینه‌های ویژه / برچسب‌ها* (${file.data.length})`,
    inlineKeyboard(rows)
  );
}

async function showInventory(chatId) {
  const file = await readJsonFile("data/inventory.json", []);

  if (!file.data.length) {
    return sendMessage(chatId, "موجودی خالی است.");
  }

  const lines = file.data
    .map(
      (item) =>
        `• ${escapeMd(item.productName)} → *${item.stock}* ${
          item.active === false ? "(غیرفعال)" : ""
        }`
    )
    .join("\n");

  return sendMessage(
    chatId,
    `📊 *موجودی*\n\n${lines}`,
    inlineKeyboard([[{ text: "🏠 منوی اصلی", callback_data: "menu" }]])
  );
}

async function showOrders(chatId) {
  const file = await getOrdersFile();

  if (!file.data.length) {
    return sendMessage(
      chatId,
      "هنوز سفارشی ثبت نشده است.",
      inlineKeyboard([[{ text: "🏠 منوی اصلی", callback_data: "menu" }]])
    );
  }

  const sorted = [...file.data].reverse().slice(0, 20);

  const rows = sorted.map((o) => [
    {
      text: `${ORDER_STATUS_LABELS[o.status] || o.status} | ${o.id.slice(-6)} | ${formatPrice(o.total)}`,
      callback_data: `order:detail:${o.id}`
    }
  ]);

  rows.push([{ text: "🏠 منوی اصلی", callback_data: "menu" }]);

  return sendMessage(
    chatId,
    `🛒 *سفارش‌ها* (آخرین ${sorted.length})`,
    inlineKeyboard(rows)
  );
}

async function showOrderDetail(chatId, orderId) {
  const file = await getOrdersFile();
  const order = file.data.find((o) => o.id === orderId);

  if (!order) {
    return sendMessage(chatId, "❌ سفارش پیدا نشد.");
  }

  const items = (order.items || [])
    .map(
      (i) =>
        `• ${escapeMd(i.name)} × ${i.quantity} = ${formatPrice(i.total)}`
    )
    .join("\n");

  const text =
    `*سفارش ${escapeMd(order.id)}*\n\n` +
    `وضعیت: ${ORDER_STATUS_LABELS[order.status] || order.status}\n` +
    `جمع اقلام: ${formatPrice(order.subtotal)}\n` +
    (order.discount ? `تخفیف: ${formatPrice(order.discount)}\n` : "") +
    `ارسال: ${formatPrice(order.shipping)}\n` +
    `*مبلغ نهایی: ${formatPrice(order.total)}*\n\n` +
    `*اقلام:*\n${items}\n\n` +
    `مشتری: ${escapeMd(order.customer?.name || order.customer?.phone || "-")}`;

  return sendMessage(
    chatId,
    text,
    inlineKeyboard([
      [
        { text: "✅ تأیید", callback_data: `order:status:${orderId}:confirmed` },
        { text: "📦 آماده‌سازی", callback_data: `order:status:${orderId}:packing` }
      ],
      [
        { text: "🚚 ارسال", callback_data: `order:status:${orderId}:shipped` },
        { text: "🎉 تحویل", callback_data: `order:status:${orderId}:delivered` }
      ],
      [
        { text: "❌ لغو", callback_data: `order:status:${orderId}:cancelled` },
        { text: "↩️ مرجوع", callback_data: `order:status:${orderId}:returned` }
      ],
      [{ text: "◀️ بازگشت", callback_data: "orders.list" }]
    ])
  );
}

async function showCustomers(chatId) {
  const file = await readJsonFile("data/customers.json", []);

  if (!file.data.length) {
    return sendMessage(chatId, "هنوز مشتری‌ای ثبت نشده.");
  }

  const lines = file.data
    .slice(0, 30)
    .map((c) => `• ${escapeMd(c.name || "-")} | ${escapeMd(c.phone || "-")}`)
    .join("\n");

  return sendMessage(
    chatId,
    `👥 *مشتریان*\n\n${lines}`,
    inlineKeyboard([[{ text: "🏠 منوی اصلی", callback_data: "menu" }]])
  );
}

async function showDiscounts(chatId) {
  const file = await readJsonFile("data/discounts.json", []);

  if (!file.data.length) {
    return sendMessage(
      chatId,
      "کد تخفیفی تعریف نشده است.\n(از API یا فایل discounts.json اضافه کنید)"
    );
  }

  const lines = file.data
    .map(
      (d) =>
        `• \`${escapeMd(d.code)}\` → ${
          d.type === "percent" ? d.value + "%" : formatPrice(d.value)
        } ${d.active === false ? "(غیرفعال)" : ""}`
    )
    .join("\n");

  return sendMessage(
    chatId,
    `🏷️ *کدهای تخفیف*\n\n${lines}`,
    inlineKeyboard([[{ text: "🏠 منوی اصلی", callback_data: "menu" }]])
  );
}

async function showSettings(chatId) {
  const file = await readJsonFile(
    "data/settings.json",
    JSON_DEFAULTS["data/settings.json"]
  );
  const s = file.data;

  return sendMessage(
    chatId,
    `⚙️ *تنظیمات*\n\n` +
      `نام فروشگاه: ${escapeMd(s.shopName || "HamedShop")}\n` +
      `واحد پول: ${s.currency || "IRR"}\n` +
      `هزینه ارسال: ${formatPrice(s.shippingCost)}\n` +
      `آستانه ارسال رایگان: ${formatPrice(s.freeShippingThreshold)}\n\n` +
      `🌐 سایت: ${SITE_URL}`,
    inlineKeyboard([[{ text: "🏠 منوی اصلی", callback_data: "menu" }]])
  );
}

module.exports = {
  showProducts,
  showProductManagement,
  showCategories,
  showCategoryDetail,
  showBadges,
  showInventory,
  showOrders,
  showOrderDetail,
  showCustomers,
  showDiscounts,
  showSettings
};
