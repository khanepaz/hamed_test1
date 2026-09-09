// ============================================================
// HamedShop - Complete Netlify API
// Bale Bot <-> Netlify <-> GitHub
// ============================================================

const GITHUB_OWNER = "khanepaz";
const GITHUB_REPO = "hamed_test1";
const GITHUB_BRANCH = "main";

const SITE_URL = "https://khanepaz.github.io/hamed_test1/";
const API_VERSION = "2.0.0";

// ============================================================
// DEFAULT CATEGORIES
// ============================================================

const DEFAULT_CATEGORIES = [
  { id: "digital", name: "📱 دیجیتال", icon: "📱", active: true },
  { id: "shoes", name: "👟 کفش", icon: "👟", active: true },
  { id: "bags", name: "👜 کیف", icon: "👜", active: true },
  { id: "clothes", name: "👕 پوشاک", icon: "👕", active: true },
  { id: "home", name: "🏠 خانه", icon: "🏠", active: true },
  { id: "beauty", name: "💄 زیبایی", icon: "💄", active: true },
  { id: "other", name: "📦 سایر", icon: "📦", active: true }
];

// ============================================================
// COMMON
// ============================================================

function nowISO() {
  return new Date().toISOString();
}

function generateId(prefix = "ID") {
  return (
    prefix +
    "_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).substring(2, 8)
  );
}

function generateProductId() {
  const d = new Date();

  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  const random = String(
    Math.floor(Math.random() * 100)
  ).padStart(2, "0");

  return `P${yy}${mm}${dd}${hh}${mi}${ss}${random}`;
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseBody(event) {
  if (!event || !event.body) return {};

  if (typeof event.body === "object") {
    return event.body;
  }

  try {
    return JSON.parse(event.body);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type, X-Admin-Key",
      "Access-Control-Allow-Methods":
        "GET, POST, PUT, DELETE, OPTIONS"
    },
    body: JSON.stringify(data)
  };
}

// ============================================================
// BALE
// ============================================================

async function baleRequest(method, data) {
  const token = process.env.BALE_BOT_TOKEN;

  if (!token) {
    throw new Error("BALE_BOT_TOKEN is missing");
  }

  const response = await fetch(
    `https://tapi.bale.ai/bot${token}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    }
  );

  const text = await response.text();

  let result;

  try {
    result = JSON.parse(text);
  } catch {
    result = {
      ok: false,
      raw: text
    };
  }

  if (!response.ok || !result.ok) {
    throw new Error(
      `Bale API Error: ${JSON.stringify(result)}`
    );
  }

  return result.result;
}

async function sendMessage(chatId, text, replyMarkup = null) {
  const data = {
    chat_id: chatId,
    text
  };

  if (replyMarkup) {
    data.reply_markup = replyMarkup;
  }

  return baleRequest("sendMessage", data);
}

async function answerCallback(callbackId) {
  try {
    await baleRequest("answerCallbackQuery", {
      callback_query_id: callbackId
    });
  } catch {}
}

// ============================================================
// GITHUB
// ============================================================

async function githubRequest(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("GITHUB_TOKEN is missing");
  }

  const response = await fetch(
    `https://api.github.com${path}`,
    {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "HamedShop",
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API Error ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return data;
}

function githubPath(path) {
  return `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
}

async function readJsonFile(path, fallback = []) {
  try {
    const result = await githubRequest(
      `${githubPath(path)}?ref=${encodeURIComponent(
        GITHUB_BRANCH
      )}`
    );

    if (!result.content) {
      return {
        data: fallback,
        sha: result.sha
      };
    }

    const decoded = Buffer.from(
      result.content.replace(/\n/g, ""),
      "base64"
    ).toString("utf8");

    return {
      data: JSON.parse(decoded),
      sha: result.sha
    };
  } catch (error) {
    if (error.message.includes("GitHub API Error 404")) {
      return {
        data: fallback,
        sha: null
      };
    }

    throw error;
  }
}

async function writeJsonFile(
  path,
  data,
  message,
  sha = null
) {
  const content = JSON.stringify(
    data,
    null,
    2
  );

  const body = {
    message,
    content: Buffer.from(
      content,
      "utf8"
    ).toString("base64"),
    branch: GITHUB_BRANCH
  };

  if (sha) {
    body.sha = sha;
  }

  return githubRequest(
    githubPath(path),
    {
      method: "PUT",
      body: JSON.stringify(body)
    }
  );
}

// ============================================================
// PRODUCTS
// ============================================================

async function getProductsFile() {
  return readJsonFile(
    "data/products.json",
    []
  );
}

function calculateProduct(product) {
  const price = number(product.price);
  const compareAtPrice = number(
    product.compareAtPrice
  );

  let discountAmount = 0;
  let discountPercent = 0;

  if (
    compareAtPrice > 0 &&
    price > 0 &&
    price < compareAtPrice
  ) {
    discountAmount =
      compareAtPrice - price;

    discountPercent = Math.round(
      (discountAmount / compareAtPrice) * 100
    );
  }

  const variants = Array.isArray(
    product.variants
  )
    ? product.variants
    : [];

  let totalStock = 0;

  if (variants.length > 0) {
    totalStock = variants.reduce(
      (sum, variant) =>
        sum + number(variant.stock),
      0
    );
  } else {
    totalStock = number(product.stock);
  }

  return {
    ...product,

    price,

    compareAtPrice,

    discountPercent,

    discountAmount,

    finalPrice: price,

    variants,

    stock: totalStock,

    totalStock
  };
}

function normalizeProduct(product) {
  return calculateProduct({
    id:
      product.id ||
      generateProductId(),

    name:
      product.name ||
      "محصول بدون نام",

    category:
      product.category ||
      "",

    categoryId:
      product.categoryId ||
      null,

    description:
      product.description ||
      "",

    image:
      product.image ||
      "",

    images:
      Array.isArray(product.images)
        ? product.images
        : product.image
          ? [product.image]
          : [],

    price:
      number(product.price),

    compareAtPrice:
      number(product.compareAtPrice),

    currency:
      product.currency ||
      "IRR",

    variants:
      Array.isArray(product.variants)
        ? product.variants
        : [],

    attributes:
      product.attributes &&
      typeof product.attributes === "object"
        ? product.attributes
        : {},

    stock:
      number(product.stock),

    totalStock:
      number(product.totalStock),

    active:
      product.active !== false,

    featured:
      product.featured === true,

    tags:
      Array.isArray(product.tags)
        ? product.tags
        : [],

    createdAt:
      product.createdAt ||
      nowISO(),

    updatedAt:
      product.updatedAt ||
      nowISO()
  });
}

async function saveProducts(
  products,
  sha,
  message
) {
  return writeJsonFile(
    "data/products.json",
    products,
    message,
    sha
  );
}

async function createProduct(product) {
  const file =
    await getProductsFile();

  const normalized =
    normalizeProduct({
      ...product,
      id:
        product.id ||
        generateProductId(),
      createdAt:
        product.createdAt ||
        nowISO(),
      updatedAt:
        nowISO()
    });

  file.data.push(normalized);

  await saveProducts(
    file.data,
    file.sha,
    `Add product ${normalized.id}`
  );

  return normalized;
}

// ============================================================
// CATEGORIES
// ============================================================

async function getCategoriesFile() {
  const file =
    await readJsonFile(
      "data/categories.json",
      []
    );

  if (
    !Array.isArray(file.data) ||
    file.data.length === 0
  ) {
    return {
      data: DEFAULT_CATEGORIES,
      sha: file.sha
    };
  }

  return file;
}

async function saveCategories(
  categories,
  sha,
  message
) {
  return writeJsonFile(
    "data/categories.json",
    categories,
    message,
    sha
  );
}

// ============================================================
// INVENTORY
// ============================================================

async function getInventoryFile() {
  return readJsonFile(
    "data/inventory.json",
    []
  );
}

async function rebuildInventory() {
  const products =
    await getProductsFile();

  const inventory =
    products.data.map(product => ({
      productId: product.id,
      name: product.name,
      stock: number(
        product.totalStock ??
        product.stock
      ),
      variants:
        Array.isArray(product.variants)
          ? product.variants
          : [],
      updatedAt: nowISO()
    }));

  const file =
    await getInventoryFile();

  await writeJsonFile(
    "data/inventory.json",
    inventory,
    "Update inventory",
    file.sha
  );

  return inventory;
}

// ============================================================
// ORDERS
// ============================================================

async function getOrdersFile() {
  return readJsonFile(
    "data/orders.json",
    []
  );
}

async function getCustomersFile() {
  return readJsonFile(
    "data/customers.json",
    []
  );
}

async function getDiscountsFile() {
  return readJsonFile(
    "data/discounts.json",
    []
  );
}

async function getSettingsFile() {
  return readJsonFile(
    "data/settings.json",
    {
      shopName: "HamedShop",
      currency: "IRR",
      shippingCost: 0
    }
  );
}

// ============================================================
// PERSISTENT BALE SESSIONS
// ============================================================

async function getSessionsFile() {
  return readJsonFile(
    "data/bale_sessions.json",
    {}
  );
}

async function getSession(chatId) {
  const file =
    await getSessionsFile();

  return file.data[String(chatId)] || null;
}

async function saveSession(
  chatId,
  session
) {
  const file =
    await getSessionsFile();

  file.data[String(chatId)] =
    session;

  await writeJsonFile(
    "data/bale_sessions.json",
    file.data,
    `Update Bale session ${chatId}`,
    file.sha
  );
}

async function deleteSession(chatId) {
  const file =
    await getSessionsFile();

  delete file.data[String(chatId)];

  await writeJsonFile(
    "data/bale_sessions.json",
    file.data,
    `Delete Bale session ${chatId}`,
    file.sha
  );
}

// ============================================================
// IMAGE UPLOAD
// ============================================================

async function uploadImageToGitHub(
  fileId,
  productId
) {
  const token =
    process.env.BALE_BOT_TOKEN;

  if (!token) {
    throw new Error(
      "BALE_BOT_TOKEN is missing"
    );
  }

  const fileInfo =
    await baleRequest(
      "getFile",
      {
        file_id: fileId
      }
    );

  if (!fileInfo || !fileInfo.file_path) {
    throw new Error(
      "Bale file_path not found"
    );
  }

  const downloadUrl =
    `https://tapi.bale.ai/file/bot${token}/${fileInfo.file_path}`;

  const response =
    await fetch(downloadUrl);

  if (!response.ok) {
    throw new Error(
      "Could not download image from Bale"
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  const base64 =
    Buffer.from(
      arrayBuffer
    ).toString("base64");

  const path =
    `images/${productId}.jpg`;

  let sha = null;

  try {
    const existing =
      await githubRequest(
        `${githubPath(path)}?ref=${encodeURIComponent(
          GITHUB_BRANCH
        )}`
      );

    sha = existing.sha;
  } catch {}

  const body = {
    message:
      `Upload product image ${productId}`,
    content: base64,
    branch: GITHUB_BRANCH
  };

  if (sha) {
    body.sha = sha;
  }

  await githubRequest(
    githubPath(path),
    {
      method: "PUT",
      body: JSON.stringify(body)
    }
  );

  return path;
}

// ============================================================
// MAIN MENU
// ============================================================

function mainMenu() {
  return {
    keyboard: [
      [
        {
          text: "➕ افزودن محصول"
        },
        {
          text: "📦 مشاهده محصولات"
        }
      ],
      [
        {
          text: "📂 دسته‌بندی‌ها"
        },
        {
          text: "📊 موجودی"
        }
      ],
      [
        {
          text: "🧾 سفارش‌ها"
        },
        {
          text: "👥 مشتریان"
        }
      ],
      [
        {
          text: "🏷 تخفیف‌ها"
        },
        {
          text: "⚙️ تنظیمات"
        }
      ],
      [
        {
          text: "🌐 مشاهده سایت"
        }
      ]
    ],
    resize_keyboard: true
  };
}

async function sendMainMenu(chatId) {
  await sendMessage(
    chatId,
    "🛍️ HamedShop\n\nمدیریت فروشگاه را انتخاب کنید:",
    mainMenu()
  );
}

// ============================================================
// CATEGORY KEYBOARD
// ============================================================

async function categoryKeyboard() {
  const file =
    await getCategoriesFile();

  const categories =
    file.data.filter(
      c => c.active !== false
    );

  const rows = [];

  for (
    let i = 0;
    i < categories.length;
    i += 2
  ) {
    const row = [];

    row.push({
      text: categories[i].name,
      callback_data:
        `cat:${categories[i].id}`
    });

    if (categories[i + 1]) {
      row.push({
        text:
          categories[i + 1].name,
        callback_data:
          `cat:${categories[i + 1].id}`
      });
    }

    rows.push(row);
  }

  rows.push([
    {
      text: "❌ لغو",
      callback_data: "cancel_product"
    }
  ]);

  return {
    inline_keyboard: rows
  };
}

// ============================================================
// PRODUCT CREATION WIZARD
// ============================================================

async function startProductWizard(
  chatId
) {
  await saveSession(
    chatId,
    {
      type: "product",
      step: "waiting_photo",
      product: {
        id: generateProductId(),
        name: "",
        category: "",
        categoryId: null,
        description: "",
        image: "",
        images: [],
        price: 0,
        compareAtPrice: 0,
        discountPercent: 0,
        discountAmount: 0,
        finalPrice: 0,
        currency: "IRR",
        variants: [],
        attributes: {},
        stock: 0,
        totalStock: 0,
        active: true,
        featured: false,
        tags: []
      },
      createdAt: nowISO()
    }
  );

  await sendMessage(
    chatId,
    "➕ ثبت محصول جدید\n\n📷 لطفاً عکس محصول را همراه با کپشن ارسال کنید.\n\nمثال:\nعکس محصول\nکپشن: کفش اسپرت مردانه"
  );
}

async function askDescription(
  chatId
) {
  await sendMessage(
    chatId,
    "📝 توضیحات محصول را وارد کنید.\n\nاگر توضیحات ندارد، بنویسید:\n«رد کردن»"
  );
}

async function askPrice(chatId) {
  await sendMessage(
    chatId,
    "💰 قیمت فروش محصول را به ریال وارد کنید.\n\nمثال:\n2500000"
  );
}

async function askComparePrice(
  chatId
) {
  await sendMessage(
    chatId,
    "💵 قیمت قبل از تخفیف را وارد کنید.\n\nاگر محصول تخفیف ندارد، بنویسید:\n«ندارد»"
  );
}

async function askHasVariants(
  chatId
) {
  await sendMessage(
    chatId,
    "🔹 آیا محصول دارای تنوع است؟",
    {
      inline_keyboard: [
        [
          {
            text: "✅ بله",
            callback_data:
              "variants:yes"
          },
          {
            text: "❌ خیر",
            callback_data:
              "variants:no"
          }
        ]
      ]
    }
  );
}

async function askAttributes(
  chatId
) {
  await sendMessage(
    chatId,
    `🎨 ویژگی‌ها و مقادیر تنوع را وارد کنید.

فرمت:

رنگ: مشکی، سفید، آبی
سایز: 40، 41، 42

هر ویژگی را در یک خط بنویسید.

اگر تنوع ندارد، این مرحله را رد کنید.`
  );
}

async function askVariantStocks(
  chatId,
  session
) {
  const attributes =
    session.product.attributes || {};

  const names =
    Object.keys(attributes);

  if (names.length === 0) {
    session.step = "stock";
    await saveSession(
      chatId,
      session
    );

    await sendMessage(
      chatId,
      "📦 موجودی کل محصول را وارد کنید."
    );

    return;
  }

  await sendMessage(
    chatId,
    `📦 حالا موجودی تنوع‌ها را وارد کنید.

برای هر ترکیب یک خط:

مشکی | 40 | 5
مشکی | 41 | 3
سفید | 40 | 2

آخرین عدد = موجودی

ترتیب ویژگی‌ها:
${names.join(" + ")}`
  );
}

async function askStock(chatId) {
  await sendMessage(
    chatId,
    "📦 موجودی محصول را وارد کنید.\n\nمثال:\n25"
  );
}

async function askFeatured(chatId) {
  await sendMessage(
    chatId,
    "⭐ آیا این محصول ویژه باشد؟",
    {
      inline_keyboard: [
        [
          {
            text: "⭐ بله",
            callback_data:
              "featured:yes"
          },
          {
            text: "خیر",
            callback_data:
              "featured:no"
          }
        ]
      ]
    }
  );
}

async function askTags(chatId) {
  await sendMessage(
    chatId,
    "🏷 برچسب‌های محصول را وارد کنید.\n\nمثال:\nاسپرت، مردانه، جدید\n\nاگر برچسب ندارد بنویسید:\n«ندارد»"
  );
}

async function showProductPreview(
  chatId,
  session
) {
  const p =
    calculateProduct(
      session.product
    );

  const variantText =
    p.variants.length > 0
      ? `\n🎨 تعداد تنوع: ${p.variants.length}`
      : "\n🎨 تنوع: ندارد";

  const tags =
    p.tags.length > 0
      ? p.tags.join("، ")
      : "ندارد";

  const discount =
    p.discountPercent > 0
      ? `${p.discountPercent}%`
      : "ندارد";

  const text =
`👀 پیش‌نمایش محصول

🆔 ${p.id}

📦 نام:
${p.name}

📂 دسته‌بندی:
${p.category}

📝 توضیحات:
${p.description || "ندارد"}

💰 قیمت فروش:
${p.price.toLocaleString("en-US")} ریال

💵 قیمت قبل از تخفیف:
${
  p.compareAtPrice
    ? p.compareAtPrice.toLocaleString("en-US")
    : "ندارد"
} ریال

🏷 تخفیف:
${discount}

📦 موجودی:
${p.totalStock}

${variantText}

⭐ ویژه:
${p.featured ? "بله" : "خیر"}

🏷 برچسب:
${tags}`;

  await sendMessage(
    chatId,
    text,
    {
      inline_keyboard: [
        [
          {
            text: "✅ ثبت نهایی",
            callback_data:
              "product:confirm"
          }
        ],
        [
          {
            text: "❌ لغو",
            callback_data:
              "cancel_product"
          }
        ]
      ]
    }
  );
}

// ============================================================
// ATTRIBUTE PARSER
// ============================================================

function parseAttributes(text) {
  const attributes = {};

  const lines =
    String(text)
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

  for (const line of lines) {
    const index =
      line.indexOf(":");

    if (index === -1) continue;

    const name =
      line
        .substring(0, index)
        .trim();

    const values =
      line
        .substring(index + 1)
        .split(/[،,]/)
        .map(x => x.trim())
        .filter(Boolean);

    if (
      name &&
      values.length
    ) {
      attributes[name] =
        values;
    }
  }

  return attributes;
}

// ============================================================
// VARIANT STOCK PARSER
// ============================================================

function parseVariantStocks(
  text,
  attributes
) {
  const variants = [];

  const attributeNames =
    Object.keys(attributes);

  const lines =
    String(text)
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

  for (const line of lines) {
    const parts =
      line
        .split("|")
        .map(x => x.trim());

    if (
      parts.length !==
      attributeNames.length + 1
    ) {
      continue;
    }

    const stock =
      number(
        parts[parts.length - 1]
      );

    const variantAttributes = {};

    for (
      let i = 0;
      i < attributeNames.length;
      i++
    ) {
      variantAttributes[
        attributeNames[i]
      ] = parts[i];
    }

    variants.push({
      id: generateId("var"),
      attributes:
        variantAttributes,
      stock,
      active: true
    });
  }

  return variants;
}

// ============================================================
// TEXT HANDLER FOR WIZARD
// ============================================================

async function handleProductText(
  chatId,
  text,
  session
) {
  const value =
    String(text).trim();

  if (
    value === "❌ لغو" ||
    value === "/cancel"
  ) {
    await deleteSession(chatId);

    await sendMessage(
      chatId,
      "❌ ثبت محصول لغو شد."
    );

    await sendMainMenu(chatId);
    return;
  }

  const p =
    session.product;

  switch (session.step) {

    case "description":

      p.description =
        value === "رد کردن"
          ? ""
          : value;

      session.step =
        "price";

      await saveSession(
        chatId,
        session
      );

      await askPrice(chatId);

      return;

    case "price":

      if (!/^\d+(\.\d+)?$/.test(
        value.replace(/,/g, "")
      )) {
        await sendMessage(
          chatId,
          "❌ قیمت نامعتبر است.\nفقط عدد وارد کنید."
        );
        return;
      }

      p.price =
        number(
          value.replace(/,/g, "")
        );

      session.step =
        "compare_price";

      await saveSession(
        chatId,
        session
      );

      await askComparePrice(
        chatId
      );

      return;

    case "compare_price":

      if (
        value === "ندارد" ||
        value === "رد کردن"
      ) {
        p.compareAtPrice =
          0;
      } else {

        const n =
          number(
            value.replace(/,/g, "")
          );

        if (!Number.isFinite(n)) {
          await sendMessage(
            chatId,
            "❌ عدد معتبر وارد کنید."
          );
          return;
        }

        p.compareAtPrice = n;
      }

      session.step =
        "variants_question";

      await saveSession(
        chatId,
        session
      );

      await askHasVariants(
        chatId
      );

      return;

    case "attributes":

      const attributes =
        parseAttributes(value);

      if (
        Object.keys(attributes)
          .length === 0
      ) {
        await sendMessage(
          chatId,
          "❌ فرمت ویژگی‌ها صحیح نیست.\n\nمثال:\nرنگ: مشکی، سفید\nسایز: 40، 41"
        );
        return;
      }

      p.attributes =
        attributes;

      session.step =
        "variant_stock";

      await saveSession(
        chatId,
        session
      );

      await askVariantStocks(
        chatId,
        session
      );

      return;

    case "variant_stock":

      const variants =
        parseVariantStocks(
          value,
          p.attributes
        );

      if (
        variants.length === 0
      ) {
        await sendMessage(
          chatId,
          "❌ هیچ تنوع معتبری پیدا نشد.\n\nمثال:\nمشکی | 40 | 5\nمشکی | 41 | 3"
        );
        return;
      }

      p.variants =
        variants;

      p.totalStock =
        variants.reduce(
          (sum, v) =>
            sum + number(v.stock),
          0
        );

      p.stock =
        p.totalStock;

      session.step =
        "featured";

      await saveSession(
        chatId,
        session
      );

      await askFeatured(
        chatId
      );

      return;

    case "stock":

      if (!/^\d+$/.test(
        value.replace(/,/g, "")
      )) {
        await sendMessage(
          chatId,
          "❌ موجودی باید عدد باشد."
        );
        return;
      }

      p.stock =
        number(
          value.replace(/,/g, "")
        );

      p.totalStock =
        p.stock;

      session.step =
        "featured";

      await saveSession(
        chatId,
        session
      );

      await askFeatured(
        chatId
      );

      return;

    case "tags":

      p.tags =
        value === "ندارد"
          ? []
          : value
              .split(/[،,]/)
              .map(x => x.trim())
              .filter(Boolean);

      session.step =
        "preview";

      await saveSession(
        chatId,
        session
      );

      await showProductPreview(
        chatId,
        session
      );

      return;

    default:

      await sendMessage(
        chatId,
        "لطفاً از گزینه‌های نمایش داده شده استفاده کنید."
      );

      return;
  }
}

// ============================================================
// CALLBACK HANDLER
// ============================================================

async function handleCallbackQuery(
  callback
) {
  const chatId =
    callback.message &&
    callback.message.chat
      ? callback.message.chat.id
      : null;

  const data =
    callback.data || "";

  await answerCallback(
    callback.id
  );

  if (!chatId) return;

  // -------------------------
  // CATEGORY
  // -------------------------

  if (data.startsWith("cat:")) {

    const categoryId =
      data.substring(4);

    const categories =
      await getCategoriesFile();

    const category =
      categories.data.find(
        c =>
          c.id === categoryId
      );

    if (!category) {
      await sendMessage(
        chatId,
        "❌ دسته‌بندی پیدا نشد."
      );
      return;
    }

    const session =
      await getSession(chatId);

    if (
      !session ||
      session.type !== "product"
    ) {
      await sendMessage(
        chatId,
        "⚠️ جلسه ثبت محصول منقضی شده است."
      );
      return;
    }

    session.product.category =
      category.name;

    session.product.categoryId =
      category.id;

    session.step =
      "description";

    await saveSession(
      chatId,
      session
    );

    await askDescription(
      chatId
    );

    return;
  }

  // -------------------------
  // CANCEL
  // -------------------------

  if (
    data === "cancel_product"
  ) {
    await deleteSession(chatId);

    await sendMessage(
      chatId,
      "❌ ثبت محصول لغو شد."
    );

    await sendMainMenu(chatId);

    return;
  }

  // -------------------------
  // VARIANTS
  // -------------------------

  if (
    data === "variants:yes" ||
    data === "variants:no"
  ) {
    const session =
      await getSession(chatId);

    if (!session) {
      await sendMessage(
        chatId,
        "⚠️ جلسه ثبت محصول پیدا نشد."
      );
      return;
    }

    if (
      data === "variants:yes"
    ) {
      session.step =
        "attributes";

      await saveSession(
        chatId,
        session
      );

      await askAttributes(
        chatId
      );

    } else {

      session.product.variants =
        [];

      session.product.attributes =
        {};

      session.step =
        "stock";

      await saveSession(
        chatId,
        session
      );

      await askStock(chatId);
    }

    return;
  }

  // -------------------------
  // FEATURED
  // -------------------------

  if (
    data === "featured:yes" ||
    data === "featured:no"
  ) {
    const session =
      await getSession(chatId);

    if (!session) return;

    session.product.featured =
      data === "featured:yes";

    session.step =
      "tags";

    await saveSession(
      chatId,
      session
    );

    await askTags(chatId);

    return;
  }

  // -------------------------
  // FINAL CONFIRM
  // -------------------------

  if (
    data === "product:confirm"
  ) {
    const session =
      await getSession(chatId);

    if (
      !session ||
      session.type !== "product"
    ) {
      await sendMessage(
        chatId,
        "⚠️ جلسه ثبت محصول پیدا نشد."
      );
      return;
    }

    try {

      const product =
        normalizeProduct(
          session.product
        );

      await createProduct(
        product
      );

      await deleteSession(
        chatId
      );

      // Update inventory
      try {
        await rebuildInventory();
      } catch {}

      await sendMessage(
        chatId,
`✅ محصول با موفقیت ثبت شد.

📦 ${product.name}

🆔 ${product.id}

💰 ${product.price.toLocaleString(
  "en-US"
)} ریال

📦 موجودی:
${product.totalStock}

🌐 محصول در سایت قرار گرفت.`
      );

      await sendMainMenu(
        chatId
      );

    } catch (error) {

      console.error(
        "PRODUCT CREATE ERROR:",
        error
      );

      await sendMessage(
        chatId,
`❌ خطا هنگام ثبت محصول:

${error.message}`
      );
    }

    return;
  }
}

// ============================================================
// PHOTO HANDLER
// ============================================================

async function handlePhotoMessage(
  message
) {
  const chatId =
    message.chat.id;

  const photos =
    Array.isArray(message.photo)
      ? message.photo
      : [];

  if (photos.length === 0) {
    return;
  }

  const session =
    await getSession(chatId);

  if (
    !session ||
    session.type !== "product"
  ) {
    await sendMessage(
      chatId,
      "📷 برای ثبت محصول ابتدا گزینه «➕ افزودن محصول» را انتخاب کنید."
    );
    return;
  }

  const photo =
    photos[photos.length - 1];

  const caption =
    message.caption || "";

  if (!caption.trim()) {
    await sendMessage(
      chatId,
      "❌ لطفاً نام محصول را در کپشن عکس بنویسید."
    );
    return;
  }

  try {

    const productId =
      session.product.id ||
      generateProductId();

    const imagePath =
      await uploadImageToGitHub(
        photo.file_id,
        productId
      );

    session.product.id =
      productId;

    session.product.name =
      caption.trim();

    session.product.image =
      imagePath;

    session.product.images =
      [imagePath];

    session.step =
      "category";

    await saveSession(
      chatId,
      session
    );

    await sendMessage(
      chatId,
      `✅ عکس دریافت شد.

📦 نام محصول:
${caption.trim()}

حالا دسته‌بندی محصول را انتخاب کنید:`,
      await categoryKeyboard()
    );

  } catch (error) {

    console.error(
      "PHOTO ERROR:",
      error
    );

    await sendMessage(
      chatId,
`❌ خطا در دریافت عکس:

${error.message}`
    );
  }
}

// ============================================================
// TEXT MESSAGE HANDLER
// ============================================================

async function handleMessage(
  message
) {
  const chatId =
    message.chat.id;

  const text =
    (message.text || "").trim();

  // -------------------------
  // PHOTO
  // -------------------------

  if (
    Array.isArray(message.photo) &&
    message.photo.length
  ) {
    await handlePhotoMessage(
      message
    );
    return;
  }

  // -------------------------
  // START
  // -------------------------

  if (
    text === "/start" ||
    text === "/menu"
  ) {
    await deleteSession(
      chatId
    );

    await sendMainMenu(
      chatId
    );

    return;
  }

  // -------------------------
  // CANCEL
  // -------------------------

  if (
    text === "/cancel" ||
    text === "❌ لغو"
  ) {
    await deleteSession(
      chatId
    );

    await sendMessage(
      chatId,
      "❌ عملیات لغو شد."
    );

    await sendMainMenu(
      chatId
    );

    return;
  }

  // -------------------------
  // ADD PRODUCT
  // -------------------------

  if (
    text === "➕ افزودن محصول"
  ) {
    await startProductWizard(
      chatId
    );
    return;
  }

  // -------------------------
  // VIEW PRODUCTS
  // -------------------------

  if (
    text === "📦 مشاهده محصولات"
  ) {
    const file =
      await getProductsFile();

    if (
      !file.data.length
    ) {
      await sendMessage(
        chatId,
        "📦 هنوز محصولی ثبت نشده است."
      );
      return;
    }

    let output =
      "📦 محصولات:\n\n";

    for (
      const product of
      file.data.slice(-20).reverse()
    ) {
      const p =
        normalizeProduct(
          product
        );

      output +=
`━━━━━━━━━━━━
📦 ${p.name}
📂 ${p.category || "بدون دسته"}
💰 ${p.price.toLocaleString(
  "en-US"
)} ریال
📦 موجودی: ${p.totalStock}
🆔 ${p.id}

`;
    }

    await sendMessage(
      chatId,
      output
    );

    return;
  }

  // -------------------------
  // CATEGORIES
  // -------------------------

  if (
    text === "📂 دسته‌بندی‌ها"
  ) {
    const file =
      await getCategoriesFile();

    let output =
      "📂 دسته‌بندی‌ها:\n\n";

    file.data.forEach(
      (category, index) => {
        output +=
`${index + 1}. ${category.name}
🆔 ${category.id}
وضعیت: ${
  category.active === false
    ? "غیرفعال"
    : "فعال"
}

`;
      }
    );

    await sendMessage(
      chatId,
      output,
      {
        inline_keyboard: [
          [
            {
              text: "➕ افزودن دسته‌بندی",
              callback_data:
                "category:add"
            }
          ]
        ]
      }
    );

    return;
  }

  // -------------------------
  // INVENTORY
  // -------------------------

  if (
    text === "📊 موجودی"
  ) {
    const products =
      await getProductsFile();

    const low =
      products.data.filter(
        p =>
          number(
            p.totalStock ??
            p.stock
          ) <= 5
      );

    if (!low.length) {
      await sendMessage(
        chatId,
        "📊 موجودی وضعیت خوبی دارد.\n\nهیچ محصولی با موجودی ۵ یا کمتر وجود ندارد."
      );
      return;
    }

    let output =
      "📊 محصولات با موجودی کم:\n\n";

    low.forEach(p => {
      output +=
`📦 ${p.name}
موجودی: ${
  number(
    p.totalStock ??
    p.stock
  )
}

`;
    });

    await sendMessage(
      chatId,
      output
    );

    return;
  }

  // -------------------------
  // ORDERS
  // -------------------------

  if (
    text === "🧾 سفارش‌ها"
  ) {
    const file =
      await getOrdersFile();

    if (!file.data.length) {
      await sendMessage(
        chatId,
        "🧾 هنوز سفارشی ثبت نشده است."
      );
      return;
    }

    let output =
      "🧾 آخرین سفارش‌ها:\n\n";

    file.data
      .slice(-20)
      .reverse()
      .forEach(order => {
        output +=
`━━━━━━━━━━━━
🆔 ${order.id}
👤 ${order.customerName || "نامشخص"}
💰 ${number(
  order.total
).toLocaleString("en-US")} ریال
📌 وضعیت: ${
  order.status || "new"
}

`;
      });

    await sendMessage(
      chatId,
      output
    );

    return;
  }

  // -------------------------
  // CUSTOMERS
  // -------------------------

  if (
    text === "👥 مشتریان"
  ) {
    const file =
      await getCustomersFile();

    await sendMessage(
      chatId,
      `👥 تعداد مشتریان ثبت‌شده:

${file.data.length}`
    );

    return;
  }

  // -------------------------
  // DISCOUNTS
  // -------------------------

  if (
    text === "🏷 تخفیف‌ها"
  ) {
    const file =
      await getDiscountsFile();

    if (!file.data.length) {
      await sendMessage(
        chatId,
        "🏷 هنوز تخفیفی ثبت نشده است."
      );
      return;
    }

    let output =
      "🏷 تخفیف‌ها:\n\n";

    file.data.forEach(
      discount => {
        output +=
`🏷 ${discount.name || discount.code}
مقدار: ${
  discount.percent ||
  discount.amount ||
  0
}
وضعیت: ${
  discount.active === false
    ? "غیرفعال"
    : "فعال"
}

`;
      }
    );

    await sendMessage(
      chatId,
      output
    );

    return;
  }

  // -------------------------
  // SETTINGS
  // -------------------------

  if (
    text === "⚙️ تنظیمات"
  ) {
    const file =
      await getSettingsFile();

    await sendMessage(
      chatId,
`⚙️ تنظیمات فروشگاه

🏪 نام:
${file.data.shopName || "HamedShop"}

💱 ارز:
${file.data.currency || "IRR"}

🚚 هزینه ارسال:
${number(
  file.data.shippingCost
).toLocaleString("en-US")} ریال`
    );

    return;
  }

  // -------------------------
  // SITE
  // -------------------------

  if (
    text === "🌐 مشاهده سایت"
  ) {
    await sendMessage(
      chatId,
      `🌐 سایت فروشگاه:

${SITE_URL}`
    );

    return;
  }

  // -------------------------
  // PRODUCT WIZARD
  // -------------------------

  const session =
    await getSession(chatId);

  if (
    session &&
    session.type === "product"
  ) {
    await handleProductText(
      chatId,
      text,
      session
    );

    return;
  }

  await sendMessage(
    chatId,
    "لطفاً یکی از گزینه‌های منو را انتخاب کنید.",
    mainMenu()
  );
}

// ============================================================
// API ACTIONS
// ============================================================

async function handleApiAction(
  event,
  body
) {
  const method =
    event.httpMethod || "GET";

  const query =
    event.queryStringParameters ||
    {};

  const action =
    body.action ||
    query.action;

  if (!action) {
    return jsonResponse(
      400,
      {
        ok: false,
        error:
          "action is required"
      }
    );
  }

  // -------------------------
  // PRODUCTS LIST
  // -------------------------

  if (
    action === "products.list"
  ) {
    const file =
      await getProductsFile();

    return jsonResponse(
      200,
      {
        ok: true,
        products:
          file.data.map(
            normalizeProduct
          )
      }
    );
  }

  // -------------------------
  // PRODUCT GET
  // -------------------------

  if (
    action === "products.get"
  ) {
    const id =
      body.productId ||
      query.productId;

    const file =
      await getProductsFile();

    const product =
      file.data.find(
        p => p.id === id
      );

    return jsonResponse(
      product ? 200 : 404,
      {
        ok: !!product,
        product:
          product
            ? normalizeProduct(product)
            : null
      }
    );
  }

  // -------------------------
  // CATEGORIES
  // -------------------------

  if (
    action === "categories.list"
  ) {
    const file =
      await getCategoriesFile();

    return jsonResponse(
      200,
      {
        ok: true,
        categories:
          file.data
      }
    );
  }

  // -------------------------
  // INVENTORY
  // -------------------------

  if (
    action === "inventory.list"
  ) {
    const file =
      await getInventoryFile();

    return jsonResponse(
      200,
      {
        ok: true,
        inventory:
          file.data
      }
    );
  }

  // -------------------------
  // ORDERS
  // -------------------------

  if (
    action === "orders.list"
  ) {
    const file =
      await getOrdersFile();

    return jsonResponse(
      200,
      {
        ok: true,
        orders:
          file.data
      }
    );
  }

  // -------------------------
  // ORDERS GET
  // -------------------------

  if (
    action === "orders.get"
  ) {
    const id =
      body.orderId ||
      query.orderId;

    const file =
      await getOrdersFile();

    const order =
      file.data.find(
        o => o.id === id
      );

    return jsonResponse(
      order ? 200 : 404,
      {
        ok: !!order,
        order:
          order || null
      }
    );
  }

  // -------------------------
  // CUSTOMERS
  // -------------------------

  if (
    action === "customers.list"
  ) {
    const file =
      await getCustomersFile();

    return jsonResponse(
      200,
      {
        ok: true,
        customers:
          file.data
      }
    );
  }

  // -------------------------
  // DISCOUNTS
  // -------------------------

  if (
    action === "discounts.list"
  ) {
    const file =
      await getDiscountsFile();

    return jsonResponse(
      200,
      {
        ok: true,
        discounts:
          file.data
      }
    );
  }

  // -------------------------
  // SETTINGS
  // -------------------------

  if (
    action === "settings.get"
  ) {
    const file =
      await getSettingsFile();

    return jsonResponse(
      200,
      {
        ok: true,
        settings:
          file.data
      }
    );
  }

  // -------------------------
  // VARIANTS
  // -------------------------

  if (
    action === "variants.list"
  ) {
    const products =
      await getProductsFile();

    const variants = [];

    products.data.forEach(
      product => {
        if (
          Array.isArray(
            product.variants
          )
        ) {
          product.variants.forEach(
            variant => {
              variants.push({
                ...variant,
                productId:
                  product.id
              });
            }
          );
        }
      }
    );

    return jsonResponse(
      200,
      {
        ok: true,
        variants
      }
    );
  }

  return jsonResponse(
    404,
    {
      ok: false,
      error:
        "Unknown action"
    }
  );
}

// ============================================================
// MAIN HANDLER
// ============================================================

export default async function handler(
  event
) {
  try {

    // -------------------------
    // OPTIONS
    // -------------------------

    if (
      event.httpMethod ===
      "OPTIONS"
    ) {
      return jsonResponse(
        200,
        {
          ok: true
        }
      );
    }

    // -------------------------
    // GET
    // -------------------------

    if (
      event.httpMethod ===
      "GET"
    ) {
      const query =
        event.queryStringParameters ||
        {};

      if (query.action) {
        return handleApiAction(
          event,
          {}
        );
      }

      return jsonResponse(
        200,
        {
          ok: true,
          service:
            "HamedShop API",
          version:
            API_VERSION,
          status:
            "running",
          bale:
            !!process.env.BALE_BOT_TOKEN,
          github:
            !!process.env.GITHUB_TOKEN,
          site:
            SITE_URL,
          timestamp:
            nowISO()
        }
      );
    }

    // -------------------------
    // POST
    // -------------------------

    if (
      event.httpMethod !==
      "POST"
    ) {
      return jsonResponse(
        405,
        {
          ok: false,
          error:
            "Method not allowed"
        }
      );
    }

    const body =
      parseBody(event);

    // -------------------------
    // API ACTION
    // -------------------------

    if (body.action) {
      return handleApiAction(
        event,
        body
      );
    }

    // -------------------------
    // BALE UPDATE
    // -------------------------

    if (
      body.callback_query
    ) {
      await handleCallbackQuery(
        body.callback_query
      );

      return jsonResponse(
        200,
        {
          ok: true
        }
      );
    }

    if (
      body.message
    ) {
      await handleMessage(
        body.message
      );

      return jsonResponse(
        200,
        {
          ok: true
        }
      );
    }

    return jsonResponse(
      200,
      {
        ok: true,
        message:
          "Webhook received"
      }
    );

  } catch (error) {

    console.error(
      "HamedShop API ERROR:",
      error
    );

    return jsonResponse(
      500,
      {
        ok: false,
        error:
          error.message ||
          "Internal server error"
      }
    );
  }
}
