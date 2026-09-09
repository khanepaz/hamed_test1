// ============================================================
// HamedShop - Netlify API
// Bale Bot <-> Netlify <-> GitHub Pages
// ============================================================

const GITHUB_OWNER = "khanepaz";
const GITHUB_REPO = "hamed_test1";
const GITHUB_BRANCH = "main";

const SITE_URL =
  "https://khanepaz.github.io/hamed_test1/";

const API_VERSION = "2.0.0";


// ============================================================
// JSON FILES
// ============================================================

const JSON_DEFAULTS = {

  "data/products.json": [],

  "data/categories.json": [],

  "data/variants.json": [],

  "data/inventory.json": [],

  "data/orders.json": [],

  "data/customers.json": [],

  "data/discounts.json": [],

  "data/settings.json": {
    currency: "IRR",
    shippingCost: 0,
    freeShippingThreshold: 0
  },

  // بسیار مهم:
  // وضعیت Wizard اینجا ذخیره می‌شود تا Netlify Serverless
  // باعث از بین رفتن وضعیت ثبت محصول نشود.
  "data/product_drafts.json": {}
};


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
    Math.random()
      .toString(36)
      .substring(2, 8)
  );
}


function generateProductId() {

  const d = new Date();

  const pad = n =>
    String(n).padStart(2, "0");

  return (
    "P" +
    String(d.getFullYear()).slice(-2) +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds()) +
    Math.floor(Math.random() * 100)
      .toString()
      .padStart(2, "0")
  );
}


function safeNumber(value, fallback = 0) {

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}


function safeText(value) {

  return String(value ?? "").trim();
}


function safeArray(value) {

  return Array.isArray(value)
    ? value
    : [];
}


function jsonResponse(statusCode, data) {

  return {

    statusCode,

    headers: {

      "Content-Type":
        "application/json; charset=utf-8",

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Headers":
        "Content-Type, X-Admin-Key",

      "Access-Control-Allow-Methods":
        "GET, POST, PUT, DELETE, OPTIONS"
    },

    body: JSON.stringify(data)
  };
}


function parseJsonBody(event) {

  if (!event || !event.body) {
    return {};
  }

  if (typeof event.body === "object") {
    return event.body;
  }

  return JSON.parse(event.body);
}


// ============================================================
// BALE API
// ============================================================

async function baleRequest(method, data) {

  const token =
    process.env.BALE_BOT_TOKEN;

  if (!token) {
    throw new Error(
      "BALE_BOT_TOKEN is missing"
    );
  }

  const response = await fetch(

    `https://tapi.bale.ai/bot${token}/${method}`,

    {

      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify(data)
    }
  );

  const text =
    await response.text();

  let result;

  try {

    result =
      JSON.parse(text);

  } catch {

    result = {
      ok: false,
      raw: text
    };
  }

  if (
    !response.ok ||
    !result.ok
  ) {

    throw new Error(
      "Bale API Error: " +
      JSON.stringify(result)
    );
  }

  return result.result;
}


// ============================================================
// GITHUB API
// ============================================================

async function githubRequest(
  path,
  options = {}
) {

  const token =
    process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error(
      "GITHUB_TOKEN is missing"
    );
  }

  const response = await fetch(

    `https://api.github.com${path}`,

    {

      ...options,

      headers: {

        "Accept":
          "application/vnd.github+json",

        "Authorization":
          `Bearer ${token}`,

        "X-GitHub-Api-Version":
          "2022-11-28",

        "User-Agent":
          "HamedShop",

        "Content-Type":
          "application/json",

        ...(options.headers || {})
      }
    }
  );

  const text =
    await response.text();

  let data;

  try {

    data =
      JSON.parse(text);

  } catch {

    data = text;
  }

  if (!response.ok) {

    const error =
      new Error(
        `GitHub API Error ${response.status}: ${JSON.stringify(data)}`
      );

    error.status =
      response.status;

    throw error;
  }

  return data;
}


function githubContentPath(path) {

  return (
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`
  );
}


// ============================================================
// READ JSON FROM GITHUB
// ============================================================

async function readJsonFile(
  path,
  defaultValue = []
) {

  try {

    const result =
      await githubRequest(

        `${githubContentPath(path)}?ref=${encodeURIComponent(
          GITHUB_BRANCH
        )}`
      );

    if (!result.content) {

      return {
        data: defaultValue,
        sha: result.sha
      };
    }

    const decoded =
      Buffer
        .from(
          result.content.replace(/\n/g, ""),
          "base64"
        )
        .toString("utf8");

    if (!decoded.trim()) {

      return {
        data: defaultValue,
        sha: result.sha
      };
    }

    return {

      data:
        JSON.parse(decoded),

      sha:
        result.sha
    };

  } catch (error) {

    if (error.status === 404) {

      return {

        data: defaultValue,

        sha: null
      };
    }

    throw error;
  }
}


// ============================================================
// WRITE JSON TO GITHUB
// ============================================================

async function writeJsonFile(
  path,
  data,
  message,
  sha = null
) {

  const content =
    JSON.stringify(
      data,
      null,
      2
    );

  const encoded =
    Buffer
      .from(content, "utf8")
      .toString("base64");

  const body = {

    message,

    content: encoded,

    branch:
      GITHUB_BRANCH
  };

  if (sha) {
    body.sha = sha;
  }

  try {

    return await githubRequest(

      githubContentPath(path),

      {

        method: "PUT",

        body:
          JSON.stringify(body)
      }
    );

  } catch (error) {

    // اگر همزمان فایل تغییر کرده باشد،
    // SHA جدید را دوباره می‌گیریم.
    if (error.status !== 409) {
      throw error;
    }

    const latest =
      await readJsonFile(
        path,
        JSON_DEFAULTS[path] ?? []
      );

    if (latest.sha) {

      body.sha =
        latest.sha;

    } else {

      delete body.sha;
    }

    return githubRequest(

      githubContentPath(path),

      {

        method: "PUT",

        body:
          JSON.stringify(body)
      }
    );
  }
}


// ============================================================
// NORMALIZE PRODUCT
// ============================================================

function normalizeProduct(
  product = {}
) {

  const variants =
    safeArray(
      product.variants
    ).map(variant => ({

      id:
        variant.id ||
        generateId("V"),

      name:
        safeText(variant.name),

      attributes:
        variant.attributes &&
        typeof variant.attributes === "object"
          ? variant.attributes
          : {},

      price:
        safeNumber(
          variant.price ??
          product.price
        ),

      stock:
        Math.max(
          0,
          safeNumber(variant.stock)
        ),

      sku:
        safeText(variant.sku),

      active:
        variant.active !== false
    }));


  let totalStock = 0;

  if (variants.length > 0) {

    totalStock =
      variants.reduce(
        (sum, variant) =>
          sum +
          safeNumber(
            variant.stock
          ),
        0
      );

  } else {

    totalStock =
      Math.max(
        0,
        safeNumber(
          product.stock ??
          product.totalStock
        )
      );
  }


  let price =
    Math.max(
      0,
      safeNumber(product.price)
    );


  let compareAtPrice =
    Math.max(
      0,
      safeNumber(
        product.compareAtPrice ??
        price
      )
    );


  if (
    compareAtPrice < price
  ) {

    compareAtPrice =
      price;
  }


  const discountAmount =
    Math.max(
      0,
      compareAtPrice -
      price
    );


  const discountPercent =
    compareAtPrice > 0
      ? Math.round(
          discountAmount /
          compareAtPrice *
          100
        )
      : 0;


  let images =
    safeArray(
      product.images
    ).filter(Boolean);


  if (
    images.length === 0 &&
    product.image
  ) {

    images = [
      product.image
    ];
  }


  return {

    ...product,

    id:
      product.id ||
      generateProductId(),

    name:
      safeText(product.name) ||
      "محصول بدون نام",

    description:
      safeText(product.description),

    categoryId:
      product.categoryId ||
      null,

    category:
      safeText(product.category),

    images,

    image:
      images[0] ||
      "",

    price,

    compareAtPrice,

    discountPercent,

    discountAmount,

    finalPrice:
      price,

    currency:
      product.currency ||
      "IRR",

    attributes:
      product.attributes &&
      typeof product.attributes === "object"
        ? product.attributes
        : {},

    variants,

    stock:
      totalStock,

    totalStock,

    active:
      product.active !== false,

    featured:
      product.featured === true,

    tags:
      safeArray(
        product.tags
      ),

    createdAt:
      product.createdAt ||
      nowISO(),

    updatedAt:
      nowISO()
  };
}


// ============================================================
// PRODUCTS FILE
// ============================================================

async function getProductsFile() {

  return readJsonFile(
    "data/products.json",
    []
  );
}


async function saveProductsFile(
  products,
  sha,
  message
) {

  return writeJsonFile(

    "data/products.json",

    products.map(
      normalizeProduct
    ),

    message ||
      "Update products",

    sha
  );
}


async function getProduct(
  productId
) {

  const file =
    await getProductsFile();

  return (
    file.data
      .map(normalizeProduct)
      .find(
        product =>
          product.id ===
          productId
      ) ||
    null
  );
}


// ============================================================
// SYNC VARIANTS + INVENTORY
// ============================================================

async function syncIndexes(
  products
) {

  const variants = [];

  const inventory = [];


  for (
    const product of products
  ) {

    for (
      const variant of
      safeArray(
        product.variants
      )
    ) {

      variants.push({

        ...variant,

        productId:
          product.id,

        productName:
          product.name,

        updatedAt:
          nowISO()
      });
    }


    inventory.push({

      productId:
        product.id,

      productName:
        product.name,

      stock:
        product.totalStock,

      active:
        product.active,

      updatedAt:
        nowISO(),

      variants:
        safeArray(
          product.variants
        ).map(v => ({

          variantId:
            v.id,

          name:
            v.name,

          stock:
            v.stock
        }))
    });
  }


  const variantsFile =
    await readJsonFile(
      "data/variants.json",
      []
    );


  const inventoryFile =
    await readJsonFile(
      "data/inventory.json",
      []
    );


  await writeJsonFile(

    "data/variants.json",

    variants,

    "Sync variants",

    variantsFile.sha
  );


  await writeJsonFile(

    "data/inventory.json",

    inventory,

    "Sync inventory",

    inventoryFile.sha
  );
}


// ============================================================
// CREATE PRODUCT
// ============================================================

async function createProduct(
  product
) {

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


  file.data.push(
    normalized
  );


  await saveProductsFile(

    file.data,

    file.sha,

    `Add product ${normalized.id}`
  );


  await syncIndexes(
    file.data
  );


  return normalized;
}


// ============================================================
// UPDATE PRODUCT
// ============================================================

async function updateProduct(
  productId,
  changes
) {

  const file =
    await getProductsFile();


  const products =
    file.data.map(
      normalizeProduct
    );


  const index =
    products.findIndex(
      product =>
        product.id ===
        productId
    );


  if (index === -1) {

    throw new Error(
      "Product not found"
    );
  }


  products[index] =
    normalizeProduct({

      ...products[index],

      ...changes,

      id:
        productId,

      updatedAt:
        nowISO()
    });


  await saveProductsFile(

    products,

    file.sha,

    `Update product ${productId}`
  );


  await syncIndexes(
    products
  );


  return products[index];
}


// ============================================================
// DELETE PRODUCT
// ============================================================

async function deleteProduct(
  productId
) {

  const file =
    await getProductsFile();


  const products =
    file.data.map(
      normalizeProduct
    );


  const index =
    products.findIndex(
      product =>
        product.id ===
        productId
    );


  if (index === -1) {

    throw new Error(
      "Product not found"
    );
  }


  const deleted =
    products.splice(
      index,
      1
    )[0];


  await saveProductsFile(

    products,

    file.sha,

    `Delete product ${productId}`
  );


  await syncIndexes(
    products
  );


  return deleted;
}


// ============================================================
// CATEGORIES
// ============================================================

async function getCategoriesFile() {

  return readJsonFile(
    "data/categories.json",
    []
  );
}


async function createCategory(
  category
) {

  const file =
    await getCategoriesFile();


  const newCategory = {

    id:
      category.id ||
      generateId("cat"),

    name:
      safeText(
        category.name
      ) ||
      "دسته‌بندی جدید",

    icon:
      category.icon ||
      "📦",

    active:
      category.active !== false,

    createdAt:
      nowISO(),

    updatedAt:
      nowISO()
  };


  file.data.push(
    newCategory
  );


  await writeJsonFile(

    "data/categories.json",

    file.data,

    `Add category ${newCategory.id}`,

    file.sha
  );


  return newCategory;
}


// ============================================================
// DRAFT / WIZARD
// ============================================================

async function getDraft(
  chatId
) {

  const file =
    await readJsonFile(
      "data/product_drafts.json",
      {}
    );


  return (
    file.data[
      String(chatId)
    ] ||
    null
  );
}


async function saveDraft(
  chatId,
  draft
) {

  const file =
    await readJsonFile(
      "data/product_drafts.json",
      {}
    );


  file.data[
    String(chatId)
  ] = draft;


  await writeJsonFile(

    "data/product_drafts.json",

    file.data,

    "Update product draft",

    file.sha
  );
}


async function deleteDraft(
  chatId
) {

  const file =
    await readJsonFile(
      "data/product_drafts.json",
      {}
    );


  delete file.data[
    String(chatId)
  ];


  await writeJsonFile(

    "data/product_drafts.json",

    file.data,

    "Delete product draft",

    file.sha
  );
}


// ============================================================
// ATTRIBUTE PARSER
// ============================================================

function parseAttributes(
  input
) {

  const result = {};


  const lines =
    String(input || "")
      .split(/\n|;/);


  for (
    const line of lines
  ) {

    const match =
      line.match(
        /^\s*([^:=]+)\s*[:=]\s*(.+)$/
      );


    if (!match) {
      continue;
    }


    const key =
      safeText(
        match[1]
      );


    const values =
      match[2]
        .split(",")
        .map(safeText)
        .filter(Boolean);


    if (
      key &&
      values.length
    ) {

      result[key] =
        values;
    }
  }


  return result;
}


// ============================================================
// CREATE VARIANT COMBINATIONS
// ============================================================

function createVariantCombinations(
  attributes
) {

  const entries =
    Object.entries(
      attributes
    );


  if (
    entries.length === 0
  ) {

    return [];
  }


  let combinations = [
    {}
  ];


  for (
    const [
      key,
      values
    ] of entries
  ) {

    const next = [];


    for (
      const current of
      combinations
    ) {

      for (
        const value of
        values
      ) {

        next.push({

          ...current,

          [key]:
            value
        });
      }
    }


    combinations =
      next;
  }


  return combinations.map(
    attributes => ({

      id:
        generateId("V"),

      name:
        Object.values(
          attributes
        ).join(" / "),

      attributes,

      price:
        0,

      stock:
        0,

      sku:
        "",

      active:
        true
    })
  );
}


// ============================================================
// BALE FILE -> GITHUB
// ============================================================

async function uploadBaleImage(
  fileId,
  githubPath
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
        file_id:
          fileId
      }
    );


  if (
    !fileInfo ||
    !fileInfo.file_path
  ) {

    throw new Error(
      "Bale file path not found"
    );
  }


  const response =
    await fetch(

      `https://tapi.bale.ai/file/bot${token}/${fileInfo.file_path}`
    );


  if (!response.ok) {

    throw new Error(
      `Image download failed: ${response.status}`
    );
  }


  const buffer =
    Buffer.from(
      await response.arrayBuffer()
    );


  let sha = null;


  try {

    const existing =
      await githubRequest(

        `${githubContentPath(
          githubPath
        )}?ref=${encodeURIComponent(
          GITHUB_BRANCH
        )}`
      );


    sha =
      existing.sha;

  } catch (error) {

    if (
      error.status !== 404
    ) {

      throw error;
    }
  }


  const body = {

    message:
      `Add image ${githubPath}`,

    content:
      buffer.toString("base64"),

    branch:
      GITHUB_BRANCH
  };


  if (sha) {
    body.sha = sha;
  }


  return githubRequest(

    githubContentPath(
      githubPath
    ),

    {

      method: "PUT",

      body:
        JSON.stringify(body)
    }
  );
}


// ============================================================
// BALE KEYBOARDS
// ============================================================

function inlineKeyboard(
  rows
) {

  return {
    inline_keyboard:
      rows
  };
}


function mainKeyboard() {

  return {

    keyboard: [

      [
        {
          text:
            "➕ افزودن محصول"
        },

        {
          text:
            "📦 مشاهده محصولات"
        }
      ],

      [
        {
          text:
            "📂 دسته‌بندی‌ها"
        },

        {
          text:
            "📊 موجودی"
        }
      ],

      [
        {
          text:
            "🛒 سفارش‌ها"
        },

        {
          text:
            "👥 مشتریان"
        }
      ],

      [
        {
          text:
            "🏷️ تخفیف‌ها"
        },

        {
          text:
            "⚙️ تنظیمات"
        }
      ],

      [
        {
          text:
            "🌐 مشاهده سایت"
        }
      ]

    ],

    resize_keyboard:
      true
  };
}


async function sendMessage(
  chatId,
  message,
  markup = null
) {

  const data = {

    chat_id:
      chatId,

    text:
      message,

    parse_mode:
      "HTML"
  };


  if (markup) {

    data.reply_markup =
      markup;
  }


  return baleRequest(
    "sendMessage",
    data
  );
}


async function sendMainMenu(
  chatId
) {

  return sendMessage(

    chatId,

    "پنل مدیریت HamedShop\n\n" +
    "لطفاً یکی از گزینه‌های زیر را انتخاب کنید:",

    mainKeyboard()
  );
}


async function answerCallbackQuery(
  callbackId
) {

  try {

    await baleRequest(

      "answerCallbackQuery",

      {
        callback_query_id:
          callbackId
      }
    );

  } catch {
    // intentionally ignored
  }
}


// ============================================================
// ADMIN
// ============================================================

function isAdminRequest(
  chatId,
  event
) {

  const adminChat =
    safeText(
      process.env.ADMIN_CHAT_ID
    );


  const apiKey =
    event?.headers?.[
      "x-admin-key"
    ] ||
    event?.headers?.[
      "X-Admin-Key"
    ];


  if (adminChat) {

    return (
      String(chatId) ===
      adminChat
    );
  }


  if (
    process.env.ADMIN_API_KEY
  ) {

    return (
      apiKey ===
      process.env.ADMIN_API_KEY
    );
  }


  // برای حفظ سازگاری نسخه فعلی.
  return true;
}


// ============================================================
// PRODUCT WIZARD
// ============================================================

async function startProductWizard(
  chatId
) {

  const draft = {

    step:
      "name",

    name:
      "",

    images:
      [],

    categoryId:
      null,

    category:
      "",

    description:
      "",

    price:
      0,

    compareAtPrice:
      0,

    discountType:
      "none",

    discountValue:
      0,

    discountLabel:
      "بدون تخفیف",

    attributes:
      {},

    variants:
      [],

    totalStock:
      0,

    featured:
      false,

    tags:
      []
  };


  await saveDraft(
    chatId,
    draft
  );


  return sendMessage(

    chatId,

    "<b>ثبت محصول جدید</b>\n\n" +
    "1️⃣ نام محصول را ارسال کنید:"
  );
}


// ============================================================
// WIZARD NEXT STEP
// ============================================================

async function wizardNext(
  chatId,
  draft
) {

  switch (
    draft.step
  ) {

    case "photos":

      return sendMessage(

        chatId,

        "2️⃣ عکس محصول را ارسال کنید.\n\n" +
        `تعداد عکس‌های دریافت‌شده: ${draft.images.length}\n\n` +
        "بعد از ارسال همه عکس‌ها، روی «پایان عکس‌ها» بزنید.",

        inlineKeyboard([

          [
            {
              text:
                "✅ پایان عکس‌ها",

              callback_data:
                "draft:photos_done"
            }
          ],

          [
            {
              text:
                "❌ لغو",

              callback_data:
                "draft:cancel"
            }
          ]

        ])
      );


    case "category":

      return showCategorySelector(
        chatId
      );


    case "description":

      return sendMessage(

        chatId,

        "3️⃣ توضیحات محصول را ارسال کنید.",

        inlineKeyboard([

          [
            {
              text:
                "⏭ بدون توضیحات",

              callback_data:
                "draft:skip_description"
            }
          ]

        ])
      );


    case "price":

      return sendMessage(

        chatId,

        "4️⃣ قیمت فروش را به تومان وارد کنید.\nمثال: 850000"
      );


    case "compare":

      return sendMessage(

        chatId,

        "5️⃣ قیمت قبل از تخفیف را وارد کنید.\n" +
        "اگر تخفیف ندارد، 0 وارد کنید."
      );


    case "discount":

      return sendMessage(

        chatId,

        "6️⃣ تخفیف را وارد کنید.\n\n" +
        "مثال:\n" +
        "<code>percent:15</code>\n" +
        "<code>amount:100000</code>\n" +
        "<code>none</code>"
      );


    case "attributes":

      return sendMessage(

        chatId,

        "7️⃣ ویژگی‌های محصول را وارد کنید.\n\n" +
        "مثال:\n" +
        "<code>رنگ: مشکی, سفید</code>\n" +
        "<code>سایز: M, L, XL</code>\n\n" +
        "اگر محصول تنوع ندارد بنویسید: ندارد"
      );


    case "variantStock": {

      const index =
        draft.variantIndex || 0;

      const variant =
        draft.variants[index];


      return sendMessage(

        chatId,

        `8️⃣ موجودی تنوع <b>${escapeHtml(
          variant.name
        )}</b> را وارد کنید.`
      );
    }


    case "stock":

      return sendMessage(

        chatId,

        "8️⃣ موجودی کل محصول را وارد کنید."
      );


    case "featured":

      return sendMessage(

        chatId,

        "9️⃣ محصول ویژه باشد؟",

        inlineKeyboard([

          [
            {
              text:
                "⭐ بله",

              callback_data:
                "draft:featured_yes"
            },

            {
              text:
                "خیر",

              callback_data:
                "draft:featured_no"
            }
          ]

        ])
      );


    case "tags":

      return sendMessage(

        chatId,

        "🔟 برچسب‌ها را با کاما جدا کنید.\n\n" +
        "مثال:\n" +
        "<code>جدید, مردانه, پرفروش</code>\n\n" +
        "اگر ندارد بنویسید: ندارد"
      );


    case "preview":

      return productPreview(
        chatId,
        draft
      );
  }
}


// ============================================================
// PRODUCT PREVIEW
// ============================================================

function escapeHtml(
  value
) {

  return safeText(
    value
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    );
}


async function productPreview(
  chatId,
  draft
) {

  const attributes =
    Object.entries(
      draft.attributes || {}
    )
      .map(
        ([key, values]) =>
          `${escapeHtml(
            key
          )}: ${escapeHtml(
            values.join(", ")
          )}`
      )
      .join("\n") ||
    "ندارد";


  const variants =
    draft.variants.length

      ? draft.variants
          .map(
            variant =>
              `• ${escapeHtml(
                variant.name
              )} — ${variant.stock}`
          )
          .join("\n")

      : "ندارد";


  return sendMessage(

    chatId,

    "<b>پیش‌نمایش محصول</b>\n\n" +

    `<b>نام:</b> ${escapeHtml(
      draft.name
    )}\n` +

    `<b>دسته:</b> ${escapeHtml(
      draft.category || "-"
    )}\n` +

    `<b>توضیحات:</b> ${escapeHtml(
      draft.description || "-"
    )}\n` +

    `<b>قیمت:</b> ${safeNumber(
      draft.price
    ).toLocaleString()}\n` +

    `<b>قیمت قبل:</b> ${safeNumber(
      draft.compareAtPrice
    ).toLocaleString()}\n` +

    `<b>تخفیف:</b> ${escapeHtml(
      draft.discountLabel ||
      "بدون تخفیف"
    )}\n\n` +

    `<b>ویژگی‌ها:</b>\n${attributes}\n\n` +

    `<b>تنوع‌ها:</b>\n${variants}\n\n` +

    `<b>موجودی کل:</b> ${
      draft.totalStock || 0
    }\n` +

    `<b>محصول ویژه:</b> ${
      draft.featured
        ? "بله"
        : "خیر"
    }\n` +

    `<b>برچسب‌ها:</b> ${
      draft.tags.length
        ? escapeHtml(
            draft.tags.join(", ")
          )
        : "ندارد"
    }\n\n` +

    `<b>تعداد تصاویر:</b> ${
      draft.images.length
    }`,

    inlineKeyboard([

      [
        {
          text:
            "✅ تأیید و ثبت",

          callback_data:
            "draft:confirm"
        },

        {
          text:
            "✏️ ویرایش",

          callback_data:
            "draft:edit"
        }
      ],

      [
        {
          text:
            "❌ لغو",

          callback_data:
            "draft:cancel"
        }
      ]

    ])
  );
}


// ============================================================
// CATEGORY SELECTOR
// ============================================================

async function showCategorySelector(
  chatId
) {

  const file =
    await getCategoriesFile();


  const categories =
    safeArray(
      file.data
    )
      .filter(
        category =>
          category.active !== false
      );


  const rows =
    categories.map(
      category => [

        {

          text:
            `${category.icon || "📦"} ${category.name}`,

          callback_data:
            `category:${category.id}`
        }

      ]
    );


  rows.push([

    {
      text:
        "➕ افزودن دسته‌بندی",

      callback_data:
        "category:new"
    }

  ]);


  return sendMessage(

    chatId,

    "<b>دسته‌بندی محصول را انتخاب کنید:</b>",

    inlineKeyboard(
      rows
    )
  );
}


// ============================================================
// FINALIZE PRODUCT
// ============================================================

async function finalizeProduct(
  chatId
) {

  const draft =
    await getDraft(
      chatId
    );


  if (!draft) {

    throw new Error(
      "Product draft not found"
    );
  }


  let finalPrice =
    safeNumber(
      draft.compareAtPrice ||
      draft.price
    );


  if (
    draft.discountType ===
    "percent"
  ) {

    finalPrice =
      Math.max(
        0,
        finalPrice -
          (
            finalPrice *
            draft.discountValue /
            100
          )
      );

  } else if (
    draft.discountType ===
    "amount"
  ) {

    finalPrice =
      Math.max(
        0,
        finalPrice -
          draft.discountValue
      );

  } else {

    finalPrice =
      safeNumber(
        draft.price
      );
  }


  const product = {

    id:
      generateProductId(),

    name:
      draft.name,

    description:
      draft.description,

    categoryId:
      draft.categoryId,

    category:
      draft.category,

    price:
      finalPrice,

    compareAtPrice:
      draft.compareAtPrice,

    attributes:
      draft.attributes,

    variants:
      draft.variants,

    stock:
      draft.totalStock,

    totalStock:
      draft.totalStock,

    featured:
      draft.featured,

    tags:
      draft.tags,

    active:
      true,

    images:
      []
  };


  const normalized =
    normalizeProduct(
      product
    );


  const imagePaths = [];


  for (
    let i = 0;
    i < draft.images.length;
    i++
  ) {

    const image =
      draft.images[i];


    const path =
      `images/${normalized.id}${
        i === 0
          ? ""
          : "-" + i
      }.jpg`;


    await uploadBaleImage(
      image.fileId,
      path
    );


    imagePaths.push(
      path
    );
  }


  normalized.images =
    imagePaths;


  normalized.image =
    imagePaths[0] ||
    "";


  const created =
    await createProduct(
      normalized
    );


  await deleteDraft(
    chatId
  );


  return created;
}


// ============================================================
// WIZARD TEXT HANDLER
// ============================================================

async function handleWizardText(
  chatId,
  message
) {

  const draft =
    await getDraft(
      chatId
    );


  if (!draft) {
    return false;
  }


  const value =
    safeText(
      message.text
    );


  switch (
    draft.step
  ) {

    case "name":

      if (!value) {

        await sendMessage(
          chatId,
          "❗ نام محصول نمی‌تواند خالی باشد."
        );

        return true;
      }


      draft.name =
        value;

      draft.step =
        "photos";


      await saveDraft(
        chatId,
        draft
      );

      await wizardNext(
        chatId,
        draft
      );

      return true;


    case "description":

      draft.description =
        value === "ندارد"
          ? ""
          : value;

      draft.step =
        "price";


      await saveDraft(
        chatId,
        draft
      );

      await wizardNext(
        chatId,
        draft
      );

      return true;


    case "price":

      if (
        !/^\d+(\.\d+)?$/.test(
          value
        )
      ) {

        await sendMessage(
          chatId,
          "❗ قیمت نامعتبر است. فقط عدد وارد کنید."
        );

        return true;
      }


      draft.price =
        safeNumber(
          value
        );

      draft.step =
        "compare";


      await saveDraft(
        chatId,
        draft
      );

      await wizardNext(
        chatId,
        draft
      );

      return true;


    case "compare":

      if (
        !/^\d+(\.\d+)?$/.test(
          value
        )
      ) {

        await sendMessage(
          chatId,
          "❗ عدد نامعتبر است."
        );

        return true;
      }


      draft.compareAtPrice =
        safeNumber(
          value
        );


      draft.step =
        "discount";


      await saveDraft(
        chatId,
        draft
      );

      await wizardNext(
        chatId,
        draft
      );

      return true;


    case "discount": {

      const input =
        value.toLowerCase();


      if (
        input === "none" ||
        input === "بدون تخفیف"
      ) {

        draft.discountType =
          "none";

        draft.discountValue =
          0;

        draft.discountLabel =
          "بدون تخفیف";

      } else {

        const match =
          value.match(
            /^(percent|amount)\s*[:=]\s*(\d+(?:\.\d+)?)$/i
          );


        if (!match) {

          await sendMessage(

            chatId,

            "❗ فرمت صحیح:\n" +
            "<code>percent:15</code>\n" +
            "<code>amount:100000</code>\n" +
            "<code>none</code>"
          );

          return true;
        }


        draft.discountType =
          match[1].toLowerCase();


        draft.discountValue =
          safeNumber(
            match[2]
          );


        draft.discountLabel =
          draft.discountType ===
          "percent"

            ? `${draft.discountValue}%`

            : `${draft.discountValue.toLocaleString()} تومان`;
      }


      draft.step =
        "attributes";


      await saveDraft(
        chatId,
        draft
      );

      await wizardNext(
        chatId,
        draft
      );

      return true;
    }


    case "attributes":

      if (
        value === "ندارد"
      ) {

        draft.attributes =
          {};

        draft.variants =
          [];

        draft.step =
          "stock";

      } else {

        draft.attributes =
          parseAttributes(
            value
          );


        draft.variants =
          createVariantCombinations(
            draft.attributes
          );


        if (
          draft.variants.length
        ) {

          draft.variantIndex =
            0;

          draft.step =
            "variantStock";

        } else {

          draft.step =
            "stock";
        }
      }


      await saveDraft(
        chatId,
        draft
      );

      await wizardNext(
        chatId,
        draft
      );

      return true;


    case "variantStock":

      if (
        !/^\d+$/.test(
          value
        )
      ) {

        await sendMessage(
          chatId,
          "❗ موجودی باید عدد صحیح باشد."
        );

        return true;
      }


      draft.variants[
        draft.variantIndex
      ].stock =
        parseInt(
          value,
          10
        );


      draft.variantIndex++;


      if (
        draft.variantIndex >=
        draft.variants.length
      ) {

        draft.totalStock =
          draft.variants.reduce(

            (sum, variant) =>
              sum +
              safeNumber(
                variant.stock
              ),

            0
          );


        delete draft.variantIndex;


        draft.step =
          "featured";
      }


      await saveDraft(
        chatId,
        draft
      );

      await wizardNext(
        chatId,
        draft
      );

      return true;


    case "stock":

      if (
        !/^\d+$/.test(
          value
        )
      ) {

        await sendMessage(
          chatId,
          "❗ موجودی باید عدد صحیح باشد."
        );

        return true;
      }


      draft.totalStock =
        parseInt(
          value,
          10
        );


      draft.step =
        "featured";


      await saveDraft(
        chatId,
        draft
      );

      await wizardNext(
        chatId,
        draft
      );

      return true;


    case "tags":

      draft.tags =
        value === "ندارد"

          ? []

          : value
              .split(",")
              .map(
                safeText
              )
              .filter(Boolean);


      draft.step =
        "preview";


      await saveDraft(
        chatId,
        draft
      );

      await wizardNext(
        chatId,
        draft
      );

      return true;


    case "edit_name":

      await updateProduct(

        draft.productId,

        {
          name:
            value
        }
      );


      await deleteDraft(
        chatId
      );

      await showProductManagement(
        chatId,
        draft.productId
      );

      return true;


    case "edit_description":

      await updateProduct(

        draft.productId,

        {
          description:
            value
        }
      );


      await deleteDraft(
        chatId
      );

      await showProductManagement(
        chatId,
        draft.productId
      );

      return true;


    case "edit_price":

      if (
        !/^\d+(\.\d+)?$/.test(
          value
        )
      ) {

        await sendMessage(
          chatId,
          "❗ قیمت نامعتبر است."
        );

        return true;
      }


      await updateProduct(

        draft.productId,

        {
          price:
            safeNumber(
              value
            )
        }
      );


      await deleteDraft(
        chatId
      );

      await showProductManagement(
        chatId,
        draft.productId
      );

      return true;


    case "edit_stock":

      if (
        !/^\d+$/.test(
          value
        )
      ) {

        await sendMessage(
          chatId,
          "❗ موجودی نامعتبر است."
        );

        return true;
      }


      await updateProduct(

        draft.productId,

        {
          stock:
            parseInt(
              value,
              10
            )
        }
      );


      await deleteDraft(
        chatId
      );

      await showProductManagement(
        chatId,
        draft.productId
      );

      return true;


    case "edit_tags":

      await updateProduct(

        draft.productId,

        {
          tags:
            value
              .split(",")
              .map(
                safeText
              )
              .filter(Boolean)
        }
      );


      await deleteDraft(
        chatId
      );

      await showProductManagement(
        chatId,
        draft.productId
      );

      return true;


    case "category_name":

      await createCategory({

        name:
          value,

        icon:
          "📦",

        active:
          true
      });


      await deleteDraft(
        chatId
      );


      return sendMessage(

        chatId,

        "✅ دسته‌بندی ایجاد شد.",

        mainKeyboard()
      );


    default:

      return true;
  }
}


// ============================================================
// PHOTO HANDLER
// ============================================================

async function handlePhoto(
  chatId,
  message
) {

  if (
    !message.photo ||
    !message.photo.length
  ) {

    return false;
  }


  const draft =
    await getDraft(
      chatId
    );


  if (!draft) {
    return false;
  }


  const photo =
    message.photo[
      message.photo.length - 1
    ];


  // ------------------------------
  // New product images
  // ------------------------------

  if (
    draft.step ===
    "photos"
  ) {

    draft.images.push({

      fileId:
        photo.file_id
    });


    await saveDraft(
      chatId,
      draft
    );


    await sendMessage(

      chatId,

      `📷 عکس دریافت شد.\nتعداد تصاویر: ${draft.images.length}`
    );


    return true;
  }


  // ------------------------------
  // Existing product image
  // ------------------------------

  if (
    draft.step ===
    "image_add"
  ) {

    const product =
      await getProduct(
        draft.productId
      );


    if (!product) {

      await deleteDraft(
        chatId
      );

      await sendMessage(
        chatId,
        "❌ محصول پیدا نشد."
      );

      return true;
    }


    const index =
      product.images.length;


    const path =
      `images/${product.id}-${index}.jpg`;


    await uploadBaleImage(

      photo.file_id,

      path
    );


    product.images.push(
      path
    );


    product.image =
      product.images[0] ||
      "";


    await updateProduct(

      product.id,

      {
        images:
          product.images,

        image:
          product.image
      }
    );


    await deleteDraft(
      chatId
    );


    await showProductManagement(
      chatId,
      product.id
    );


    return true;
  }


  return false;
}


// ============================================================
// PRODUCT MANAGEMENT
// ============================================================

async function showProducts(
  chatId
) {

  const file =
    await getProductsFile();


  const products =
    file.data
      .map(normalizeProduct)
      .slice(-30)
      .reverse();


  if (
    products.length === 0
  ) {

    return sendMessage(

      chatId,

      "📦 هنوز محصولی ثبت نشده است.",

      mainKeyboard()
    );
  }


  for (
    const product of products
  ) {

    await showProductManagement(
      chatId,
      product.id
    );
  }


  return sendMainMenu(
    chatId
  );
}


async function showProductManagement(
  chatId,
  productId
) {

  const product =
    await getProduct(
      productId
    );


  if (!product) {

    return sendMessage(
      chatId,
      "❌ محصول پیدا نشد."
    );
  }


  return sendMessage(

    chatId,

    `<b>${escapeHtml(
      product.name
    )}</b>\n\n` +

    `💰 قیمت: ${
      product.finalPrice.toLocaleString()
    } ${product.currency}\n` +

    `💵 قیمت قبل: ${
      product.compareAtPrice.toLocaleString()
    }\n` +

    `📦 موجودی: ${
      product.totalStock
    }\n` +

    `🔘 وضعیت: ${
      product.active
        ? "فعال"
        : "غیرفعال"
    }\n` +

    `⭐ ویژه: ${
      product.featured
        ? "بله"
        : "خیر"
    }\n` +

    `🖼 تصاویر: ${
      product.images.length
    }`,

    inlineKeyboard([

      [
        {
          text:
            "✏️ ویرایش",

          callback_data:
            `product:edit:${product.id}`
        }
      ],

      [
        {
          text:
            "📦 تغییر موجودی",

          callback_data:
            `product:stock:${product.id}`
        },

        {
          text:
            "💰 تغییر قیمت",

          callback_data:
            `product:price:${product.id}`
        }
      ],

      [
        {
          text:
            product.active
              ? "⛔ غیرفعال کردن"
              : "✅ فعال کردن",

          callback_data:
            `product:status:${product.id}`
        }
      ],

      [
        {
          text:
            "🖼 مدیریت تصاویر",

          callback_data:
            `product:images:${product.id}`
        }
      ],

      [
        {
          text:
            "🗑 حذف",

          callback_data:
            `product:delete:${product.id}`
        }
      ]

    ])
  );
}


// ============================================================
// CALLBACK HANDLER
// ============================================================

async function handleCallbackQuery(
  callbackQuery,
  event
) {

  const chatId =
    callbackQuery.message?.chat?.id;


  const data =
    safeText(
      callbackQuery.data
    );


  await answerCallbackQuery(
    callbackQuery.id
  );


  if (
    !isAdminRequest(
      chatId,
      event
    )
  ) {

    return sendMessage(
      chatId,
      "⛔ دسترسی ندارید."
    );
  }


  // ----------------------------------------------------------
  // MAIN MENU
  // ----------------------------------------------------------

  if (
    data === "menu"
  ) {

    return sendMainMenu(
      chatId
    );
  }


  // ----------------------------------------------------------
  // CATEGORY
  // ----------------------------------------------------------

  if (
    data ===
    "category:new"
  ) {

    await saveDraft(

      chatId,

      {
        step:
          "category_name"
      }
    );


    return sendMessage(

      chatId,

      "نام دسته‌بندی جدید را ارسال کنید:"
    );
  }


  if (
    data.startsWith(
      "category:"
    )
  ) {

    const categoryId =
      data.substring(
        "category:".length
      );


    const file =
      await getCategoriesFile();


    const category =
      file.data.find(
        item =>
          String(item.id) ===
          String(categoryId)
      );


    if (!category) {

      return sendMessage(
        chatId,
        "❌ دسته‌بندی پیدا نشد."
      );
    }


    const draft =
      await getDraft(
        chatId
      );


    if (!draft) {

      return sendMessage(
        chatId,
        "ابتدا ثبت محصول را شروع کنید."
      );
    }


    // اگر در حال ویرایش دسته‌بندی محصول موجود هستیم
    if (
      draft.step ===
      "edit_category"
    ) {

      await updateProduct(

        draft.productId,

        {

          categoryId:
            category.id,

          category:
            `${category.icon || "📦"} ${category.name}`
        }
      );


      await deleteDraft(
        chatId
      );


      return showProductManagement(
        chatId,
        draft.productId
      );
    }


    draft.categoryId =
      category.id;


    draft.category =
      `${category.icon || "📦"} ${category.name}`;


    draft.step =
      "description";


    await saveDraft(
      chatId,
      draft
    );


    return wizardNext(
      chatId,
      draft
    );
  }


  // ----------------------------------------------------------
  // PRODUCT DRAFT
  // ----------------------------------------------------------

  if (
    data ===
    "draft:cancel"
  ) {

    await deleteDraft(
      chatId
    );

    return sendMainMenu(
      chatId
    );
  }


  if (
    data ===
    "draft:photos_done"
  ) {

    const draft =
      await getDraft(
        chatId
      );


    draft.step =
      "category";


    await saveDraft(
      chatId,
      draft
    );


    return wizardNext(
      chatId,
      draft
    );
  }


  if (
    data ===
    "draft:skip_description"
  ) {

    const draft =
      await getDraft(
        chatId
      );


    draft.description =
      "";


    draft.step =
      "price";


    await saveDraft(
      chatId,
      draft
    );


    return wizardNext(
      chatId,
      draft
    );
  }


  if (
    data ===
    "draft:featured_yes" ||
    data ===
    "draft:featured_no"
  ) {

    const draft =
      await getDraft(
        chatId
      );


    draft.featured =
      data.endsWith(
        "yes"
      );


    draft.step =
      "tags";


    await saveDraft(
      chatId,
      draft
    );


    return wizardNext(
      chatId,
      draft
    );
  }


  if (
    data ===
    "draft:edit"
  ) {

    const draft =
      await getDraft(
        chatId
      );


    draft.step =
      "name";


    await saveDraft(
      chatId,
      draft
    );


    return sendMessage(

      chatId,

      "نام محصول را اصلاح کنید:"
    );
  }


  if (
    data ===
    "draft:confirm"
  ) {

    const product =
      await finalizeProduct(
        chatId
      );


    return sendMessage(

      chatId,

      `✅ محصول با موفقیت ثبت شد.\n\n` +

      `<b>${escapeHtml(
        product.name
      )}</b>\n` +

      `شناسه: <code>${product.id}</code>\n` +

      `موجودی: ${
        product.totalStock
      }\n` +

      `قیمت: ${
        product.finalPrice.toLocaleString()
      }`,

      mainKeyboard()
    );
  }


  // ----------------------------------------------------------
  // PRODUCT MANAGEMENT
  // ----------------------------------------------------------

  if (
    data.startsWith(
      "product:edit:"
    )
  ) {

    const productId =
      data.substring(
        "product:edit:".length
      );


    const product =
      await getProduct(
        productId
      );


    if (!product) {

      return sendMessage(
        chatId,
        "❌ محصول پیدا نشد."
      );
    }


    await saveDraft(

      chatId,

      {
        step:
          "edit_select",

        productId
      }
    );


    return sendMessage(

      chatId,

      `<b>ویرایش محصول</b>\n${escapeHtml(
        product.name
      )}\n\nیک مورد را انتخاب کنید:`,

      inlineKeyboard([

        [
          {
            text:
              "نام",

            callback_data:
              `editfield:name:${productId}`
          },

          {
            text:
              "توضیحات",

            callback_data:
              `editfield:description:${productId}`
          }
        ],

        [
          {
            text:
              "قیمت",

            callback_data:
              `editfield:price:${productId}`
          },

          {
            text:
              "دسته‌بندی",

            callback_data:
              `editfield:category:${productId}`
          }
        ],

        [
          {
            text:
              "ویژگی‌ها و تنوع‌ها",

            callback_data:
              `editfield:attributes:${productId}`
          }
        ],

        [
          {
            text:
              "برچسب‌ها",

            callback_data:
              `editfield:tags:${productId}`
          },

          {
            text:
              "محصول ویژه",

            callback_data:
              `editfield:featured:${productId}`
          }
        ]

      ])
    );
  }


  if (
    data.startsWith(
      "editfield:"
    )
  ) {

    const parts =
      data.split(":");


    const field =
      parts[1];


    const productId =
      parts.slice(2).join(":");


    const draft = {

      step:
        `edit_${field}`,

      productId
    };


    await saveDraft(
      chatId,
      draft
    );


    if (
      field ===
      "category"
    ) {

      return showCategorySelector(
        chatId
      );
    }


    if (
      field ===
      "featured"
    ) {

      return sendMessage(

        chatId,

        "محصول ویژه باشد؟",

        inlineKeyboard([

          [
            {
              text:
                "⭐ بله",

              callback_data:
                `featured:${productId}:1`
            },

            {
              text:
                "خیر",

              callback_data:
                `featured:${productId}:0`
            }
          ]

        ])
      );
    }


    return sendMessage(

      chatId,

      `مقدار جدید برای <b>${field}</b> را ارسال کنید:`
    );
  }


  if (
    data.startsWith(
      "featured:"
    )
  ) {

    const parts =
      data.split(":");


    const productId =
      parts[1];


    const value =
      parts[2] === "1";


    await updateProduct(

      productId,

      {
        featured:
          value
      }
    );


    await deleteDraft(
      chatId
    );


    return showProductManagement(
      chatId,
      productId
    );
  }


  // ----------------------------------------------------------
  // STOCK
  // ----------------------------------------------------------

  if (
    data.startsWith(
      "product:stock:"
    )
  ) {

    const productId =
      data.substring(
        "product:stock:".length
      );


    await saveDraft(

      chatId,

      {
        step:
          "edit_stock",

        productId
      }
    );


    return sendMessage(

      chatId,

      "موجودی جدید را وارد کنید:"
    );
  }


  // ----------------------------------------------------------
  // PRICE
  // ----------------------------------------------------------

  if (
    data.startsWith(
      "product:price:"
    )
  ) {

    const productId =
      data.substring(
        "product:price:".length
      );


    await saveDraft(

      chatId,

      {
        step:
          "edit_price",

        productId
      }
    );


    return sendMessage(

      chatId,

      "قیمت جدید را وارد کنید:"
    );
  }


  // ----------------------------------------------------------
  // STATUS
  // ----------------------------------------------------------

  if (
    data.startsWith(
      "product:status:"
    )
  ) {

    const productId =
      data.substring(
        "product:status:".length
      );


    const product =
      await getProduct(
        productId
      );


    if (!product) {

      return sendMessage(
        chatId,
        "❌ محصول پیدا نشد."
      );
    }


    await updateProduct(

      productId,

      {
        active:
          !product.active
      }
    );


    return showProductManagement(
      chatId,
      productId
    );
  }


  // ----------------------------------------------------------
  // IMAGES
  // ----------------------------------------------------------

  if (
    data.startsWith(
      "product:images:"
    )
  ) {

    const productId =
      data.substring(
        "product:images:".length
      );


    const product =
      await getProduct(
        productId
      );


    if (!product) {

      return sendMessage(
        chatId,
        "❌ محصول پیدا نشد."
      );
    }


    const rows =
      product.images.map(
        (image, index) => [

          {
            text:
              `🗑 حذف تصویر ${index + 1}`,

            callback_data:
              `image:delete:${productId}:${index}`
          }

        ]
      );


    rows.push([

      {
        text:
          "➕ افزودن تصویر",

        callback_data:
          `image:add:${productId}`
      }

    ]);


    rows.push([

      {
        text:
          "🏠 منوی اصلی",

        callback_data:
          "menu"
      }

    ]);


    return sendMessage(

      chatId,

      `<b>${escapeHtml(
        product.name
      )}</b>\n\n` +

      `تعداد تصاویر: ${
        product.images.length
      }`,

      inlineKeyboard(
        rows
      )
    );
  }


  if (
    data.startsWith(
      "image:add:"
    )
  ) {

    const productId =
      data.substring(
        "image:add:".length
      );


    await saveDraft(

      chatId,

      {
        step:
          "image_add",

        productId
      }
    );


    return sendMessage(

      chatId,

      "📷 تصویر جدید محصول را ارسال کنید."
    );
  }


  if (
    data.startsWith(
      "image:delete:"
    )
  ) {

    const parts =
      data.split(":");


    const productId =
      parts[2];


    const index =
      parseInt(
        parts[3],
        10
      );


    const product =
      await getProduct(
        productId
      );


    if (
      !product ||
      !product.images[index]
    ) {

      return sendMessage(
        chatId,
        "❌ تصویر پیدا نشد."
      );
    }


    product.images.splice(
      index,
      1
    );


    await updateProduct(

      productId,

      {
        images:
          product.images,

        image:
          product.images[0] ||
          ""
      }
    );


    return showProductManagement(
      chatId,
      productId
    );
  }


  // ----------------------------------------------------------
  // DELETE PRODUCT
  // ----------------------------------------------------------

  if (
    data.startsWith(
      "product:delete:"
    )
  ) {

    const productId =
      data.substring(
        "product:delete:".length
      );


    return sendMessage(

      chatId,

      "⚠️ آیا از حذف این محصول مطمئن هستید؟",

      inlineKeyboard([

        [
          {
            text:
              "🗑 بله، حذف شود",

            callback_data:
              `product:delete_confirm:${productId}`
          },

          {
            text:
              "لغو",

            callback_data:
              "menu"
          }
        ]

      ])
    );
  }


  if (
    data.startsWith(
      "product:delete_confirm:"
    )
  ) {

    const productId =
      data.substring(
        "product:delete_confirm:".length
      );


    await deleteProduct(
      productId
    );


    return sendMessage(

      chatId,

      "✅ محصول حذف شد.",

      mainKeyboard()
    );
  }
}


// ============================================================
// MAIN MENU
// ============================================================

async function handleMainMenu(
  chatId,
  message
) {

  const text =
    safeText(
      message.text
    );


  if (
    text === "/start" ||
    text === "/menu"
  ) {

    return sendMainMenu(
      chatId
    );
  }


  if (
    text ===
    "➕ افزودن محصول"
  ) {

    return startProductWizard(
      chatId
    );
  }


  if (
    text ===
    "📦 مشاهده محصولات"
  ) {

    return showProducts(
      chatId
    );
  }


  if (
    text ===
    "📂 دسته‌بندی‌ها"
  ) {

    return showCategories(
      chatId
    );
  }


  if (
    text ===
    "📊 موجودی"
  ) {

    return showInventory(
      chatId
    );
  }


  if (
    text ===
    "🛒 سفارش‌ها"
  ) {

    return showOrders(
      chatId
    );
  }


  if (
    text ===
    "👥 مشتریان"
  ) {

    return showCustomers(
      chatId
    );
  }


  if (
    text ===
    "🏷️ تخفیف‌ها"
  ) {

    return showDiscounts(
      chatId
    );
  }


  if (
    text ===
    "⚙️ تنظیمات"
  ) {

    return showSettings(
      chatId
    );
  }


  if (
    text ===
    "🌐 مشاهده سایت"
  ) {

    return sendMessage(

      chatId,

      `🌐 <a href="${SITE_URL}">مشاهده سایت</a>`,

      mainKeyboard()
    );
  }


  return false;
}


// ============================================================
// CATEGORIES MENU
// ============================================================

async function showCategories(
  chatId
) {

  const file =
    await getCategoriesFile();


  const categories =
    safeArray(
      file.data
    );


  let message =
    "<b>📂 دسته‌بندی‌ها</b>\n\n";


  if (
    categories.length === 0
  ) {

    message +=
      "هنوز دسته‌بندی‌ای ثبت نشده است.";

  } else {

    message +=
      categories
        .map(
          category =>
            `• ${category.icon || "📦"} ${
              escapeHtml(
                category.name
              )
            } — ${
              category.active === false
                ? "غیرفعال"
                : "فعال"
            }`
        )
        .join("\n");
  }


  return sendMessage(

    chatId,

    message,

    inlineKeyboard([

      [
        {
          text:
            "➕ افزودن دسته‌بندی",

          callback_data:
            "category:new"
        }
      ],

      [
        {
          text:
            "🏠 منوی اصلی",

          callback_data:
            "menu"
        }
      ]

    ])
  );
}


// ============================================================
// INVENTORY
// ============================================================

async function showInventory(
  chatId
) {

  const file =
    await getProductsFile();


  const products =
    file.data.map(
      normalizeProduct
    );


  const totalStock =
    products.reduce(

      (sum, product) =>
        sum +
        product.totalStock,

      0
    );


  const lowStock =
    products.filter(
      product =>
        product.totalStock <= 5
    );


  let message =

    "<b>📊 موجودی فروشگاه</b>\n\n" +

    `تعداد محصولات: ${products.length}\n` +

    `موجودی کل: ${totalStock}\n` +

    `محصولات کم‌موجودی: ${lowStock.length}`;


  if (
    lowStock.length
  ) {

    message +=
      "\n\n<b>کم‌موجودی‌ها:</b>\n" +

      lowStock
        .slice(0, 20)
        .map(
          product =>
            `• ${escapeHtml(
              product.name
            )}: ${
              product.totalStock
            }`
        )
        .join("\n");
  }


  return sendMessage(

    chatId,

    message,

    mainKeyboard()
  );
}


// ============================================================
// ORDERS
// ============================================================

async function showOrders(
  chatId
) {

  const file =
    await readJsonFile(
      "data/orders.json",
      []
    );


  const orders =
    safeArray(
      file.data
    )
      .slice(-20)
      .reverse();


  if (
    orders.length === 0
  ) {

    return sendMessage(

      chatId,

      "🛒 هنوز سفارشی ثبت نشده است.",

      mainKeyboard()
    );
  }


  const message =

    "<b>🛒 آخرین سفارش‌ها</b>\n\n" +

    orders
      .map(
        order =>

          `• <b>${escapeHtml(
            order.id || "-"
          )}</b>\n` +

          `وضعیت: ${
            escapeHtml(
              order.status ||
              "pending"
            )
          }\n` +

          `مبلغ: ${
            safeNumber(
              order.total
            ).toLocaleString()
          }`
      )
      .join("\n\n");


  return sendMessage(

    chatId,

    message,

    mainKeyboard()
  );
}


// ============================================================
// CUSTOMERS
// ============================================================

async function showCustomers(
  chatId
) {

  const file =
    await readJsonFile(
      "data/customers.json",
      []
    );


  const customers =
    safeArray(
      file.data
    );


  let message =

    "<b>👥 مشتریان</b>\n\n" +

    `تعداد مشتریان: ${
      customers.length
    }`;


  if (
    customers.length
  ) {

    message +=
      "\n\n" +

      customers
        .slice(-30)
        .reverse()
        .map(
          customer =>

            `• ${escapeHtml(
              customer.name ||
              customer.username ||
              "بدون نام"
            )}` +
            (
              customer.phone
                ? ` — ${escapeHtml(
                    customer.phone
                  )}`
                : ""
            )
        )
        .join("\n");
  }


  return sendMessage(

    chatId,

    message,

    mainKeyboard()
  );
}


// ============================================================
// DISCOUNTS
// ============================================================

async function showDiscounts(
  chatId
) {

  const file =
    await readJsonFile(
      "data/discounts.json",
      []
    );


  const discounts =
    safeArray(
      file.data
    );


  let message =
    "<b>🏷️ تخفیف‌ها</b>\n\n";


  if (
    discounts.length === 0
  ) {

    message +=
      "هنوز تخفیفی ثبت نشده است.";

  } else {

    message +=
      discounts
        .map(
          discount =>
            `• ${escapeHtml(
              discount.code ||
              discount.name ||
              discount.id
            )} — ${
              discount.active === false
                ? "غیرفعال"
                : "فعال"
            }`
        )
        .join("\n");
  }


  return sendMessage(

    chatId,

    message,

    mainKeyboard()
  );
}


// ============================================================
// SETTINGS
// ============================================================

async function showSettings(
  chatId
) {

  const file =
    await readJsonFile(
      "data/settings.json",
      JSON_DEFAULTS[
        "data/settings.json"
      ]
    );


  const settings =
    file.data;


  return sendMessage(

    chatId,

    "<b>⚙️ تنظیمات</b>\n\n" +

    `واحد پول: ${
      escapeHtml(
        settings.currency ||
        "IRR"
      )
    }\n` +

    `هزینه ارسال: ${
      safeNumber(
        settings.shippingCost
      ).toLocaleString()
    }\n` +

    `حد ارسال رایگان: ${
      safeNumber(
        settings.freeShippingThreshold
      ).toLocaleString()
    }\n\n` +

    `🌐 ${SITE_URL}`,

    mainKeyboard()
  );
}


// ============================================================
// ORDERS API
// ============================================================

async function createOrder(
  body
) {

  const productsFile =
    await getProductsFile();


  const products =
    productsFile.data.map(
      normalizeProduct
    );


  const items =
    safeArray(
      body.items
    );


  if (
    items.length === 0
  ) {

    throw new Error(
      "Order items are empty"
    );
  }


  let subtotal = 0;

  const orderItems = [];


  for (
    const item of items
  ) {

    const product =
      products.find(
        p =>
          p.id ===
          item.productId
      );


    if (!product) {

      throw new Error(
        `Product not found: ${item.productId}`
      );
    }


    const quantity =
      Math.max(
        1,
        parseInt(
          item.quantity ||
          1,
          10
        )
      );


    let variant = null;

    let unitPrice =
      product.finalPrice;


    if (
      item.variantId
    ) {

      variant =
        product.variants.find(
          v =>
            v.id ===
            item.variantId
        );


      if (!variant) {

        throw new Error(
          "Variant not found"
        );
      }


      if (
        variant.stock <
        quantity
      ) {

        throw new Error(
          "Insufficient variant stock"
        );
      }


      unitPrice =
        variant.price ||
        unitPrice;

    } else {

      if (
        product.totalStock <
        quantity
      ) {

        throw new Error(
          "Insufficient stock"
        );
      }
    }


    const total =
      unitPrice *
      quantity;


    subtotal +=
      total;


    orderItems.push({

      productId:
        product.id,

      variantId:
        variant
          ? variant.id
          : null,

      name:
        product.name,

      quantity,

      unitPrice,

      total
    });
  }


  // کاهش موجودی
  for (
    const item of
    orderItems
  ) {

    const product =
      products.find(
        p =>
          p.id ===
          item.productId
      );


    if (
      item.variantId
    ) {

      const variant =
        product.variants.find(
          v =>
            v.id ===
            item.variantId
        );


      variant.stock -=
        item.quantity;

    } else {

      product.stock =
        Math.max(
          0,
          product.stock -
            item.quantity
        );
    }


    normalizeProduct(
      product
    );
  }


  const settingsFile =
    await readJsonFile(
      "data/settings.json",
      JSON_DEFAULTS[
        "data/settings.json"
      ]
    );


  const shippingCost =
    body.shippingCost !==
    undefined

      ? safeNumber(
          body.shippingCost
        )

      : (
          settingsFile.data
            .freeShippingThreshold > 0 &&
          subtotal >=
            settingsFile.data
              .freeShippingThreshold

            ? 0

            : safeNumber(
                settingsFile.data
                  .shippingCost
              )
        );


  const order = {

    id:
      generateId("ORD"),

    items:
      orderItems,

    subtotal,

    shipping:
      shippingCost,

    total:
      subtotal +
      shippingCost,

    status:
      "pending",

    customer:
      body.customer ||
      {},

    createdAt:
      nowISO(),

    updatedAt:
      nowISO()
  };


  const ordersFile =
    await readJsonFile(
      "data/orders.json",
      []
    );


  ordersFile.data.push(
    order
  );


  // اول موجودی
  await saveProductsFile(

    products,

    productsFile.sha,

    `Reserve stock for order ${order.id}`
  );


  await syncIndexes(
    products
  );


  // سپس سفارش
  await writeJsonFile(

    "data/orders.json",

    ordersFile.data,

    `Create order ${order.id}`,

    ordersFile.sha
  );


  return order;
}


// ============================================================
// API ACTIONS
// ============================================================

async function handleApiAction(
  action,
  body,
  event
) {

  switch (action) {

    // --------------------------------------------------------
    // PRODUCTS
    // --------------------------------------------------------

    case "products.list": {

      const file =
        await getProductsFile();

      return file.data.map(
        normalizeProduct
      );
    }


    case "products.get":

      return getProduct(
        body.productId
      );


    case "products.create":

      return createProduct(
        body.product ||
        body
      );


    case "products.update":

      return updateProduct(

        body.productId,

        body.changes ||
        body.product ||
        {}
      );


    case "products.delete":

      return deleteProduct(
        body.productId
      );


    case "products.stock.update": {

      const product =
        await getProduct(
          body.productId
        );


      if (!product) {

        throw new Error(
          "Product not found"
        );
      }


      if (
        body.variantId
      ) {

        const variant =
          product.variants.find(
            v =>
              v.id ===
              body.variantId
          );


        if (!variant) {

          throw new Error(
            "Variant not found"
          );
        }


        variant.stock =
          Math.max(
            0,
            safeNumber(
              body.stock
            )
          );


        return updateProduct(

          product.id,

          {
            variants:
              product.variants
          }
        );
      }


      return updateProduct(

        product.id,

        {
          stock:
            Math.max(
              0,
              safeNumber(
                body.stock
              )
            )
        }
      );
    }


    case "products.price.update":

      return updateProduct(

        body.productId,

        {

          price:
            safeNumber(
              body.price
            ),

          compareAtPrice:
            safeNumber(
              body.compareAtPrice ??
              body.price
            )
        }
      );


    case "products.status.update":

      return updateProduct(

        body.productId,

        {
          active:
            body.active !== false
        }
      );


    // --------------------------------------------------------
    // CATEGORIES
    // --------------------------------------------------------

    case "categories.list": {

      const file =
        await getCategoriesFile();

      return file.data;
    }


    case "categories.create":

      return createCategory(
        body
      );


    // --------------------------------------------------------
    // VARIANTS
    // --------------------------------------------------------

    case "variants.list": {

      const file =
        await readJsonFile(
          "data/variants.json",
          []
        );

      return file.data;
    }


    // --------------------------------------------------------
    // INVENTORY
    // --------------------------------------------------------

    case "inventory.list": {

      const file =
        await readJsonFile(
          "data/inventory.json",
          []
        );

      return file.data;
    }


    // --------------------------------------------------------
    // ORDERS
    // --------------------------------------------------------

    case "orders.list": {

      const file =
        await readJsonFile(
          "data/orders.json",
          []
        );

      return file.data;
    }


    case "orders.get": {

      const file =
        await readJsonFile(
          "data/orders.json",
          []
        );


      return (
        file.data.find(
          order =>
            order.id ===
            body.orderId
        ) ||
        null
      );
    }


    case "orders.create":

      return createOrder(
        body
      );


    // --------------------------------------------------------
    // CUSTOMERS
    // --------------------------------------------------------

    case "customers.list": {

      const file =
        await readJsonFile(
          "data/customers.json",
          []
        );

      return file.data;
    }


    // --------------------------------------------------------
    // DISCOUNTS
    // --------------------------------------------------------

    case "discounts.list": {

      const file =
        await readJsonFile(
          "data/discounts.json",
          []
        );

      return file.data;
    }


    case "discounts.validate": {

      const file =
        await readJsonFile(
          "data/discounts.json",
          []
        );


      const code =
        safeText(
          body.code
        ).toLowerCase();


      return (
        file.data.find(
          discount =>
            safeText(
              discount.code
            ).toLowerCase() ===
            code &&
            discount.active !== false
        ) ||
        null
      );
    }


    // --------------------------------------------------------
    // SETTINGS
    // --------------------------------------------------------

    case "settings.get": {

      const file =
        await readJsonFile(

          "data/settings.json",

          JSON_DEFAULTS[
            "data/settings.json"
          ]
        );


      return file.data;
    }


    case "settings.update": {

      const file =
        await readJsonFile(

          "data/settings.json",

          JSON_DEFAULTS[
            "data/settings.json"
          ]
        );


      const settings = {

        ...file.data,

        ...(body.settings || body),

        updatedAt:
          nowISO()
      };


      await writeJsonFile(

        "data/settings.json",

        settings,

        "Update settings",

        file.sha
      );


      return settings;
    }


    default:

      throw new Error(
        `Unknown action: ${action}`
      );
  }
}


// ============================================================
// MESSAGE HANDLER
// ============================================================

async function handleMessage(
  message,
  event
) {

  const chatId =
    message?.chat?.id;


  if (
    chatId ===
    undefined ||
    chatId ===
    null
  ) {

    return;
  }


  if (
    !isAdminRequest(
      chatId,
      event
    )
  ) {

    return sendMessage(
      chatId,
      "⛔ شما دسترسی مدیریت ندارید."
    );
  }


  // عکس
  if (
    await handlePhoto(
      chatId,
      message
    )
  ) {

    return;
  }


  // Wizard
  if (
    await handleWizardText(
      chatId,
      message
    )
  ) {

    return;
  }


  // منوی اصلی
  const handled =
    await handleMainMenu(
      chatId,
      message
    );


  if (handled) {
    return;
  }


  // اگر هیچ چیز شناخته نشد
  return sendMainMenu(
    chatId
  );
}


// ============================================================
// NETLIFY HANDLER
// ============================================================

exports.handler =
  async function(event) {

    try {

      // CORS
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


      // Health check
      if (
        event.httpMethod ===
        "GET"
      ) {

        return jsonResponse(

          200,

          {

            ok: true,

            service:
              "HamedShop API",

            version:
              API_VERSION,

            site:
              SITE_URL
          }
        );
      }


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
        parseJsonBody(
          event
        );


      // ======================================================
      // API REQUEST
      // ======================================================

      if (
        body.action
      ) {

        const result =
          await handleApiAction(

            body.action,

            body,

            event
          );


        return jsonResponse(

          200,

          {

            ok: true,

            result
          }
        );
      }


      // ======================================================
      // BALE CALLBACK
      // ======================================================

      if (
        body.callback_query
      ) {

        await handleCallbackQuery(

          body.callback_query,

          event
        );


        return jsonResponse(

          200,

          {
            ok: true
          }
        );
      }


      // ======================================================
      // BALE MESSAGE
      // ======================================================

      if (
        body.message
      ) {

        await handleMessage(

          body.message,

          event
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

          ignored: true
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
            String(error)
        }
      );
    }
  };
