// ============================================================
// HamedShop - Bale Bot + GitHub + Netlify Functions
// API Complete - Unified Version
// ============================================================

const GITHUB_OWNER = "khanepaz";
const GITHUB_REPO = "hamed_test1";
const GITHUB_BRANCH = "main";

const PRODUCTS_FILE = "data/products.json";
const CATEGORIES_FILE = "data/categories.json";
const DISCOUNTS_FILE = "data/discounts.json";
const ORDERS_FILE = "data/orders.json";

// ------------------------------------------------------------
// Environment
// ------------------------------------------------------------

const BALE_BOT_TOKEN = process.env.BALE_BOT_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const BALE_ADMIN_ID = process.env.BALE_ADMIN_ID || "";

if (!BALE_BOT_TOKEN) {
  throw new Error("BALE_BOT_TOKEN is not configured");
}

if (!GITHUB_TOKEN) {
  throw new Error("GITHUB_TOKEN is not configured");
}

// ------------------------------------------------------------
// Runtime state
// ------------------------------------------------------------

const userStates = new Map();

// ------------------------------------------------------------
// Default categories
// ------------------------------------------------------------

const DEFAULT_CATEGORIES = [
  { id: "clothing", name: "پوشاک", emoji: "👕", active: true, createdAt: "2026-01-

01T00:00:00.000Z" },
  { id: "shoes", name: "کفش", emoji: "👟", active: true, createdAt: "2026-01-

01T00:00:00.000Z" },
  { id: "bags", name: "کیف", emoji: "👜", active: true, createdAt: "2026-01-01T00:00:00.000Z" 

},
  { id: "cosmetics", name: "لوازم آرایشی", emoji: "💄", active: true, createdAt: "2026-01-

01T00:00:00.000Z" },
  { id: "home", name: "لوازم خانه", emoji: "🏠", active: true, createdAt: "2026-01-

01T00:00:00.000Z" },
  { id: "digital", name: "دیجیتال", emoji: "📱", active: true, createdAt: "2026-01-

01T00:00:00.000Z" }
];

// ------------------------------------------------------------
// Utilities
// ------------------------------------------------------------

function nowISO() {
  return new Date().toISOString();
}

function generateProductId() {
  const d = new Date();
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");
  return `P${y}${m}${day}${h}${min}${sec}${Math.floor(Math.random() * 90 + 10)}`;
}

function generateVariantId(index = 0) {
  return `V${Date.now()}${String(index + 1).padStart(2, "0")}`;
}

function generateOrderId() {
  const d = new Date();
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `O${y}${m}${day}${Date.now().toString().slice(-7)}`;
}

function safeText(value, maxLength = 500) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveInteger(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function escapeHtml(text) {
  return safeText(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatPrice(value) {
  return Number(value).toLocaleString("fa-IR");
}

function createSlug(text) {
  return safeText(text)
    .toLowerCase()
    .replace(/[\u200c\s]+/g, "-")
    .replace(/[^a-z0-9\u0600-\u06ff_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function variantKey(attributes) {
  return Object.keys(attributes)
    .sort()
    .map(key => `${key}=${attributes[key]}`)
    .join("|");
}

function formatVariantAttributes(attributes) {
  return Object.entries(attributes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ");
}

function generateCombinations(attributes) {
  if (!attributes.length) return [];
  let combinations = [{}];
  for (const attribute of attributes) {
    const next = [];
    for (const combination of combinations) {
      for (const value of attribute.values) {
        next.push({ ...combination, [attribute.name]: value });
      }
    }
    combinations = next;
  }
  return combinations;
}

function parseVariantAttributes(text) {
  const lines = safeText(text, 3000)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const attributes = [];
  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const name = safeText(line.slice(0, separatorIndex), 100);
    const valuesText = safeText(line.slice(separatorIndex + 1), 500);
    if (!name || !valuesText) continue;
    const values = valuesText
      .split(/[،,]/)
      .map(value => safeText(value, 100))
      .filter(Boolean);
    const uniqueValues = [...new Set(values)];
    if (uniqueValues.length > 0) {
      attributes.push({ name, values: uniqueValues });
    }
  }
  return attributes;
}

function featureFlagText(product) {
  return [
    `${product.featured ? "☑️" : "⬜"} ⭐ ویژه`,
    `${product.bestseller ? "☑️" : "⬜"} 🔥 پرفروش`,
    `${product.isNew ? "☑️" : "⬜"} 🆕 جدید`,
    `${product.discounted ? "☑️" : "⬜"} 🏷️ تخفیف‌دار`
  ].join("\n");
}

// ------------------------------------------------------------
// Bale API
// ------------------------------------------------------------

async function baleApi(method, body = {}) {
  const url = `https://tapi.bale.ai/bot${BALE_BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Bale API error: ${data.description || JSON.stringify(data)}`);
  }
  return data.result;
}

async function sendMessage(chatId, text, replyMarkup = null) {
  const body = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return baleApi("sendMessage", body);
}

async function editMessage(chatId, messageId, text, replyMarkup = null) {
  const body = { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return baleApi("editMessageText", body);
}

async function answerCallbackQuery(callbackQueryId, text = "") {
  try {
    return await baleApi("answerCallbackQuery", { callback_query_id: callbackQueryId, text 

});
  } catch (error) {
    console.error("answerCallbackQuery error:", error.message);
  }
}

async function getFile(fileId) {
  return baleApi("getFile", { file_id: fileId });
}

// ------------------------------------------------------------
// GitHub API
// ------------------------------------------------------------

function githubHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}

async function githubGet(path) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/

${path}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  const response = await fetch(url, { headers: githubHeaders() });
  if (response.status === 404) return null;
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`GitHub GET error ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function githubPut(path, contentBase64, message, sha = null) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/

${path}`;
  const body = { message, content: contentBase64, branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  const response = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(),
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`GitHub PUT error ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function encodeBase64Utf8(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

function encodeBase64Binary(buffer) {
  return Buffer.from(buffer).toString("base64");
}

// ------------------------------------------------------------
// JSON file operations
// ------------------------------------------------------------

async function readJsonFile(path, fallback) {
  const file = await githubGet(path);
  if (!file) return { data: fallback, sha: null };
  try {
    const decoded = Buffer.from(file.content, "base64").toString("utf8");
    return { data: JSON.parse(decoded), sha: file.sha };
  } catch (error) {
    console.error(`Invalid JSON in ${path}:`, error.message);
    return { data: fallback, sha: file.sha };
  }
}

async function saveJsonFile(path, data, message, knownSha = null) {
  let sha = knownSha;
  if (!sha) {
    const existing = await githubGet(path);
    if (existing) sha = existing.sha;
  }
  const json = JSON.stringify(data, null, 2);
  return githubPut(path, encodeBase64Utf8(json), message, sha);
}

// ------------------------------------------------------------
// Data normalization
// ------------------------------------------------------------

function normalizeCategory(category) {
  return {
    id: safeText(category?.id || ""),
    name: safeText(category?.name || ""),
    emoji: safeText(category?.emoji || "📂"),
    active: category?.active !== false,
    createdAt: category?.createdAt || nowISO()
  };
}

function normalizeVariant(variant, index = 0) {
  const attributes = variant && typeof variant.attributes === "object" ? 

variant.attributes : {};
  const normalizedAttributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    const k = safeText(key, 100);
    const v = safeText(value, 200);
    if (k && v) normalizedAttributes[k] = v;
  }
  return {
    id: safeText(variant?.id || generateVariantId(index)),
    attributes: normalizedAttributes,
    stock: Math.max(0, Math.floor(toNumber(variant?.stock, 0))),
    enabled: variant?.enabled !== false
  };
}

function normalizeProduct(product, index = 0) {
  const legacyCategory = safeText(product?.category || "");
  const categoryId = safeText(product?.categoryId || legacyCategory);
  const categoryName = safeText(product?.categoryName || legacyCategory || "");
  const variants = Array.isArray(product?.variants) ? product.variants.map

(normalizeVariant) : [];
  const basePrice = Math.max(0, toNumber(product?.price ?? product?.basePrice ?? 0));
  const discountObject = product?.discount && typeof product.discount === "object"
    ? {
        type: product.discount.type === "fixed" ? "fixed" : product.discount.type === 

"percent" ? "percent" : "none",
        value: Math.max(0, toNumber(product.discount.value, 0))
      }
    : { type: "none", value: 0 };
  const productDiscounted = discountObject.type !== "none" && discountObject.value > 0;
  return {
    id: safeText(product?.id || generateProductId()),
    name: safeText(product?.name || "محصول بدون نام", 300),
    categoryId,
    categoryName,
    category: categoryName,
    image: safeText(product?.image || "", 1000),
    variants,
    price: basePrice,
    discount: discountObject,
    featured: product?.featured === true,
    bestseller: product?.bestseller === true,
    isNew: product?.isNew === true,
    discounted: product?.discounted === true || productDiscounted,
    createdAt: product?.createdAt || nowISO(),
    updatedAt: product?.updatedAt || product?.createdAt || nowISO()
  };
}

function normalizeDiscount(discount) {
  return {
    id: safeText(discount?.id || `D${Date.now()}`),
    name: safeText(discount?.name || "تخفیف"),
    type: discount?.type === "fixed" ? "fixed" : "percent",
    value: Math.max(0, toNumber(discount?.value, 0)),
    scope: ["product", "category", "global"].includes(discount?.scope) ? discount.scope : 

"global",
    targetId: safeText(discount?.targetId || ""),
    minQuantity: Math.max(1, Math.floor(toNumber(discount?.minQuantity, 1))),
    enabled: discount?.enabled !== false,
    createdAt: discount?.createdAt || nowISO(),
    updatedAt: discount?.updatedAt || discount?.createdAt || nowISO()
  };
}

// ------------------------------------------------------------
// Categories
// ------------------------------------------------------------

async function getCategories() {
  const result = await readJsonFile(CATEGORIES_FILE, []);
  let categories = Array.isArray(result.data) ? result.data.map(normalizeCategory) : [];
  if (categories.length === 0) {
    categories = DEFAULT_CATEGORIES.map(normalizeCategory);
    await saveJsonFile(CATEGORIES_FILE, categories, "Initialize categories");
  }
  return categories;
}

async function saveCategories(categories, message) {
  const current = await readJsonFile(CATEGORIES_FILE, []);
  return saveJsonFile(CATEGORIES_FILE, categories.map(normalizeCategory), message, 

current.sha);
}

// ------------------------------------------------------------
// Products
// ------------------------------------------------------------

async function getProducts() {
  const result = await readJsonFile(PRODUCTS_FILE, []);
  return Array.isArray(result.data) ? result.data.map(normalizeProduct) : [];
}

async function saveProducts(products, message) {
  const current = await readJsonFile(PRODUCTS_FILE, []);
  return saveJsonFile(PRODUCTS_FILE, products.map(normalizeProduct), message, 

current.sha);
}

async function findProduct(productId) {
  const products = await getProducts();
  return products.find(product => product.id === productId) || null;
}

// ------------------------------------------------------------
// Discounts
// ------------------------------------------------------------

async function getDiscounts() {
  const result = await readJsonFile(DISCOUNTS_FILE, []);
  return Array.isArray(result.data) ? result.data.map(normalizeDiscount) : [];
}

async function saveDiscounts(discounts, message) {
  const current = await readJsonFile(DISCOUNTS_FILE, []);
  return saveJsonFile(DISCOUNTS_FILE, discounts.map(normalizeDiscount), message, 

current.sha);
}

// ------------------------------------------------------------
// Orders
// ------------------------------------------------------------

async function getOrders() {
  const result = await readJsonFile(ORDERS_FILE, []);
  return Array.isArray(result.data) ? result.data : [];
}

async function saveOrders(orders, message) {
  const current = await readJsonFile(ORDERS_FILE, []);
  return saveJsonFile(ORDERS_FILE, orders, message, current.sha);
}

// ------------------------------------------------------------
// State management
// ------------------------------------------------------------

function setUserState(userId, state) {
  userStates.set(String(userId), { ...state, updatedAt: Date.now() });
}

function getUserState(userId) {
  return userStates.get(String(userId)) || null;
}

function clearUserState(userId) {
  userStates.delete(String(userId));
}

// ------------------------------------------------------------
// Admin authorization
// ------------------------------------------------------------

function isAdmin(userId) {
  if (!BALE_ADMIN_ID) return true;
  return String(userId) === String(BALE_ADMIN_ID);
}

// ------------------------------------------------------------
// Upload image to GitHub
// ------------------------------------------------------------

async function uploadTelegramPhotoToGitHub(fileId, productId) {
  const file = await getFile(fileId);
  if (!file || !file.file_path) {
    throw new Error("Telegram file path not found");
  }
  const fileUrl = `https://tapi.bale.ai/file/bot${BALE_BOT_TOKEN}/${file.file_path}`;
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Unable to download Bale file: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  let extension = "jpg";
  const lowerPath = String(file.file_path).toLowerCase();
  if (lowerPath.endsWith(".png")) extension = "png";
  else if (lowerPath.endsWith(".webp")) extension = "webp";
  else if (lowerPath.endsWith(".jpeg")) extension = "jpeg";
  const githubPath = `images/${productId}.${extension}`;
  await githubPut(githubPath, encodeBase64Binary(buffer), `Add product image ${productId}

`);
  return githubPath;
}

// ------------------------------------------------------------
// Price calculation
// ------------------------------------------------------------

function calculateProductPrice(product) {
  const base = Math.max(0, toNumber(product.price, 0));
  const discount = product.discount || { type: "none", value: 0 };
  let finalPrice = base;
  if (discount.type === "percent") {
    finalPrice = base - (base * Math.min(100, Math.max(0, toNumber(discount.value, 0)))) / 

100;
  }
  if (discount.type === "fixed") {
    finalPrice = base - Math.min(base, Math.max(0, toNumber(discount.value, 0)));
  }
  return Math.max(0, Math.floor(finalPrice));
}

// ------------------------------------------------------------
// Keyboards
// ------------------------------------------------------------

function mainMenuKeyboard() {
  return {
    keyboard: [
      [{ text: "➕ افزودن محصول" }, { text: "📦 مشاهده محصولات" }],
      [{ text: "📂 مدیریت دسته‌بندی‌ها" }, { text: "⚙️ مدیریت" }],
      [{ text: "🌐 مشاهده سایت" }]
    ],
    resize_keyboard: true
  };
}

function cancelKeyboard() {
  return {
    keyboard: [[{ text: "❌ لغو" }]],
    resize_keyboard: true
  };
}

function categoryInlineKeyboard(categories, callbackPrefix = "add_category:") {
  const rows = [];
  for (let i = 0; i < categories.length; i += 2) {
    const row = [];
    const first = categories[i];
    if (first) row.push({ text: `${first.emoji} ${first.name}`, callback_data: `

${callbackPrefix}${first.id}` });
    const second = categories[i + 1];
    if (second) row.push({ text: `${second.emoji} ${second.name}`, callback_data: `

${callbackPrefix}${second.id}` });
    rows.push(row);
  }
  rows.push([{ text: "❌ لغو", callback_data: "add_cancel" }]);
  return { inline_keyboard: rows };
}

// ------------------------------------------------------------
// Main menu
// ------------------------------------------------------------

async function sendMainMenu(chatId) {
  return sendMessage(
    chatId,
    "🏠 <b>مدیریت HamedShop</b>\n\nیکی از گزینه‌های زیر را انتخاب کنید:",
    mainMenuKeyboard()
  );
}

// ------------------------------------------------------------
// Start
// ------------------------------------------------------------

async function handleStart(chatId, userId) {
  clearUserState(userId);
  await getCategories();
  return sendMainMenu(chatId);
}

// ============================================================
// PRODUCT MANAGEMENT
// ============================================================

// ------------------------------------------------------------
// Add Product - Step 1
// ------------------------------------------------------------

async function startAddProduct(chatId, userId) {
  setUserState(userId, { type: "add_product", step: "waiting_photo" });
  return sendMessage(
    chatId,
    "➕ <b>افزودن محصول</b>\n\n📷 لطفاً عکس محصول را ارسال کنید.\n\nنام محصول را در <b>کپشن عکس</b> بنویسید.\n\nمثال:\n<code>کفش اسپرت 

مردانه</code>",
    cancelKeyboard()
  );
}

// ------------------------------------------------------------
// Add Product - Photo
// ------------------------------------------------------------

async function handleProductPhoto(message, chatId, userId) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== "waiting_photo") return 

false;
  if (!message.photo || !message.photo.length) return false;
  const caption = safeText(message.caption || "", 300);
  if (!caption) {
    await sendMessage(chatId, "⚠️ نام محصول در کپشن عکس وارد نشده است.\n\nلطفاً عکس را دوباره همراه با نام محصول در کپشن ارسال کنید.");
    return true;
  }
  const photo = message.photo[message.photo.length - 1];
  setUserState(userId, {
    type: "add_product",
    step: "waiting_category",
    product: {
      id: generateProductId(),
      name: caption,
      telegramFileId: photo.file_id,
      image: "",
      categoryId: "",
      categoryName: "",
      variants: [],
      price: 0,
      discount: { type: "none", value: 0 },
      featured: false,
      bestseller: false,
      isNew: false,
      discounted: false,
      createdAt: nowISO()
    }
  });
  const categories = await getCategories();
  return sendMessage(chatId, "📂 <b>دسته‌بندی محصول را انتخاب کنید:</b>", categoryInlineKeyboard

(categories));
}

// ------------------------------------------------------------
// Category selected
// ------------------------------------------------------------

async function handleAddCategory(chatId, userId, categoryId) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== "waiting_category") return;
  const categories = await getCategories();
  const category = categories.find(item => item.id === categoryId);
  if (!category) {
    await sendMessage(chatId, "⚠️ دسته‌بندی پیدا نشد.");
    return;
  }
  state.product.categoryId = category.id;
  state.product.categoryName = category.name;
  state.product.category = category.name;
  state.step = "waiting_variants_choice";
  setUserState(userId, state);
  return sendMessage(
    chatId,
    "🎨 <b>تنوع محصول دارد؟</b>\n\nمثلاً:\nرنگ: مشکی، سفید\nسایز: 40، 41، 42",
    {
      inline_keyboard: [
        [{ text: "🎨 دارد", callback_data: "variant_yes" }, { text: "➖ ندارد", callback_data: 

"variant_no" }],
        [{ text: "❌ لغو", callback_data: "add_cancel" }]
      ]
    }
  );
}

// ------------------------------------------------------------
// Variant choice
// ------------------------------------------------------------

async function handleVariantChoice(chatId, userId, hasVariants) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== "waiting_variants_choice") 

return;
  if (hasVariants) {
    state.step = "waiting_variant_attributes";
    setUserState(userId, state);
    return sendMessage(
      chatId,
      "🎨 <b>تنوع‌ها را وارد کنید.</b>\n\nهر ویژگی در یک خط:\n\n<code>رنگ: مشکی، سفید</code>\n<code>سایز: 40، 41، 42</code>\n\n

می‌توانید هر نامی برای ویژگی استفاده کنید؛ مثلاً مدل، جنس، ظرفیت، طعم و غیره.",
      cancelKeyboard()
    );
  }
  state.product.variants = [];
  state.step = "waiting_price";
  setUserState(userId, state);
  return sendMessage(chatId, "💰 <b>قیمت اصلی محصول را وارد کنید.</b>\n\nمثال:\n<code>1500000</code>", 

cancelKeyboard());
}

// ------------------------------------------------------------
// Variant attributes
// ------------------------------------------------------------

async function handleVariantAttributes(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== 

"waiting_variant_attributes") return false;
  const attributes = parseVariantAttributes(text);
  if (!attributes.length) {
    await sendMessage(chatId, "⚠️ فرمت تنوع‌ها صحیح نیست.\n\nمثال:\n<code>رنگ: مشکی، سفید</code>\n<code>سایز: 40، 41، 

42</code>");
    return true;
  }
  const combinations = generateCombinations(attributes);
  if (!combinations.length) {
    await sendMessage(chatId, "⚠️ هیچ ترکیب معتبری ایجاد نشد.");
    return true;
  }
  state.variantAttributes = attributes;
  state.variantDrafts = combinations.map((attrs, index) => ({
    tempId: `T${index + 1}`,
    attributes: attrs,
    enabled: true,
    stock: 0
  }));
  state.step = "editing_variant_existence";
  setUserState(userId, state);
  return sendVariantExistenceEditor(chatId, userId);
}

// ------------------------------------------------------------
// Variant existence editor
// ------------------------------------------------------------

async function sendVariantExistenceEditor(chatId, userId) {
  const state = getUserState(userId);
  if (!state) return;
  const variants = state.variantDrafts || [];
  const rows = [];
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    rows.push([{
      text: `${variant.enabled ? "✅" : "❌"} ${formatVariantAttributes(variant.attributes)}`,
      callback_data: `variant_toggle:${i}`
    }]);
  }
  rows.push([{ text: "➡️ ادامه", callback_data: "variant_existence_done" }]);
  rows.push([{ text: "❌ لغو", callback_data: "add_cancel" }]);
  return sendMessage(
    chatId,
    "🎨 <b>ترکیب‌های موجود را مشخص کنید.</b>\n\n✅ یعنی این ترکیب واقعاً وجود دارد.\n❌ یعنی این ترکیب اصلاً وجود ندارد.\n\n<b>نکته مهم:</b>\nموجودی صفر با وجود نداشتن 

ترکیب فرق دارد.\n\nمثلاً اگر «سفید + 42» وجود ندارد، آن را ❌ کنید.\nاگر وجود دارد ولی فعلاً موجودی آن صفر است، آن را ✅ نگه دارید.",
    { inline_keyboard: rows }
  );
}

// ------------------------------------------------------------
// Toggle variant existence
// ------------------------------------------------------------

async function handleVariantToggle(chatId, userId, index) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== 

"editing_variant_existence") return;
  const i = Number(index);
  if (!Number.isInteger(i) || !state.variantDrafts?.[i]) return;
  state.variantDrafts[i].enabled = !state.variantDrafts[i].enabled;
  setUserState(userId, state);
  return sendVariantExistenceEditor(chatId, userId);
}

// ------------------------------------------------------------
// Finish variant existence
// ------------------------------------------------------------

async function finishVariantExistence(chatId, userId) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== 

"editing_variant_existence") return;
  const enabledVariants = (state.variantDrafts || [])
    .filter(v => v.enabled === true)
    .map((variant, index) => ({
      id: generateVariantId(index),
      attributes: variant.attributes,
      stock: 0,
      enabled: true
    }));
  state.product.variants = enabledVariants;
  if (enabledVariants.length === 0) {
    state.step = "waiting_price";
    setUserState(userId, state);
    return sendMessage(chatId, "💰 <b>قیمت اصلی محصول را وارد کنید.</b>", cancelKeyboard());
  }
  state.step = "editing_inventory";
  setUserState(userId, state);
  return sendInventoryEditor(chatId, userId);
}

// ------------------------------------------------------------
// Inventory editor
// ------------------------------------------------------------

async function sendInventoryEditor(chatId, userId) {
  const state = getUserState(userId);
  if (!state) return;
  const variants = state.product.variants || [];
  if (!variants.length) {
    state.step = "waiting_price";
    setUserState(userId, state);
    return sendMessage(chatId, "💰 <b>قیمت اصلی محصول را وارد کنید.</b>", cancelKeyboard());
  }
  const rows = [];
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    rows.push([{
      text: `${formatVariantAttributes(variant.attributes)} | موجودی: ${variant.stock}`,
      callback_data: `stock_edit:${i}`
    }]);
  }
  rows.push([{ text: "➡️ ثبت موجودی", callback_data: "stock_done" }]);
  rows.push([{ text: "❌ لغو", callback_data: "add_cancel" }]);
  return sendMessage(
    chatId,
    "📊 <b>موجودی هر ترکیب را مشخص کنید.</b>\n\nروی هر ترکیب بزنید و با + و - موجودی را تنظیم کنید.\n\nموجودی <b>۰</b> یعنی ترکیب وجود دارد ولی فعلاً موجود نیست.",
    { inline_keyboard: rows }
  );
}

// ------------------------------------------------------------
// Inventory callback
// ------------------------------------------------------------

async function handleStockEdit(chatId, userId, index) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== "editing_inventory") 

return;
  const i = Number(index);
  if (!Number.isInteger(i) || !state.product.variants?.[i]) return;
  const variant = state.product.variants[i];
  return sendMessage(
    chatId,
    `📊 <b>موجودی:</b>\n\n<b>${escapeHtml(formatVariantAttributes(variant.attributes))}</b>\n

\nموجودی فعلی: <b>${variant.stock}</b>`,
    {
      inline_keyboard: [
        [{ text: "➖", callback_data: `stock_change:${i}:-1` }, { text: `${variant.stock}`, 

callback_data: "stock_noop" }, { text: "➕", callback_data: `stock_change:${i}:1` }],
        [{ text: "🔢 ورود مستقیم", callback_data: `stock_direct:${i}` }],
        [{ text: "↩️ بازگشت", callback_data: "stock_back" }]
      ]
    }
  );
}

async function handleStockChange(chatId, userId, index, delta) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== "editing_inventory") 

return;
  const i = Number(index);
  const d = Number(delta);
  if (!Number.isInteger(i) || !Number.isInteger(d) || !state.product.variants?.[i]) 

return;
  state.product.variants[i].stock = Math.max(0, state.product.variants[i].stock + d);
  setUserState(userId, state);
  return handleStockEdit(chatId, userId, i);
}

async function startDirectStock(chatId, userId, index) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== "editing_inventory") 

return;
  state.stockInputIndex = Number(index);
  state.step = "waiting_direct_stock";
  setUserState(userId, state);
  return sendMessage(chatId, "🔢 مقدار موجودی را وارد کنید:", cancelKeyboard());
}

async function handleDirectStockInput(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== "waiting_direct_stock") 

return false;
  const stock = Number(String(text).replace(/,/g, "").trim());
  if (!Number.isInteger(stock) || stock < 0) {
    await sendMessage(chatId, "⚠️ موجودی باید یک عدد صحیح صفر یا بیشتر باشد.");
    return true;
  }
  const index = state.stockInputIndex;
  if (!state.product.variants?.[index]) return true;
  state.product.variants[index].stock = stock;
  delete state.stockInputIndex;
  state.step = "editing_inventory";
  setUserState(userId, state);
  return sendInventoryEditor(chatId, userId);
}

async function finishInventory(chatId, userId) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== "editing_inventory") 

return;
  state.step = "waiting_price";
  setUserState(userId, state);
  return sendMessage(chatId, "💰 <b>قیمت اصلی محصول را وارد کنید.</b>\n\nفقط عدد وارد کنید.\nمثال:

\n<code>1500000</code>", cancelKeyboard());
}

// ------------------------------------------------------------
// Price
// ------------------------------------------------------------

async function handleProductPrice(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== "waiting_price") return 

false;
  const price = Number(String(text).replace(/,/g, "").trim());
  if (!Number.isFinite(price) || price < 0) {
    await sendMessage(chatId, "⚠️ قیمت معتبر نیست.\n\nمثال:\n<code>1500000</code>");
    return true;
  }
  state.product.price = Math.floor(price);
  state.product.discount = { type: "none", value: 0 };
  state.step = "waiting_discount";
  setUserState(userId, state);
  return sendMessage(
    chatId,
    "🏷️ <b>تخفیف محصول</b>\n\nنوع تخفیف را انتخاب کنید:",
    {
      inline_keyboard: [
        [{ text: "➖ بدون تخفیف", callback_data: "discount_none" }],
        [{ text: "٪ درصدی", callback_data: "discount_percent" }, { text: "💰 مبلغ ثابت", 

callback_data: "discount_fixed" }],
        [{ text: "❌ لغو", callback_data: "add_cancel" }]
      ]
    }
  );
}

// ------------------------------------------------------------
// Discount selection
// ------------------------------------------------------------

async function handleProductDiscountChoice(chatId, userId, type) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== "waiting_discount") return;
  if (type === "none") {
    state.product.discount = { type: "none", value: 0 };
    state.product.discounted = false;
    state.step = "waiting_flags";
    setUserState(userId, state);
    return sendFeatureFlagsEditor(chatId, userId);
  }
  state.discountType = type;
  state.step = "waiting_discount_value";
  setUserState(userId, state);
  return sendMessage(
    chatId,
    type === "percent" ? "٪ <b>درصد تخفیف را وارد کنید.</b>\n\nمثال: <code>20</code>" : "💰 <b>مبلغ تخفیف را وارد کنید.</b>

\n\nمثال: <code>200000</code>",
    cancelKeyboard()
  );
}

async function handleProductDiscountValue(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== "waiting_discount_value") 

return false;
  const value = Number(String(text).replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value <= 0) {
    await sendMessage(chatId, "⚠️ مقدار تخفیف معتبر نیست.");
    return true;
  }
  if (state.discountType === "percent" && value > 100) {
    await sendMessage(chatId, "⚠️ درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد.");
    return true;
  }
  if (state.discountType === "fixed" && value > state.product.price) {
    await sendMessage(chatId, "⚠️ مبلغ تخفیف نمی‌تواند بیشتر از قیمت اصلی باشد.");
    return true;
  }
  state.product.discount = { type: state.discountType, value: Math.floor(value) };
  state.product.discounted = true;
  delete state.discountType;
  state.step = "waiting_flags";
  setUserState(userId, state);
  return sendFeatureFlagsEditor(chatId, userId);
}

// ------------------------------------------------------------
// Feature flags editor
// ------------------------------------------------------------

async function sendFeatureFlagsEditor(chatId, userId) {
  const state = getUserState(userId);
  if (!state) return;
  const product = state.product;
  return sendMessage(
    chatId,
    `⭐ <b>ویژگی‌های نمایش محصول</b>\n\nهر کدام مستقل هستند و می‌توان چند مورد را همزمان فعال کرد.\n\n${featureFlagText(product)}`,
    {
      inline_keyboard: [
        [{ text: product.featured ? "☑️ ویژه" : "⬜ ویژه", callback_data: "flag:featured" }, { text: 

product.bestseller ? "☑️ پرفروش" : "⬜ پرفروش", callback_data: "flag:bestseller" }],
        [{ text: product.isNew ? "☑️ جدید" : "⬜ جدید", callback_data: "flag:isNew" }, { text: 

product.discounted ? "☑️ تخفیف‌دار" : "⬜ تخفیف‌دار", callback_data: "flag:discounted" }],
        [{ text: "➡️ ادامه", callback_data: "flags_done" }],
        [{ text: "❌ لغو", callback_data: "add_cancel" }]
      ]
    }
  );
}

async function handleFeatureFlag(chatId, userId, flag) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== "waiting_flags") return;
  const allowedFlags = ["featured", "bestseller", "isNew", "discounted"];
  if (!allowedFlags.includes(flag)) return;
  state.product[flag] = !state.product[flag];
  setUserState(userId, state);
  return sendFeatureFlagsEditor(chatId, userId);
}

// ------------------------------------------------------------
// Product confirmation
// ------------------------------------------------------------

async function sendProductConfirmation(chatId, userId) {
  const state = getUserState(userId);
  if (!state) return;
  const product = state.product;
  const finalPrice = calculateProductPrice(product);
  const variantText = product.variants?.length
    ? product.variants.map(v => `• ${formatVariantAttributes(v.attributes)} → موجودی: 

${v.stock}`).join("\n")
    : "بدون تنوع";
  let discountText = "بدون تخفیف";
  if (product.discount?.type === "percent") discountText = `${product.discount.value}%`;
  if (product.discount?.type === "fixed") discountText = `

${product.discount.value.toLocaleString()} تومان`;
  const flags = [];
  if (product.featured) flags.push("⭐ ویژه");
  if (product.bestseller) flags.push("🔥 پرفروش");
  if (product.isNew) flags.push("🆕 جدید");
  if (product.discounted) flags.push("🏷️ تخفیف‌دار");
  const text = `📋 <b>خلاصه محصول</b>\n\n🆔 ${escapeHtml(product.id)}\n📦 <b>${escapeHtml

(product.name)}</b>\n📂 ${escapeHtml(product.categoryName)}\n\n💰 قیمت اصلی: <b>

${product.price.toLocaleString()}</b>\n🏷️ تخفیف: <b>${escapeHtml(discountText)}</b>\n💵 قیمت نهایی: 

<b>${finalPrice.toLocaleString()}</b>\n\n🎨 <b>تنوع‌ها:</b>\n${variantText}\n\n⭐ <b>ویژگی‌ها:</b>\n

${flags.length ? flags.join(" | ") : "بدون ویژگی"}`;
  state.step = "confirmation";
  setUserState(userId, state);
  return sendMessage(chatId, text, {
    inline_keyboard: [
      [{ text: "✅ ثبت نهایی", callback_data: "product_confirm" }],
      [{ text: "❌ لغو", callback_data: "add_cancel" }]
    ]
  });
}

// ------------------------------------------------------------
// Final product save
// ------------------------------------------------------------

async function finalizeNewProduct(chatId, userId) {
  const state = getUserState(userId);
  if (!state || state.type !== "add_product" || state.step !== "confirmation") return;
  const product = normalizeProduct(state.product);
  try {
    await sendMessage(chatId, "⏳ در حال ثبت محصول...");
    if (state.product.telegramFileId) {
      const imagePath = await uploadTelegramPhotoToGitHub(state.product.telegramFileId, 

product.id);
      product.image = imagePath;
    }
    const products = await getProducts();
    const existingIndex = products.findIndex(item => item.id === product.id);
    if (existingIndex >= 0) {
      products[existingIndex] = product;
    } else {
      products.push(product);
    }
    await saveProducts(products, `Add product ${product.id}`);
    clearUserState(userId);
    await sendMessage(
      chatId,
      `✅ <b>محصول با موفقیت ثبت شد.</b>\n\n📦 ${escapeHtml(product.name)}\n🆔 <code>${escapeHtml

(product.id)}</code>\n📂 ${escapeHtml(product.categoryName)}\n\nمحصول در GitHub ذخیره شد و سایت فعلی می‌تواند آن را از 

products.json بخواند.`,
      mainMenuKeyboard()
    );
  } catch (error) {
    console.error("finalizeNewProduct error:", error);
    await sendMessage(chatId, `❌ خطا در ثبت محصول:\n\n<code>${escapeHtml(error.message)}</code>`);
  }
}

// ------------------------------------------------------------
// Cancel operation
// ------------------------------------------------------------

async function cancelOperation(chatId, userId) {
  clearUserState(userId);
  return sendMessage(chatId, "❌ عملیات لغو شد.", mainMenuKeyboard());
}

// ------------------------------------------------------------
// Product list
// ------------------------------------------------------------

async function sendProductsList(chatId) {
  const products = await getProducts();
  if (!products.length) {
    return sendMessage(chatId, "📦 هنوز محصولی ثبت نشده است.", mainMenuKeyboard());
  }
  const rows = [];
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    rows.push([{ text: `${product.featured ? "⭐ " : ""}${product.name}`, callback_data: 

`product_view:${product.id}` }]);
  }
  rows.push([{ text: "↩️ منوی اصلی", callback_data: "main_menu" }]);
  return sendMessage(chatId, `📦 <b>محصولات</b>\n\nتعداد: ${products.length}`, { inline_keyboard: 

rows });
}

// ------------------------------------------------------------
// Product view
// ------------------------------------------------------------

async function sendProductView(chatId, productId) {
  const product = await findProduct(productId);
  if (!product) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  const finalPrice = calculateProductPrice(product);
  const variants = product.variants?.length
    ? product.variants.map(v => `• ${formatVariantAttributes(v.attributes)} → ${v.stock}

`).join("\n")
    : "بدون تنوع";
  const flags = [];
  if (product.featured) flags.push("⭐ ویژه");
  if (product.bestseller) flags.push("🔥 پرفروش");
  if (product.isNew) flags.push("🆕 جدید");
  if (product.discounted) flags.push("🏷️ تخفیف‌دار");
  return sendMessage(
    chatId,
    `📦 <b>جزئیات محصول</b>\n\n🆔 <code>${escapeHtml(product.id)}</code>\n📦 <b>${escapeHtml

(product.name)}</b>\n📂 ${escapeHtml(product.categoryName)}\n\n💰 قیمت: 

${product.price.toLocaleString()}\n💵 قیمت نهایی: ${finalPrice.toLocaleString()}\n\n🎨 <b>تنوع‌ها:</b>

\n${variants}\n\n⭐ <b>ویژگی‌ها:</b>\n${flags.length ? flags.join(" | ") : "بدون ویژگی"}`,
    {
      inline_keyboard: [
        [{ text: "✏️ ویرایش", callback_data: `product_edit:${product.id}` }],
        [{ text: "📊 مدیریت موجودی", callback_data: `product_stock:${product.id}` }],
        [{ text: "🗑 حذف محصول", callback_data: `product_delete:${product.id}` }],
        [{ text: "↩️ بازگشت", callback_data: "products_list" }]
      ]
    }
  );
}

// ------------------------------------------------------------
// Management main menu
// ------------------------------------------------------------

async function sendManagementMenu(chatId) {
  return sendMessage(
    chatId,
    "⚙️ <b>مدیریت فروشگاه</b>\n\nبخش مورد نظر را انتخاب کنید:",
    {
      inline_keyboard: [
        [{ text: "📦 مدیریت محصولات", callback_data: "products_list" }],
        [{ text: "📂 مدیریت دسته‌بندی‌ها", callback_data: "categories_manage" }],
        [{ text: "⭐ مدیریت محصولات ویژه", callback_data: "featured_manage" }],
        [{ text: "🏷️ مدیریت تخفیف‌ها", callback_data: "discounts_manage" }],
        [{ text: "🛒 مدیریت سفارش‌ها", callback_data: "orders_manage" }],
        [{ text: "↩️ منوی اصلی", callback_data: "main_menu" }]
      ]
    }
  );
}

// ============================================================
// PRODUCT EDITING
// ============================================================

// ------------------------------------------------------------
// Product edit menu
// ------------------------------------------------------------

async function sendProductEditMenu(chatId, productId) {
  const product = await findProduct(productId);
  if (!product) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  return sendMessage(
    chatId,
    `✏️ <b>ویرایش محصول</b>\n\n📦 ${escapeHtml(product.name)}\n\nبخش مورد نظر را انتخاب کنید:`,
    {
      inline_keyboard: [
        [{ text: "📝 نام محصول", callback_data: `edit_name:${productId}` }],
        [{ text: "📂 دسته‌بندی", callback_data: `edit_category:${productId}` }],
        [{ text: "💰 قیمت", callback_data: `edit_price:${productId}` }],
        [{ text: "🏷️ تخفیف", callback_data: `edit_discount:${productId}` }],
        [{ text: "⭐ ویژگی‌ها", callback_data: `edit_flags:${productId}` }],
        [{ text: "🎨 تنوع‌ها", callback_data: `edit_variants:${productId}` }],
        [{ text: "📷 تصویر", callback_data: `edit_image:${productId}` }],
        [{ text: "↩️ بازگشت", callback_data: `product_view:${productId}` }]
      ]
    }
  );
}

// ------------------------------------------------------------
// Edit product name
// ------------------------------------------------------------

async function startEditProductName(chatId, userId, productId) {
  const product = await findProduct(productId);
  if (!product) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  setUserState(userId, { type: "edit_product", step: "waiting_name", productId });
  return sendMessage(chatId, `📝 <b>نام جدید محصول را وارد کنید:</b>\n\nنام فعلی: ${escapeHtml(product.name)}`, 

cancelKeyboard());
}

async function handleEditProductName(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "edit_product" || state.step !== "waiting_name") return 

false;
  const name = safeText(text, 300);
  if (!name) {
    await sendMessage(chatId, "⚠️ نام محصول نمی‌تواند خالی باشد.");
    return true;
  }
  const products = await getProducts();
  const product = products.find(item => item.id === state.productId);
  if (!product) {
    clearUserState(userId);
    await sendMessage(chatId, "❌ محصول پیدا نشد.");
    return true;
  }
  product.name = name;
  product.updatedAt = nowISO();
  await saveProducts(products, `Edit product name ${product.id}`);
  clearUserState(userId);
  return sendProductEditMenu(chatId, product.id);
}

// ------------------------------------------------------------
// Edit product category
// ------------------------------------------------------------

async function startEditProductCategory(chatId, userId, productId) {
  const product = await findProduct(productId);
  if (!product) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  const categories = await getCategories();
  setUserState(userId, { type: "edit_product", step: "waiting_category", productId });
  return sendMessage(chatId, "📂 <b>دسته‌بندی جدید را انتخاب کنید:</b>", categoryInlineKeyboard(categories, 

"edit_category_select:"));
}

async function handleEditProductCategory(chatId, userId, categoryId) {
  const state = getUserState(userId);
  if (!state || state.type !== "edit_product" || state.step !== "waiting_category") 

return;
  const categories = await getCategories();
  const category = categories.find(item => item.id === categoryId);
  if (!category) return sendMessage(chatId, "❌ دسته‌بندی پیدا نشد.");
  const products = await getProducts();
  const product = products.find(item => item.id === state.productId);
  if (!product) {
    clearUserState(userId);
    return sendMessage(chatId, "❌ محصول پیدا نشد.");
  }
  product.categoryId = category.id;
  product.categoryName = category.name;
  product.category = category.name;
  product.updatedAt = nowISO();
  await saveProducts(products, `Change category ${product.id}`);
  clearUserState(userId);
  return sendProductEditMenu(chatId, product.id);
}

// ------------------------------------------------------------
// Edit product price
// ------------------------------------------------------------

async function startEditProductPrice(chatId, userId, productId) {
  const product = await findProduct(productId);
  if (!product) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  setUserState(userId, { type: "edit_product", step: "waiting_price", productId });
  return sendMessage(chatId, `💰 <b>قیمت جدید را وارد کنید:</b>\n\nقیمت فعلی: ${product.price.toLocaleString

()}`, cancelKeyboard());
}

async function handleEditProductPrice(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "edit_product" || state.step !== "waiting_price") return 

false;
  const price = Number(String(text).replace(/,/g, "").trim());
  if (!Number.isFinite(price) || price < 0) {
    await sendMessage(chatId, "⚠️ قیمت معتبر نیست.");
    return true;
  }
  const products = await getProducts();
  const product = products.find(item => item.id === state.productId);
  if (!product) {
    clearUserState(userId);
    return sendMessage(chatId, "❌ محصول پیدا نشد.");
  }
  product.price = Math.floor(price);
  product.updatedAt = nowISO();
  await saveProducts(products, `Change price ${product.id}`);
  clearUserState(userId);
  return sendProductEditMenu(chatId, product.id);
}

// ------------------------------------------------------------
// Edit product discount
// ------------------------------------------------------------

async function startEditProductDiscount(chatId, userId, productId) {
  const product = await findProduct(productId);
  if (!product) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  setUserState(userId, { type: "edit_product", step: "waiting_discount_type", productId 

});
  return sendMessage(
    chatId,
    "🏷️ <b>تخفیف محصول</b>",
    {
      inline_keyboard: [
        [{ text: "➖ بدون تخفیف", callback_data: `edit_discount_type:${productId}:none` }],
        [{ text: "٪ درصدی", callback_data: `edit_discount_type:${productId}:percent` }, { 

text: "💰 مبلغ ثابت", callback_data: `edit_discount_type:${productId}:fixed` }],
        [{ text: "↩️ بازگشت", callback_data: `product_edit:${productId}` }]
      ]
    }
  );
}

async function handleEditDiscountType(chatId, userId, productId, type) {
  const state = getUserState(userId);
  if (!state || state.type !== "edit_product") return;
  if (type === "none") {
    const products = await getProducts();
    const product = products.find(item => item.id === productId);
    if (!product) {
      clearUserState(userId);
      return sendMessage(chatId, "❌ محصول پیدا نشد.");
    }
    product.discount = { type: "none", value: 0 };
    product.discounted = false;
    product.updatedAt = nowISO();
    await saveProducts(products, `Remove discount ${product.id}`);
    clearUserState(userId);
    return sendProductEditMenu(chatId, product.id);
  }
  state.step = "waiting_discount_value";
  state.discountType = type;
  state.productId = productId;
  setUserState(userId, state);
  return sendMessage(chatId, type === "percent" ? "٪ مقدار درصد تخفیف را وارد کنید:" : "💰 مبلغ تخفیف را وارد کنید:", 

cancelKeyboard());
}

async function handleEditDiscountValue(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "edit_product" || state.step !== "waiting_discount_value") 

return false;
  const value = Number(String(text).replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value <= 0) {
    await sendMessage(chatId, "⚠️ مقدار تخفیف معتبر نیست.");
    return true;
  }
  const products = await getProducts();
  const product = products.find(item => item.id === state.productId);
  if (!product) {
    clearUserState(userId);
    return sendMessage(chatId, "❌ محصول پیدا نشد.");
  }
  if (state.discountType === "percent" && value > 100) {
    await sendMessage(chatId, "⚠️ درصد نمی‌تواند بیشتر از ۱۰۰ باشد.");
    return true;
  }
  if (state.discountType === "fixed" && value > product.price) {
    await sendMessage(chatId, "⚠️ مبلغ تخفیف نمی‌تواند بیشتر از قیمت محصول باشد.");
    return true;
  }
  product.discount = { type: state.discountType, value: Math.floor(value) };
  product.discounted = true;
  product.updatedAt = nowISO();
  await saveProducts(products, `Edit discount ${product.id}`);
  clearUserState(userId);
  return sendProductEditMenu(chatId, product.id);
}

// ------------------------------------------------------------
// Product feature flags
// ------------------------------------------------------------

async function sendProductFeatureEditor(chatId, userId, productId) {
  const product = await findProduct(productId);
  if (!product) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  setUserState(userId, { type: "edit_flags", step: "editing", productId });
  return sendMessage(
    chatId,
    `⭐ <b>ویژگی‌های محصول</b>\n\nهر ویژگی مستقل است و می‌توانید چند ویژگی را همزمان فعال کنید.\n\n${featureFlagText(product)}`,
    {
      inline_keyboard: [
        [{ text: product.featured ? "☑️ ویژه" : "⬜ ویژه", callback_data: `existing_flag:

${productId}:featured` }, { text: product.bestseller ? "☑️ پرفروش" : "⬜ پرفروش", callback_data: 

`existing_flag:${productId}:bestseller` }],
        [{ text: product.isNew ? "☑️ جدید" : "⬜ جدید", callback_data: `existing_flag:

${productId}:isNew` }, { text: product.discounted ? "☑️ تخفیف‌دار" : "⬜ تخفیف‌دار", callback_data: 

`existing_flag:${productId}:discounted` }],
        [{ text: "💾 ذخیره", callback_data: `existing_flags_done:${productId}` }],
        [{ text: "↩️ بازگشت", callback_data: `product_edit:${productId}` }]
      ]
    }
  );
}

async function handleExistingFeatureFlag(chatId, userId, productId, flag) {
  const allowed = ["featured", "bestseller", "isNew", "discounted"];
  if (!allowed.includes(flag)) return;
  const products = await getProducts();
  const product = products.find(item => item.id === productId);
  if (!product) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  product[flag] = !product[flag];
  product.updatedAt = nowISO();
  await saveProducts(products, `Change product flag ${product.id}`);
  return sendProductFeatureEditor(chatId, userId, productId);
}

// ------------------------------------------------------------
// Variant editing
// ------------------------------------------------------------

async function startEditProductVariants(chatId, userId, productId) {
  const product = await findProduct(productId);
  if (!product) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  setUserState(userId, { type: "edit_variants", step: "waiting_attributes", productId });
  return sendMessage(
    chatId,
    "🎨 <b>ویرایش تنوع‌ها</b>\n\nساختار جدید را وارد کنید.\n\nمثال:\n<code>رنگ: مشکی، سفید</code>\n<code>سایز: 40، 41، 42</code>\n\n

توجه: با این کار ترکیب‌های تنوع دوباره ساخته می‌شوند.",
    cancelKeyboard()
  );
}

async function handleEditVariantAttributes(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "edit_variants" || state.step !== "waiting_attributes") 

return false;
  const attributes = parseVariantAttributes(text);
  if (!attributes.length) {
    await sendMessage(chatId, "⚠️ ساختار تنوع صحیح نیست.\n\nمثال:\n<code>رنگ: مشکی، سفید</code>\n<code>سایز: 40، 41، 

42</code>");
    return true;
  }
  const combinations = generateCombinations(attributes);
  if (!combinations.length) {
    await sendMessage(chatId, "⚠️ ترکیبی ایجاد نشد.");
    return true;
  }
  const products = await getProducts();
  const product = products.find(item => item.id === state.productId);
  if (!product) {
    clearUserState(userId);
    await sendMessage(chatId, "❌ محصول پیدا نشد.");
    return true;
  }
  const oldVariants = product.variants || [];
  const oldMap = new Map();
  for (const variant of oldVariants) {
    oldMap.set(variantKey(variant.attributes), variant);
  }
  const drafts = combinations.map((attrs, index) => {
    const key = variantKey(attrs);
    const old = oldMap.get(key);
    return {
      tempId: `T${index + 1}`,
      attributes: attrs,
      enabled: true,
      stock: old ? Math.max(0, Math.floor(toNumber(old.stock, 0))) : 0
    };
  });
  state.variantAttributes = attributes;
  state.variantDrafts = drafts;
  state.step = "editing_existence";
  setUserState(userId, state);
  return sendExistingVariantExistenceEditor(chatId, userId);
}

async function sendExistingVariantExistenceEditor(chatId, userId) {
  const state = getUserState(userId);
  if (!state) return;
  const variants = state.variantDrafts || [];
  const rows = [];
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    rows.push([{
      text: `${variant.enabled ? "✅" : "❌"} ${formatVariantAttributes(variant.attributes)} | 

موجودی: ${variant.stock}`,
      callback_data: `edit_variant_toggle:${i}`
    }]);
  }
  rows.push([{ text: "➡️ ادامه", callback_data: "edit_variants_existence_done" }]);
  rows.push([{ text: "❌ لغو", callback_data: "edit_variants_cancel" }]);
  return sendMessage(
    chatId,
    "🎨 <b>ترکیب‌های موجود</b>\n\n✅ = ترکیب واقعاً وجود دارد\n❌ = این ترکیب اصلاً وجود ندارد\n\nموجودی صفر به معنی حذف ترکیب نیست.",
    { inline_keyboard: rows }
  );
}

async function handleEditVariantToggle(chatId, userId, index) {
  const state = getUserState(userId);
  if (!state || state.type !== "edit_variants" || state.step !== "editing_existence") 

return;
  const i = Number(index);
  if (!Number.isInteger(i) || !state.variantDrafts?.[i]) return;
  state.variantDrafts[i].enabled = !state.variantDrafts[i].enabled;
  setUserState(userId, state);
  return sendExistingVariantExistenceEditor(chatId, userId);
}

async function finishEditVariants(chatId, userId) {
  const state = getUserState(userId);
  if (!state || state.type !== "edit_variants" || state.step !== "editing_existence") 

return;
  const products = await getProducts();
  const product = products.find(item => item.id === state.productId);
  if (!product) {
    clearUserState(userId);
    return sendMessage(chatId, "❌ محصول پیدا نشد.");
  }
  const enabled = (state.variantDrafts || [])
    .filter(item => item.enabled === true)
    .map((item, index) => ({
      id: generateVariantId(index),
      attributes: item.attributes,
      stock: Math.max(0, Math.floor(toNumber(item.stock, 0))),
      enabled: true
    }));
  product.variants = enabled;
  product.updatedAt = nowISO();
  await saveProducts(products, `Edit variants ${product.id}`);
  clearUserState(userId);
  return sendProductEditMenu(chatId, product.id);
}

// ------------------------------------------------------------
// Image editing
// ------------------------------------------------------------

async function startEditProductImage(chatId, userId, productId) {
  const product = await findProduct(productId);
  if (!product) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  setUserState(userId, { type: "edit_image", step: "waiting_photo", productId });
  return sendMessage(chatId, "📷 عکس جدید محصول را ارسال کنید.", cancelKeyboard());
}

async function handleEditProductPhoto(message, chatId, userId) {
  const state = getUserState(userId);
  if (!state || state.type !== "edit_image" || state.step !== "waiting_photo") return 

false;
  if (!message.photo || !message.photo.length) return false;
  const photo = message.photo[message.photo.length - 1];
  try {
    await sendMessage(chatId, "⏳ در حال آپلود تصویر جدید...");
    const imagePath = await uploadTelegramPhotoToGitHub(photo.file_id, state.productId);
    const products = await getProducts();
    const product = products.find(item => item.id === state.productId);
    if (!product) {
      clearUserState(userId);
      return sendMessage(chatId, "❌ محصول پیدا نشد.");
    }
    product.image = imagePath;
    product.updatedAt = nowISO();
    await saveProducts(products, `Change image ${product.id}`);
    clearUserState(userId);
    return sendProductEditMenu(chatId, product.id);
  } catch (error) {
    console.error("handleEditProductPhoto:", error);
    return sendMessage(chatId, `❌ خطا در تغییر تصویر:\n\n<code>${escapeHtml(error.message)}</code>`);
  }
}

// ------------------------------------------------------------
// Delete product
// ------------------------------------------------------------

async function confirmDeleteProduct(chatId, productId) {
  const product = await findProduct(productId);
  if (!product) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  return sendMessage(
    chatId,
    `⚠️ <b>حذف محصول</b>\n\nآیا مطمئن هستید که می‌خواهید «${escapeHtml(product.name)}» حذف شود؟\n\nاین عملیات اطلاعات محصول را از 

products.json حذف می‌کند.`,
    {
      inline_keyboard: [
        [{ text: "🗑 بله، حذف شود", callback_data: `product_delete_confirm:${productId}` }],
        [{ text: "❌ انصراف", callback_data: `product_view:${productId}` }]
      ]
    }
  );
}

async function deleteProduct(chatId, productId) {
  const products = await getProducts();
  const index = products.findIndex(item => item.id === productId);
  if (index === -1) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  const deleted = products[index];
  products.splice(index, 1);
  await saveProducts(products, `Delete product ${productId}`);
  return sendMessage(
    chatId,
    `🗑 <b>محصول حذف شد.</b>\n\n📦 ${escapeHtml(deleted.name)}`,
    {
      inline_keyboard: [
        [{ text: "📦 مدیریت محصولات", callback_data: "products_list" }],
        [{ text: "↩️ مدیریت", callback_data: "management_menu" }]
      ]
    }
  );
}

// ------------------------------------------------------------
// Stock management for existing products
// ------------------------------------------------------------

async function sendExistingProductStockEditor(chatId, userId, productId) {
  const products = await getProducts();
  const product = products.find(item => item.id === productId);
  if (!product) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  const variants = product.variants || [];
  if (!variants.length) {
    return sendMessage(
      chatId,
      "📊 این محصول تنوع ندارد.\n\nبرای مدیریت موجودی، ابتدا باید برای محصول تنوع تعریف شود.",
      {
        inline_keyboard: [
          [{ text: "✏️ ویرایش محصول", callback_data: `product_edit:${product.id}` }],
          [{ text: "↩️ بازگشت", callback_data: `product_view:${product.id}` }]
        ]
      }
    );
  }
  setUserState(userId, { type: "existing_stock", step: "editing", productId });
  const rows = [];
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    rows.push([{
      text: `${formatVariantAttributes(variant.attributes)} | موجودی: ${variant.stock}`,
      callback_data: `existing_stock_edit:${productId}:${i}`
    }]);
  }
  rows.push([{ text: "↩️ بازگشت", callback_data: `product_view:${productId}` }]);
  return sendMessage(
    chatId,
    `📊 <b>مدیریت موجودی</b>\n\n📦 ${escapeHtml(product.name)}\n\nهر ترکیب را جداگانه مدیریت کنید.`,
    { inline_keyboard: rows }
  );
}

async function sendExistingStockItemEditor(chatId, userId, productId, index) {
  const products = await getProducts();
  const product = products.find(item => item.id === productId);
  if (!product) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  const variant = product.variants?.[index];
  if (!variant) return sendMessage(chatId, "❌ تنوع پیدا نشد.");
  setUserState(userId, { type: "existing_stock", step: "editing_item", productId, index 

});
  return sendMessage(
    chatId,
    `📊 <b>مدیریت موجودی</b>\n\n<b>${escapeHtml(formatVariantAttributes(variant.attributes))}</b>

\n\nموجودی فعلی: <b>${variant.stock}</b>`,
    {
      inline_keyboard: [
        [{ text: "➖", callback_data: `existing_stock_change:${productId}:${index}:-1` }, { 

text: `${variant.stock}`, callback_data: "stock_noop" }, { text: "➕", callback_data: 

`existing_stock_change:${productId}:${index}:1` }],
        [{ text: "🔢 ورود مستقیم", callback_data: `existing_stock_direct:${productId}:${index}` 

}],
        [{ text: "↩️ بازگشت", callback_data: `product_stock:${productId}` }]
      ]
    }
  );
}

async function handleExistingStockChange(chatId, userId, productId, index, delta) {
  const products = await getProducts();
  const product = products.find(item => item.id === productId);
  if (!product) return sendMessage(chatId, "❌ محصول پیدا نشد.");
  const variant = product.variants?.[index];
  if (!variant) return sendMessage(chatId, "❌ تنوع پیدا نشد.");
  const d = Number(delta);
  if (!Number.isInteger(d)) return;
  variant.stock = Math.max(0, Math.floor(toNumber(variant.stock, 0) + d));
  product.updatedAt = nowISO();
  await saveProducts(products, `Update stock ${productId}`);
  return sendExistingStockItemEditor(chatId, userId, productId, index);
}

async function startExistingStockDirect(chatId, userId, productId, index) {
  setUserState(userId, { type: "existing_stock", step: "waiting_direct", productId, index 

});
  return sendMessage(chatId, "🔢 مقدار جدید موجودی را وارد کنید:\n\nعدد صحیح صفر یا بیشتر.", cancelKeyboard());
}

async function handleExistingStockDirectInput(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "existing_stock" || state.step !== "waiting_direct") return 

false;
  const stock = Number(String(text).replace(/,/g, "").trim());
  if (!Number.isInteger(stock) || stock < 0) {
    await sendMessage(chatId, "⚠️ موجودی باید عدد صحیح صفر یا بیشتر باشد.");
    return true;
  }
  const products = await getProducts();
  const product = products.find(item => item.id === state.productId);
  if (!product) {
    clearUserState(userId);
    await sendMessage(chatId, "❌ محصول پیدا نشد.");
    return true;
  }
  const variant = product.variants?.[state.index];
  if (!variant) {
    clearUserState(userId);
    await sendMessage(chatId, "❌ تنوع پیدا نشد.");
    return true;
  }
  variant.stock = stock;
  product.updatedAt = nowISO();
  await saveProducts(products, `Set stock ${product.id}`);
  return sendExistingProductStockEditor(chatId, userId, product.id);
}

// ============================================================
// CATEGORY MANAGEMENT
// ============================================================

async function sendCategoryManagement(chatId) {
  const categories = await getCategories();
  const rows = categories.map(category => [
    { text: `${category.emoji} ${category.name}`, callback_data: `category_view:

${category.id}` }
  ]);
  rows.push([{ text: "➕ افزودن دسته‌بندی", callback_data: "category_add" }]);
  rows.push([{ text: "↩️ مدیریت", callback_data: "management_menu" }]);
  return sendMessage(
    chatId,
    "📂 <b>مدیریت دسته‌بندی‌ها</b>\n\nیک دسته‌بندی را انتخاب کنید یا دسته جدید بسازید.",
    { inline_keyboard: rows }
  );
}

async function sendCategoryView(chatId, categoryId) {
  const categories = await getCategories();
  const category = categories.find(item => item.id === categoryId);
  if (!category) return sendMessage(chatId, "❌ دسته‌بندی پیدا نشد.");
  const products = await getProducts();
  const productCount = products.filter(p => p.categoryId === category.id || p.category === 

category.name).length;
  return sendMessage(
    chatId,
    `${category.emoji} <b>${escapeHtml(category.name)}</b>\n\n🆔 ${escapeHtml

(category.id)}\n📦 تعداد محصولات: ${productCount}\nوضعیت: ${category.active ? "فعال" : "غیرفعال"}`,
    {
      inline_keyboard: [
        [{ text: "✏️ ویرایش", callback_data: `category_edit:${category.id}` }],
        [{ text: category.active ? "⏸ غیرفعال کردن" : "▶️ فعال کردن", callback_data: `category_toggle:

${category.id}` }],
        [{ text: "🗑 حذف", callback_data: `category_delete:${category.id}` }],
        [{ text: "↩️ بازگشت", callback_data: "categories_manage" }]
      ]
    }
  );
}

async function startAddCategory(chatId, userId) {
  setUserState(userId, { type: "category", step: "waiting_name" });
  return sendMessage(
    chatId,
    "➕ <b>افزودن دسته‌بندی</b>\n\nنام دسته‌بندی را وارد کنید.\n\nمثال:\n<code>لوازم ورزشی</code>",
    cancelKeyboard()
  );
}

async function handleAddCategoryName(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "category" || state.step !== "waiting_name") return false;
  const name = safeText(text, 150);
  if (!name) {
    await sendMessage(chatId, "⚠️ نام دسته‌بندی نمی‌تواند خالی باشد.");
    return true;
  }
  const categories = await getCategories();
  const duplicate = categories.some(c => c.name === name);
  if (duplicate) {
    await sendMessage(chatId, "⚠️ این دسته‌بندی قبلاً وجود دارد.");
    return true;
  }
  state.categoryName = name;
  state.step = "waiting_emoji";
  setUserState(userId, state);
  return sendMessage(
    chatId,
    "🔹 یک ایموجی برای دسته‌بندی وارد کنید.\n\nمثال: <code>🏋️</code>\n\nاگر نمی‌خواهید ایموجی خاصی باشد، بنویسید:\n<code>-</code>",
    cancelKeyboard()
  );
}

async function handleAddCategoryEmoji(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "category" || state.step !== "waiting_emoji") return false;
  const emoji = text === "-" ? "📂" : safeText(text, 20);
  const categories = await getCategories();
  const id = createSlug(state.categoryName);
  let finalId = id || `cat-${Date.now()}`;
  let counter = 2;
  while (categories.some(c => c.id === finalId)) {
    finalId = `${id}-${counter}`;
    counter++;
  }
  categories.push({ id: finalId, name: state.categoryName, emoji, active: true, createdAt: 

nowISO() });
  await saveCategories(categories, `Add category ${finalId}`);
  clearUserState(userId);
  return sendMessage(
    chatId,
    `✅ <b>دسته‌بندی اضافه شد.</b>\n\n${emoji} ${escapeHtml(state.categoryName)}`,
    mainMenuKeyboard()
  );
}

async function startEditCategory(chatId, userId, categoryId) {
  const categories = await getCategories();
  const category = categories.find(item => item.id === categoryId);
  if (!category) return sendMessage(chatId, "❌ دسته‌بندی پیدا نشد.");
  setUserState(userId, { type: "edit_category", step: "waiting_name", categoryId });
  return sendMessage(chatId, `✏️ <b>نام جدید دسته‌بندی را وارد کنید:</b>\n\nنام فعلی: ${escapeHtml(category.name)}`, 

cancelKeyboard());
}

async function handleEditCategoryName(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "edit_category" || state.step !== "waiting_name") return 

false;
  const name = safeText(text, 150);
  if (!name) {
    await sendMessage(chatId, "⚠️ نام دسته‌بندی معتبر نیست.");
    return true;
  }
  const categories = await getCategories();
  const category = categories.find(item => item.id === state.categoryId);
  if (!category) {
    clearUserState(userId);
    return sendMessage(chatId, "❌ دسته‌بندی پیدا نشد.");
  }
  const duplicate = categories.some(item => item.id !== state.categoryId && item.name === 

name);
  if (duplicate) {
    await sendMessage(chatId, "⚠️ دسته‌بندی دیگری با این نام وجود دارد.");
    return true;
  }
  const oldName = category.name;
  category.name = name;
  const products = await getProducts();
  for (const product of products) {
    if (product.categoryId === category.id || product.category === oldName) {
      product.categoryId = category.id;
      product.categoryName = name;
      product.category = name;
      product.updatedAt = nowISO();
    }
  }
  await saveCategories(categories, `Rename category ${category.id}`);
  await saveProducts(products, `Update category products ${category.id}`);
  clearUserState(userId);
  return sendCategoryView(chatId, category.id);
}

async function toggleCategory(chatId, categoryId) {
  const categories = await getCategories();
  const category = categories.find(item => item.id === categoryId);
  if (!category) return sendMessage(chatId, "❌ دسته‌بندی پیدا نشد.");
  category.active = !category.active;
  await saveCategories(categories, `Toggle category ${category.id}`);
  return sendCategoryView(chatId, category.id);
}

async function confirmDeleteCategory(chatId, categoryId) {
  const categories = await getCategories();
  const category = categories.find(item => item.id === categoryId);
  if (!category) return sendMessage(chatId, "❌ دسته‌بندی پیدا نشد.");
  const products = await getProducts();
  const used = products.some(p => p.categoryId === category.id || p.category === 

category.name);
  if (used) {
    return sendMessage(
      chatId,
      `⚠️ <b>امکان حذف این دسته‌بندی وجود ندارد.</b>\n\n📂 ${escapeHtml(category.name)}\n\nحداقل یک محصول هنوز به این دسته‌بندی متصل است.

\n\nابتدا محصولات را به دسته دیگری منتقل کنید.`,
      {
        inline_keyboard: [
          [{ text: "📦 مشاهده محصولات", callback_data: "products_list" }],
          [{ text: "↩️ بازگشت", callback_data: `category_view:${category.id}` }]
        ]
      }
    );
  }
  return sendMessage(
    chatId,
    "⚠️ آیا از حذف این دسته‌بندی مطمئن هستید؟",
    {
      inline_keyboard: [
        [{ text: "🗑 بله، حذف شود", callback_data: `category_delete_confirm:${category.id}` }],
        [{ text: "❌ انصراف", callback_data: `category_view:${category.id}` }]
      ]
    }
  );
}

async function deleteCategory(chatId, categoryId) {
  const categories = await getCategories();
  const index = categories.findIndex(c => c.id === categoryId);
  if (index === -1) return sendMessage(chatId, "❌ دسته‌بندی پیدا نشد.");
  const products = await getProducts();
  const used = products.some(p => p.categoryId === categoryId || p.category === 

categories[index].name);
  if (used) return sendMessage(chatId, "⚠️ این دسته‌بندی هنوز توسط محصولات استفاده می‌شود و حذف نشد.");
  const deleted = categories[index];
  categories.splice(index, 1);
  await saveCategories(categories, `Delete category ${categoryId}`);
  return sendMessage(
    chatId,
    `🗑 <b>دسته‌بندی حذف شد.</b>\n\n${deleted.emoji} ${escapeHtml(deleted.name)}`,
    {
      inline_keyboard: [
        [{ text: "📂 مدیریت دسته‌بندی‌ها", callback_data: "categories_manage" }],
        [{ text: "↩️ مدیریت", callback_data: "management_menu" }]
      ]
    }
  );
}

// ============================================================
// FEATURED / FLAG MANAGEMENT
// ============================================================

async function sendFeaturedManagement(chatId) {
  const products = await getProducts();
  const featuredCount = products.filter(p => p.featured).length;
  const bestsellerCount = products.filter(p => p.bestseller).length;
  const newCount = products.filter(p => p.isNew).length;
  const discountedCount = products.filter(p => p.discounted).length;
  return sendMessage(
    chatId,
    `⭐ <b>مدیریت محصولات ویژه</b>\n\n⭐ ویژه: ${featuredCount}\n🔥 پرفروش: ${bestsellerCount}\n🆕 جدید: 

${newCount}\n🏷️ تخفیف‌دار: ${discountedCount}\n\nنوع ویژگی را انتخاب کنید:`,
    {
      inline_keyboard: [
        [{ text: "⭐ ویژه", callback_data: "featured_list:featured" }],
        [{ text: "🔥 پرفروش", callback_data: "featured_list:bestseller" }],
        [{ text: "🆕 جدید", callback_data: "featured_list:isNew" }],
        [{ text: "🏷️ تخفیف‌دار", callback_data: "featured_list:discounted" }],
        [{ text: "📋 همه محصولات", callback_data: "featured_list:all" }],
        [{ text: "↩️ مدیریت", callback_data: "management_menu" }]
      ]
    }
  );
}

async function sendFeaturedList(chatId, flag) {
  const products = await getProducts();
  let filtered = products;
  if (flag !== "all") {
    filtered = products.filter(product => product[flag] === true);
  }
  if (!filtered.length) {
    return sendMessage(
      chatId,
      "📭 محصولی در این بخش وجود ندارد.",
      { inline_keyboard: [[{ text: "↩️ ویژگی‌ها", callback_data: "featured_manage" }]] }
    );
  }
  const rows = filtered.map(product => [
    { text: `${product[flag] ? "☑️" : "⬜"} ${product.name}`, callback_data: 

`product_feature_edit:${product.id}` }
  ]);
  rows.push([{ text: "↩️ ویژگی‌ها", callback_data: "featured_manage" }]);
  return sendMessage(chatId, `⭐ <b>لیست محصولات</b>\n\nتعداد: ${filtered.length}`, { 

inline_keyboard: rows });
}

// ============================================================
// DISCOUNT MANAGEMENT
// ============================================================

async function sendDiscountManagement(chatId) {
  const discounts = await getDiscounts();
  return sendMessage(
    chatId,
    `🏷️ <b>مدیریت تخفیف‌ها</b>\n\nتعداد تخفیف‌ها: ${discounts.length}`,
    {
      inline_keyboard: [
        [{ text: "➕ تخفیف محصول", callback_data: "discount_add:product" }],
        [{ text: "➕ تخفیف دسته‌بندی", callback_data: "discount_add:category" }],
        [{ text: "➕ تخفیف کل فروشگاه", callback_data: "discount_add:global" }],
        [{ text: "📋 لیست تخفیف‌ها", callback_data: "discount_list" }],
        [{ text: "↩️ مدیریت", callback_data: "management_menu" }]
      ]
    }
  );
}

async function startDiscountCreation(chatId, userId, scope) {
  setUserState(userId, { type: "discount", step: "waiting_name", scope });
  return sendMessage(
    chatId,
    `🏷️ <b>ایجاد تخفیف جدید</b>\n\nنام تخفیف یا کمپین را وارد کنید.\n\nمثال:\n<code>تخفیف تابستانه</code>`,
    cancelKeyboard()
  );
}

async function handleDiscountName(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "discount" || state.step !== "waiting_name") return false;
  const name = safeText(text, 200);
  if (!name) {
    await sendMessage(chatId, "⚠️ نام تخفیف نمی‌تواند خالی باشد.");
    return true;
  }
  state.name = name;
  if (state.scope === "product") {
    const products = await getProducts();
    if (!products.length) {
      clearUserState(userId);
      return sendMessage(chatId, "📦 محصولی برای اعمال تخفیف وجود ندارد.");
    }
    state.step = "waiting_product";
    setUserState(userId, state);
    const rows = products.map(product => [{ text: product.name, callback_data: 

`discount_target_product:${product.id}` }]);
    rows.push([{ text: "❌ لغو", callback_data: "discount_cancel" }]);
    return sendMessage(chatId, "📦 محصول مورد نظر را انتخاب کنید:", { inline_keyboard: rows });
  }
  if (state.scope === "category") {
    const categories = await getCategories();
    state.step = "waiting_category";
    setUserState(userId, state);
    return sendMessage(chatId, "📂 دسته‌بندی مورد نظر را انتخاب کنید:", categoryInlineKeyboard(categories, 

"discount_target_category:"));
  }
  state.targetId = "";
  state.step = "waiting_type";
  setUserState(userId, state);
  return sendDiscountTypeMenu(chatId);
}

async function sendDiscountTypeMenu(chatId) {
  return sendMessage(
    chatId,
    "🏷️ نوع تخفیف را انتخاب کنید:",
    {
      inline_keyboard: [
        [{ text: "٪ درصدی", callback_data: "discount_type:percent" }, { text: "💰 مبلغ ثابت", 

callback_data: "discount_type:fixed" }],
        [{ text: "❌ لغو", callback_data: "discount_cancel" }]
      ]
    }
  );
}

async function handleDiscountTarget(chatId, userId, targetId) {
  const state = getUserState(userId);
  if (!state || state.type !== "discount") return;
  state.targetId = targetId;
  state.step = "waiting_type";
  setUserState(userId, state);
  return sendDiscountTypeMenu(chatId);
}

async function handleDiscountType(chatId, userId, type) {
  const state = getUserState(userId);
  if (!state || state.type !== "discount" || state.step !== "waiting_type") return;
  if (!["percent", "fixed"].includes(type)) return;
  state.discountType = type;
  state.step = "waiting_value";
  setUserState(userId, state);
  return sendMessage(
    chatId,
    type === "percent" ? "٪ مقدار درصد تخفیف را وارد کنید:" : "💰 مبلغ تخفیف را وارد کنید:",
    cancelKeyboard()
  );
}

async function handleDiscountValue(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "discount" || state.step !== "waiting_value") return false;
  const value = Number(String(text).replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value <= 0) {
    await sendMessage(chatId, "⚠️ مقدار تخفیف معتبر نیست.");
    return true;
  }
  if (state.discountType === "percent" && value > 100) {
    await sendMessage(chatId, "⚠️ درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد.");
    return true;
  }
  state.value = Math.floor(value);
  state.step = "waiting_min_quantity";
  setUserState(userId, state);
  return sendMessage(
    chatId,
    "🛒 <b>حداقل تعداد خرید</b>\n\nبرای تخفیف عادی عدد 1 را وارد کنید.\n\nمثلاً برای «خرید 3 عدد → تخفیف» عدد 3 را وارد کنید.",
    cancelKeyboard()
  );
}

async function handleDiscountMinQuantity(chatId, userId, text) {
  const state = getUserState(userId);
  if (!state || state.type !== "discount" || state.step !== "waiting_min_quantity") return 

false;
  const quantity = Number(String(text).replace(/,/g, "").trim());
  if (!Number.isInteger(quantity) || quantity < 1) {
    await sendMessage(chatId, "⚠️ تعداد باید عدد صحیح حداقل 1 باشد.");
    return true;
  }
  const discounts = await getDiscounts();
  const discount = normalizeDiscount({
    id: `D${Date.now()}${Math.floor(Math.random() * 100)}`,
    name: state.name,
    type: state.discountType,
    value: state.value,
    scope: state.scope,
    targetId: state.targetId || "",
    minQuantity: quantity,
    enabled: true,
    createdAt: nowISO(),
    updatedAt: nowISO()
  });
  discounts.push(discount);
  await saveDiscounts(discounts, `Add discount ${discount.id}`);
  clearUserState(userId);
  return sendMessage(
    chatId,
    `✅ <b>تخفیف با موفقیت ایجاد شد.</b>\n\n🏷️ ${escapeHtml(discount.name)}\nنوع: ${discount.type === 

"percent" ? "درصدی" : "مبلغ ثابت"}\nمقدار: ${discount.value.toLocaleString()}\nحداقل خرید: 

${discount.minQuantity}`,
    {
      inline_keyboard: [
        [{ text: "🏷️ مدیریت تخفیف‌ها", callback_data: "discounts_manage" }],
        [{ text: "↩️ مدیریت", callback_data: "management_menu" }]
      ]
    }
  );
}

async function sendDiscountList(chatId) {
  const discounts = await getDiscounts();
  if (!discounts.length) {
    return sendMessage(
      chatId,
      "📭 هنوز تخفیفی ثبت نشده است.",
      {
        inline_keyboard: [
          [{ text: "➕ ایجاد تخفیف", callback_data: "discount_add:product" }],
          [{ text: "↩️ مدیریت", callback_data: "management_menu" }]
        ]
      }
    );
  }
  const rows = discounts.map(discount => [
    { text: `${discount.enabled ? "🟢" : "⚪"} ${discount.name}`, callback_data: 

`discount_view:${discount.id}` }
  ]);
  rows.push([{ text: "↩️ تخفیف‌ها", callback_data: "discounts_manage" }]);
  return sendMessage(chatId, `🏷️ <b>لیست تخفیف‌ها</b>\n\nتعداد: ${discounts.length}`, { 

inline_keyboard: rows });
}

async function sendDiscountView(chatId, discountId) {
  const discounts = await getDiscounts();
  const discount = discounts.find(item => item.id === discountId);
  if (!discount) return sendMessage(chatId, "❌ تخفیف پیدا نشد.");
  let scopeText = "کل فروشگاه";
  if (discount.scope === "product") {
    const product = await findProduct(discount.targetId);
    scopeText = product ? `محصول: ${product.name}` : `محصول: ${discount.targetId}`;
  }
  if (discount.scope === "category") {
    const categories = await getCategories();
    const category = categories.find(item => item.id === discount.targetId);
    scopeText = category ? `دسته‌بندی: ${category.name}` : `دسته‌بندی: ${discount.targetId}`;
  }
  return sendMessage(
    chatId,
    `🏷️ <b>جزئیات تخفیف</b>\n\nنام: ${escapeHtml(discount.name)}\nمحدوده: ${escapeHtml(scopeText)}\nنوع: 

${discount.type === "percent" ? "درصدی" : "مبلغ ثابت"}\nمقدار: ${discount.value.toLocaleString()}\nحداقل خرید: 

${discount.minQuantity}\nوضعیت: ${discount.enabled ? "فعال" : "غیرفعال"}`,
    {
      inline_keyboard: [
        [{ text: discount.enabled ? "⏸ غیرفعال" : "▶️ فعال", callback_data: `discount_toggle:

${discount.id}` }],
        [{ text: "🗑 حذف", callback_data: `discount_delete:${discount.id}` }],
        [{ text: "↩️ لیست", callback_data: "discount_list" }]
      ]
    }
  );
}

async function toggleDiscount(chatId, discountId) {
  const discounts = await getDiscounts();
  const discount = discounts.find(item => item.id === discountId);
  if (!discount) return sendMessage(chatId, "❌ تخفیف پیدا نشد.");
  discount.enabled = !discount.enabled;
  discount.updatedAt = nowISO();
  await saveDiscounts(discounts, `Toggle discount ${discount.id}`);
  return sendDiscountView(chatId, discount.id);
}

async function deleteDiscount(chatId, discountId) {
  const discounts = await getDiscounts();
  const index = discounts.findIndex(item => item.id === discountId);
  if (index === -1) return sendMessage(chatId, "❌ تخفیف پیدا نشد.");
  discounts.splice(index, 1);
  await saveDiscounts(discounts, `Delete discount ${discountId}`);
  return sendDiscountManagement(chatId);
}

// ============================================================
// ORDER MANAGEMENT
// ============================================================

async function sendOrderManagement(chatId) {
  return sendOrdersList(chatId);
}

async function sendOrdersList(chatId) {
  const orders = await getOrders();
  if (!orders.length) {
    return sendMessage(
      chatId,
      "📦 هنوز سفارشی ثبت نشده است.",
      { inline_keyboard: [[{ text: "↩️ مدیریت", callback_data: "management_menu" }]] }
    );
  }
  const sorted = [...orders].reverse();
  const rows = sorted.slice(0, 50).map(order => {
    const statusIcon = order.status === "confirmed" ? "✅" :
                       order.status === "shipped" ? "🚚" :
                       order.status === "delivered" ? "📬" :
                       order.status === "cancelled" ? "❌" : "⏳";
    return [{ text: `${statusIcon} ${order.id} - ${formatPrice(order.totalPrice)} تومان`, 

callback_data: `order_view:${order.id}` }];
  });
  rows.push([{ text: "↩️ مدیریت", callback_data: "management_menu" }]);
  return sendMessage(chatId, "📦 <b>سفارش‌ها</b>\n\nسفارش موردنظر را انتخاب کنید:", { inline_keyboard: rows });
}

async function sendOrderView(chatId, orderId) {
  const orders = await getOrders();
  const order = orders.find(o => String(o.id) === String(orderId));
  if (!order) return sendMessage(chatId, "❌ سفارش پیدا نشد.");
  const statusNames = { pending: "⏳ در انتظار بررسی", confirmed: "✅ تأیید شده", shipped: "🚚 ارسال شده", 

delivered: "📬 تحویل شده", cancelled: "❌ لغو شده" };
  const itemsText = (order.items || []).map((item, index) => {
    const attrs = item.variantAttributes ? Object.entries(item.variantAttributes).map(([k, 

v]) => `${k}: ${v}`).join("، ") : "";
    return `${index + 1}. ${item.productName}\n${attrs ? attrs + "\n" : ""}تعداد: 

${item.quantity}\nقیمت واحد: ${formatPrice(item.unitPrice)} تومان\nجمع: ${formatPrice

(item.totalPrice)} تومان`;
  }).join("\n\n");
  const customer = order.customer || {};
  return sendMessage(
    chatId,
    `📦 <b>سفارش ${escapeHtml(order.id)}</b>\n\nوضعیت:\n${statusNames[order.status] || 

order.status}\n\n👤 مشتری:\n${escapeHtml(customer.name || "-")}\n📱 تلفن:\n${escapeHtml

(customer.phone || "-")}\n📍 آدرس:\n${escapeHtml(customer.address || "-")}\n

\n━━━━━━━━━━━━\n\n${itemsText}\n\n━━━━━━━━━━━━\n\n💰 <b>مبلغ نهایی:</b>\n${formatPrice

(order.totalPrice)} تومان`,
    {
      inline_keyboard: [
        [{ text: "⏳ در انتظار", callback_data: `order_status:${order.id}:pending` }, { text: "✅ 

تأیید", callback_data: `order_status:${order.id}:confirmed` }],
        [{ text: "🚚 ارسال شد", callback_data: `order_status:${order.id}:shipped` }, { text: "📬 

تحویل شد", callback_data: `order_status:${order.id}:delivered` }],
        [{ text: "❌ لغو", callback_data: `order_status:${order.id}:cancelled` }],
        [{ text: "🔙 بازگشت", callback_data: "orders_manage" }]
      ]
    }
  );
}

async function updateOrderStatus(chatId, orderId, status) {
  const allowed = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
  if (!allowed.includes(status)) {
    await sendMessage(chatId, "❌ وضعیت نامعتبر است.");
    return;
  }
  const orders = await getOrders();
  const index = orders.findIndex(o => String(o.id) === String(orderId));
  if (index === -1) {
    await sendMessage(chatId, "❌ سفارش پیدا نشد.");
    return;
  }
  orders[index].status = status;
  orders[index].updatedAt = nowISO();
  await saveOrders(orders, `Update order ${orderId} status to ${status}`);
  return sendOrderView(chatId, orderId);
}

// ============================================================
// CREATE ORDER - PUBLIC API
// ============================================================

async function publicCreateOrder(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }
  const customer = payload.customer;
  if (!customer || typeof customer !== "object") {
    return { ok: false, error: "CUSTOMER_REQUIRED" };
  }
  const customerName = String(customer.name || "").trim();
  const customerPhone = String(customer.phone || "").trim();
  const customerAddress = String(customer.address || "").trim();
  if (!customerName) return { ok: false, error: "CUSTOMER_NAME_REQUIRED" };
  if (!customerPhone) return { ok: false, error: "CUSTOMER_PHONE_REQUIRED" };
  if (!customerAddress) return { ok: false, error: "CUSTOMER_ADDRESS_REQUIRED" };
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return { ok: false, error: "ITEMS_REQUIRED" };
  }
  if (payload.items.length > 100) return { ok: false, error: "TOO_MANY_ITEMS" };

  const products = await getProducts();
  const orderItems = [];
  let totalPrice = 0;
  const requestedQuantities = new Map();

  for (const item of payload.items) {
    if (!item || typeof item !== "object") return { ok: false, error: "INVALID_ITEM" };
    const productId = String(item.productId || "").trim();
    const variantId = String(item.variantId || "").trim();
    const quantity = Number(item.quantity);
    if (!productId) return { ok: false, error: "PRODUCT_ID_REQUIRED" };
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { ok: false, error: "INVALID_QUANTITY", productId };
    }
    if (quantity > 999) return { ok: false, error: "QUANTITY_TOO_LARGE", productId };
    const key = `${productId}::${variantId}`;
    requestedQuantities.set(key, (requestedQuantities.get(key) || 0) + quantity);
  }

  // Check stock
  for (const [key, quantity] of requestedQuantities) {
    const separator = key.indexOf("::");
    const productId = key.substring(0, separator);
    const variantId = key.substring(separator + 2);
    const product = products.find(p => String(p.id) === String(productId));
    if (!product) return { ok: false, error: "PRODUCT_NOT_FOUND", productId };
    if (!Array.isArray(product.variants) || product.variants.length === 0) {
      if (variantId) return { ok: false, error: "VARIANT_NOT_FOUND", productId, variantId 

};
    }
    if (Array.isArray(product.variants)) {
      const variant = product.variants.find(v => String(v.id) === String(variantId));
      if (!variant) return { ok: false, error: "VARIANT_NOT_FOUND", productId, variantId 

};
      if (variant.enabled === false) return { ok: false, error: "VARIANT_DISABLED", 

productId, variantId };
      const stock = Number(variant.stock) || 0;
      if (stock < quantity) {
        return { ok: false, error: "INSUFFICIENT_STOCK", productId, variantId, 

availableStock: stock, requestedQuantity: quantity };
      }
    }
  }

  // Build order items and deduct stock
  for (const [key, quantity] of requestedQuantities) {
    const separator = key.indexOf("::");
    const productId = key.substring(0, separator);
    const variantId = key.substring(separator + 2);
    const product = products.find(p => String(p.id) === String(productId));
    const price = calculateProductPrice(product);
    let variant = null;
    if (Array.isArray(product.variants)) {
      variant = product.variants.find(v => String(v.id) === String(variantId));
      if (variant) {
        variant.stock = Math.max(0, (Number(variant.stock) || 0) - quantity);
      }
    }
    const variantAttributes = variant?.attributes || {};
    const itemTotal = price * quantity;
    orderItems.push({
      productId: product.id,
      productName: product.name || "",
      variantId: variant ? variant.id : null,
      variantAttributes,
      quantity,
      unitPrice: price,
      baseUnitPrice: product.price || 0,
      discountAmount: (product.price || 0) - price,
      totalPrice: itemTotal
    });
    totalPrice += itemTotal;
  }

  await saveProducts(products, `Order: deduct stock`);

  const order = {
    id: generateOrderId(),
    customer: { name: customerName, phone: customerPhone, address: customerAddress },
    items: orderItems,
    totalPrice,
    status: "pending",
    createdAt: nowISO(),
    updatedAt: nowISO()
  };

  const orders = await getOrders();
  orders.push(order);
  await saveOrders(orders, `Create order ${order.id}`);

  return { ok: true, order };
}

// ============================================================
// PUBLIC API HANDLER
// ============================================================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

async function handlePublicApi(method, payload, url) {
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  let action = payload?.action || url.searchParams.get("action");

  if (action === "get_products") {
    const products = await getProducts();
    return jsonResponse({ ok: true, products });
  }
  if (action === "get_categories") {
    const categories = await getCategories();
    return jsonResponse({ ok: true, categories });
  }
  if (action === "get_product") {
    const productId = payload.productId || url.searchParams.get("productId");
    const products = await getProducts();
    const product = products.find(p => String(p.id) === String(productId));
    if (!product) return jsonResponse({ ok: false, error: "PRODUCT_NOT_FOUND" }, 404);
    return jsonResponse({ ok: true, product });
  }
  if (action === "create_order") {
    const result = await publicCreateOrder(payload);
    return jsonResponse(result, result.ok ? 200 : 400);
  }
  return jsonResponse({ ok: false, error: "UNKNOWN_ACTION" }, 400);
}

// ============================================================
// CALLBACK ROUTER
// ============================================================

async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data || "";

  await answerCallbackQuery(callbackQuery.id);
  if (!chatId) return;

  // Main menu
  if (data === "main_menu") {
    clearUserState(userId);
    return sendMainMenu(chatId);
  }

  // Cancel
  if (data === "add_cancel") {
    return cancelOperation(chatId, userId);
  }

  // Management menu
  if (data === "management_menu") {
    return sendManagementMenu(chatId);
  }

  // Products list
  if (data === "products_list") {
    return sendProductsList(chatId);
  }

  // Product view
  if (data.startsWith("product_view:")) {
    return sendProductView(chatId, data.split(":")[1]);
  }

  // Product edit
  if (data.startsWith("product_edit:")) {
    return sendProductEditMenu(chatId, data.split(":")[1]);
  }

  // Product stock
  if (data.startsWith("product_stock:")) {
    return sendExistingProductStockEditor(chatId, userId, data.split(":")[1]);
  }

  // Product delete
  if (data.startsWith("product_delete:")) {
    return confirmDeleteProduct(chatId, data.split(":")[1]);
  }
  if (data.startsWith("product_delete_confirm:")) {
    return deleteProduct(chatId, data.split(":")[1]);
  }

  // Add product
  if (data === "start_add_product") {
    return startAddProduct(chatId, userId);
  }

  // Add product category
  if (data.startsWith("add_category:")) {
    return handleAddCategory(chatId, userId, data.split(":")[1]);
  }

  // Variant choice
  if (data === "variant_yes") return handleVariantChoice(chatId, userId, true);
  if (data === "variant_no") return handleVariantChoice(chatId, userId, false);

  // Variant toggle
  if (data.startsWith("variant_toggle:")) {
    return handleVariantToggle(chatId, userId, data.split(":")[1]);
  }
  if (data === "variant_existence_done") {
    return finishVariantExistence(chatId, userId);
  }

  // Stock
  if (data.startsWith("stock_edit:")) {
    return handleStockEdit(chatId, userId, data.split(":")[1]);
  }
  if (data.startsWith("stock_change:")) {
    const parts = data.split(":");
    return handleStockChange(chatId, userId, parts[1], parts[2]);
  }
  if (data.startsWith("stock_direct:")) {
    return startDirectStock(chatId, userId, data.split(":")[1]);
  }
  if (data === "stock_back") return sendInventoryEditor(chatId, userId);
  if (data === "stock_done") return finishInventory(chatId, userId);
  if (data === "stock_noop") return;

  // Discount
  if (data === "discount_none") return handleProductDiscountChoice(chatId, userId, 

"none");
  if (data === "discount_percent") return handleProductDiscountChoice(chatId, userId, 

"percent");
  if (data === "discount_fixed") return handleProductDiscountChoice(chatId, userId, 

"fixed");

  // Flags
  if (data.startsWith("flag:")) {
    return handleFeatureFlag(chatId, userId, data.split(":")[1]);
  }
  if (data === "flags_done") {
    return sendProductConfirmation(chatId, userId);
  }

  // Product confirm
  if (data === "product_confirm") {
    return finalizeNewProduct(chatId, userId);
  }

  // Edit product
  if (data.startsWith("edit_name:")) {
    return startEditProductName(chatId, userId, data.split(":")[1]);
  }
  if (data.startsWith("edit_category:") && !data.startsWith("edit_category_select:")) {
    return startEditProductCategory(chatId, userId, data.split(":")[1]);
  }
  if (data.startsWith("edit_category_select:")) {
    return handleEditProductCategory(chatId, userId, data.split(":")[1]);
  }
  if (data.startsWith("edit_price:")) {
    return startEditProductPrice(chatId, userId, data.split(":")[1]);
  }
  if (data.startsWith("edit_discount:")) {
    return startEditProductDiscount(chatId, userId, data.split(":")[1]);
  }
  if (data.startsWith("edit_discount_type:")) {
    const parts = data.split(":");
    return handleEditDiscountType(chatId, userId, parts[1], parts[2]);
  }
  if (data.startsWith("edit_flags:")) {
    return sendProductFeatureEditor(chatId, userId, data.split(":")[1]);
  }
  if (data.startsWith("existing_flag:")) {
    const parts = data.split(":");
    return handleExistingFeatureFlag(chatId, userId, parts[1], parts[2]);
  }
  if (data.startsWith("existing_flags_done:")) {
    const productId = data.split(":")[1];
    clearUserState(userId);
    return sendProductEditMenu(chatId, productId);
  }
  if (data.startsWith("edit_variants:")) {
    return startEditProductVariants(chatId, userId, data.split(":")[1]);
  }
  if (data.startsWith("edit_variant_toggle:")) {
    return handleEditVariantToggle(chatId, userId, data.split(":")[1]);
  }
  if (data === "edit_variants_existence_done") {
    return finishEditVariants(chatId, userId);
  }
  if (data === "edit_variants_cancel") {
    clearUserState(userId);
    return sendManagementMenu(chatId);
  }
  if (data.startsWith("edit_image:")) {
    return startEditProductImage(chatId, userId, data.split(":")[1]);
  }

  // Existing stock
  if (data.startsWith("existing_stock_edit:")) {
    const parts = data.split(":");
    return sendExistingStockItemEditor(chatId, userId, parts[1], Number(parts[2]));
  }
  if (data.startsWith("existing_stock_change:")) {
    const parts = data.split(":");
    return handleExistingStockChange(chatId, userId, parts[1], Number(parts[2]), Number

(parts[3]));
  }
  if (data.startsWith("existing_stock_direct:")) {
    const parts = data.split(":");
    return startExistingStockDirect(chatId, userId, parts[1], Number(parts[2]));
  }

  // Categories
  if (data === "categories_manage") {
    return sendCategoryManagement(chatId);
  }
  if (data === "category_add") {
    return startAddCategory(chatId, userId);
  }
  if (data.startsWith("category_view:")) {
    return sendCategoryView(chatId, data.split(":")[1]);
  }
  if (data.startsWith("category_edit:")) {
    return startEditCategory(chatId, userId, data.split(":")[1]);
  }
  if (data.startsWith("category_toggle:")) {
    return toggleCategory(chatId, data.split(":")[1]);
  }
  if (data.startsWith("category_delete:")) {
    return confirmDeleteCategory(chatId, data.split(":")[1]);
  }
  if (data.startsWith("category_delete_confirm:")) {
    return deleteCategory(chatId, data.split(":")[1]);
  }

  // Featured
  if (data === "featured_manage") {
    return sendFeaturedManagement(chatId);
  }
  if (data.startsWith("featured_list:")) {
    return sendFeaturedList(chatId, data.split(":")[1]);
  }
  if (data.startsWith("product_feature_edit:")) {
    return sendProductFeatureEditor(chatId, userId, data.split(":")[1]);
  }

  // Discounts
  if (data === "discounts_manage") {
    return sendDiscountManagement(chatId);
  }
  if (data.startsWith("discount_add:")) {
    return startDiscountCreation(chatId, userId, data.split(":")[1]);
  }
  if (data === "discount_list") {
    return sendDiscountList(chatId);
  }
  if (data.startsWith("discount_target_product:")) {
    return handleDiscountTarget(chatId, userId, data.split(":")[1]);
  }
  if (data.startsWith("discount_target_category:")) {
    return handleDiscountTarget(chatId, userId, data.split(":")[1]);
  }
  if (data.startsWith("discount_type:")) {
    return handleDiscountType(chatId, userId, data.split(":")[1]);
  }
  if (data.startsWith("discount_view:")) {
    return sendDiscountView(chatId, data.split(":")[1]);
  }
  if (data.startsWith("discount_toggle:")) {
    return toggleDiscount(chatId, data.split(":")[1]);
  }
  if (data.startsWith("discount_delete:")) {
    return deleteDiscount(chatId, data.split(":")[1]);
  }
  if (data === "discount_cancel") {
    clearUserState(userId);
    return sendDiscountManagement(chatId);
  }

  // Orders
  if (data === "orders_manage") {
    return sendOrdersList(chatId);
  }
  if (data.startsWith("order_view:")) {
    return sendOrderView(chatId, data.split(":")[1]);
  }
  if (data.startsWith("order_status:")) {
    const parts = data.split(":");
    return updateOrderStatus(chatId, parts[1], parts[2]);
  }

  // Fallback
  await sendMessage(chatId, "❌ این گزینه دیگر معتبر نیست.");
}

// ============================================================
// TEXT MESSAGE HANDLER
// ============================================================

async function handleTextMessage(message, chatId, userId) {
  const text = safeText(message.text || "");
  if (!text) return false;

  // Start
  if (text === "/start") {
    await handleStart(chatId, userId);
    return true;
  }

  // Cancel
  if (text === "❌ لغو") {
    await cancelOperation(chatId, userId);
    return true;
  }

  // Admin check
  if (!isAdmin(userId)) {
    await sendMessage(chatId, "⛔ شما دسترسی مدیریت این ربات را ندارید.");
    return true;
  }

  const state = getUserState(userId);

  // Main menu buttons
  if (text === "➕ افزودن محصول") {
    await startAddProduct(chatId, userId);
    return true;
  }
  if (text === "📦 مشاهده محصولات") {
    await sendProductsList(chatId);
    return true;
  }
  if (text === "⚙️ مدیریت") {
    await sendManagementMenu(chatId);
    return true;
  }
  if (text === "📂 مدیریت دسته‌بندی‌ها") {
    await sendCategoryManagement(chatId);
    return true;
  }
  if (text === "🌐 مشاهده سایت") {
    await sendMessage(chatId, "🌐 سایت فروشگاه:\n\nhttps://khanepaz.github.io/hamed_test1/");
    return true;
  }

  // State-based handlers
  if (state?.type === "add_product") {
    if (state.step === "waiting_variant_attributes") {
      return handleVariantAttributes(chatId, userId, text);
    }
    if (state.step === "waiting_direct_stock") {
      return handleDirectStockInput(chatId, userId, text);
    }
    if (state.step === "waiting_price") {
      return handleProductPrice(chatId, userId, text);
    }
    if (state.step === "waiting_discount_value") {
      return handleProductDiscountValue(chatId, userId, text);
    }
  }

  if (state?.type === "edit_product") {
    if (state.step === "waiting_name") {
      return handleEditProductName(chatId, userId, text);
    }
    if (state.step === "waiting_price") {
      return handleEditProductPrice(chatId, userId, text);
    }
    if (state.step === "waiting_discount_value") {
      return handleEditDiscountValue(chatId, userId, text);
    }
  }

  if (state?.type === "edit_variants" && state.step === "waiting_attributes") {
    return handleEditVariantAttributes(chatId, userId, text);
  }

  if (state?.type === "category") {
    if (state.step === "waiting_name") {
      return handleAddCategoryName(chatId, userId, text);
    }
    if (state.step === "waiting_emoji") {
      return handleAddCategoryEmoji(chatId, userId, text);
    }
  }

  if (state?.type === "edit_category" && state.step === "waiting_name") {
    return handleEditCategoryName(chatId, userId, text);
  }

  if (state?.type === "discount") {
    if (state.step === "waiting_name") {
      return handleDiscountName(chatId, userId, text);
    }
    if (state.step === "waiting_value") {
      return handleDiscountValue(chatId, userId, text);
    }
    if (state.step === "waiting_min_quantity") {
      return handleDiscountMinQuantity(chatId, userId, text);
    }
  }

  if (state?.type === "existing_stock" && state.step === "waiting_direct") {
    return handleExistingStockDirectInput(chatId, userId, text);
  }

  return false;
}

// ============================================================
// PHOTO MESSAGE HANDLER
// ============================================================

async function handlePhotoMessage(message, chatId, userId) {
  const state = getUserState(userId);

  // Add product photo
  if (!state || state.type === "add_product") {
    return handleProductPhoto(message, chatId, userId);
  }

  // Edit image
  if (state?.type === "edit_image") {
    return handleEditProductPhoto(message, chatId, userId);
  }

  await sendMessage(chatId, "❌ در این مرحله دریافت عکس امکان‌پذیر نیست.");
  return true;
}

// ============================================================
// BALE UPDATE HANDLER
// ============================================================

async function handleBaleUpdate(update) {
  // Callback
  if (update.callback_query) {
    const userId = update.callback_query.from.id;
    if (!isAdmin(userId)) {
      await answerCallbackQuery(update.callback_query.id, "⛔ دسترسی ندارید.");
      return;
    }
    await handleCallbackQuery(update.callback_query);
    return;
  }

  // Message
  if (update.message) {
    const userId = update.message.from.id;
    const chatId = update.message.chat.id;

    if (!isAdmin(userId)) {
      await sendMessage(chatId, "⛔ شما اجازه استفاده از این ربات را ندارید.");
      return;
    }

    // Photo
    if (update.message.photo?.length) {
      await handlePhotoMessage(update.message, chatId, userId);
      return;
    }

    // Text
    if (typeof update.message.text === "string") {
      await handleTextMessage(update.message, chatId, userId);
      return;
    }
  }
}

// ============================================================
// MAIN NETLIFY FUNCTION
// ============================================================

export default async function handler(req) {
  try {
    const url = new URL(req.url);

    // OPTIONS
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Parse body
    let body = null;
    if (req.method === "POST" || req.method === "PUT") {
      try {
        body = await req.json();
      } catch {
        body = null;
      }
    }

    // Public API
    const publicActions = ["get_products", "get_categories", "get_product", 

"create_order"];
    const requestedAction = body?.action || url.searchParams.get("action");

    if (publicActions.includes(requestedAction)) {
      return await handlePublicApi(req.method, body || {}, url);
    }

    // Bale Webhook
    if (req.method === "POST") {
      await handleBaleUpdate(body || {});
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: 

corsHeaders() });
    }

    // Health check
    return jsonResponse({ ok: true, service: "HamedShop API", status: "running" });

  } catch (error) {
    console.error("API ERROR:", error);
    return jsonResponse(
      { ok: false, error: "INTERNAL_SERVER_ERROR", message: error?.message || "Unknown 

error" },
      500
    );
  }
}
