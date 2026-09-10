// ============================================================
// HamedShop - Configuration
// ============================================================

module.exports = {
  GITHUB_OWNER: "khanepaz",
  GITHUB_REPO: "hamed_test1",
  GITHUB_BRANCH: "main",

  SITE_URL: "https://khanepaz.github.io/hamed_test1/",

  API_VERSION: "3.0.0",

  // Default empty structures for JSON files stored on GitHub
  JSON_DEFAULTS: {
    "data/products.json": [],
    "data/categories.json": [],
    "data/badges.json": [],
    "data/variants.json": [],
    "data/inventory.json": [],
    "data/orders.json": [],
    "data/customers.json": [],
    "data/discounts.json": [],
    "data/settings.json": {
      currency: "IRR",
      shippingCost: 0,
      freeShippingThreshold: 0,
      shopName: "HamedShop",
      supportChat: ""
    },
    "data/product_drafts.json": {}
  },

  // Order statuses (lifecycle)
  ORDER_STATUSES: [
    "pending",
    "confirmed",
    "packing",
    "shipped",
    "delivered",
    "cancelled",
    "returned"
  ],

  ORDER_STATUS_LABELS: {
    pending: "⏳ در انتظار تأیید",
    confirmed: "✅ تأیید شده",
    packing: "📦 در حال آماده‌سازی",
    shipped: "🚚 ارسال شده",
    delivered: "🎉 تحویل داده شده",
    cancelled: "❌ لغو شده",
    returned: "↩️ مرجوع شده"
  }
};
