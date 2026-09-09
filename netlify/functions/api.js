// ============================================================
// HamedShop - Netlify API
// Bale Bot <-> Netlify <-> GitHub
// ============================================================

// ============================================================
// CONFIG
// ============================================================

const GITHUB_OWNER = "khanepaz";
const GITHUB_REPO = "hamed_test1";
const GITHUB_BRANCH = "main";

const SITE_URL = "https://khanepaz.github.io/hamed_test1/";
const API_VERSION = "1.0.0";


// ============================================================
// TEMPORARY BALE WIZARD STATE
// ============================================================
//
// این Map فقط برای حفظ رفتار فعلی ربات استفاده می‌شود.
// در مرحله بعد می‌توانیم Wizard را کاملاً persistent کنیم.
//
// ============================================================

const pendingProducts = new Map();


// ============================================================
// COMMON
// ============================================================

function nowISO() {
  return new Date().toISOString();
}


function generateId(prefix = "ID") {
  const time = Date.now().toString(36);
  const random = Math.random()
    .toString(36)
    .substring(2, 8);

  return `${prefix}_${time}_${random}`;
}


function generateProductId() {
  const now = new Date();

  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const sec = String(now.getSeconds()).padStart(2, "0");

  const random = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0");

  return `P${yy}${mm}${dd}${hh}${min}${sec}${random}`;
}


function safeNumber(value, defaultValue = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return defaultValue;
  }

  return number;
}


function positiveNumber(value, fieldName = "value") {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} must be a valid non-negative number`);
  }

  return number;
}


function parseJsonBody(event) {
  if (!event || !event.body) {
    return {};
  }

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


function textResponse(statusCode, text) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    },
    body: text
  };
}


// ============================================================
// BALE API
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


// ============================================================
// GITHUB API
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
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
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


// ============================================================
// GITHUB PATH HELPER
// ============================================================

function githubContentPath(path) {

  return (
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`
  );
}


// ============================================================
// READ JSON FILE FROM GITHUB
// ============================================================

async function readJsonFile(path, defaultValue = []) {

  try {

    const result = await githubRequest(
      `${githubContentPath(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`
    );

    if (!result.content) {
      return {
        data: defaultValue,
        sha: result.sha
      };
    }

    const decoded = Buffer
      .from(
        result.content.replace(/\n/g, ""),
        "base64"
      )
      .toString("utf8");

    let data;

    try {
      data = JSON.parse(decoded);
    } catch {
      throw new Error(
        `Invalid JSON in ${path}`
      );
    }

    return {
      data,
      sha: result.sha
    };

  } catch (error) {

    if (
      error.message.includes("GitHub API Error 404")
    ) {

      return {
        data: defaultValue,
        sha: null
      };
    }

    throw error;
  }
}


// ============================================================
// WRITE JSON FILE TO GITHUB
// ============================================================

async function writeJsonFile(
  path,
  data,
  message,
  sha = null
) {

  const jsonContent = JSON.stringify(
    data,
    null,
    2
  );

  const base64Content = Buffer
    .from(jsonContent, "utf8")
    .toString("base64");

  const body = {

    message,

    content: base64Content,

    branch: GITHUB_BRANCH
  };

  if (sha) {
    body.sha = sha;
  }

  return githubRequest(
    githubContentPath(path),
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


async function saveProductsFile(
  products,
  sha,
  message = "Update products"
) {

  return writeJsonFile(
    "data/products.json",
    products,
    message,
    sha
  );
}


function normalizeProduct(product) {

  const price =
    safeNumber(product.price, 0);

  const compareAtPrice =
    safeNumber(
      product.compareAtPrice,
      price
    );

  const variants =
    Array.isArray(product.variants)
      ? product.variants
      : [];

  let totalStock =
    safeNumber(product.totalStock, 0);

  if (variants.length > 0) {

    totalStock = variants.reduce(
      (sum, variant) =>
        sum +
        safeNumber(variant.stock, 0),
      0
    );
  }

  if (
    variants.length === 0 &&
    product.stock !== undefined
  ) {

    totalStock =
      safeNumber(product.stock, 0);
  }

  const discountAmount =
    Math.max(
      compareAtPrice - price,
      0
    );

  let discountPercent = 0;

  if (
    compareAtPrice > 0 &&
    price < compareAtPrice
  ) {

    discountPercent =
      Math.round(
        (
          discountAmount /
          compareAtPrice
        ) *
        100
      );
  }

  return {

    ...product,

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

    price,

    compareAtPrice,

    discountPercent,

    discountAmount,

    finalPrice:
      price,

    currency:
      product.currency ||
      "IRR",

    variants,

    attributes:
      product.attributes &&
      typeof product.attributes === "object"
        ? product.attributes
        : {},

    stock:
      totalStock,

    totalStock,

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
  };
}


// ============================================================
// GET PRODUCT
// ============================================================

async function getProduct(productId) {

  const file =
    await getProductsFile();

  const product =
    file.data.find(
      item =>
        item.id === productId
    );

  return product
    ? normalizeProduct(product)
    : null;
}


// ============================================================
// CREATE PRODUCT
// ============================================================

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

  await saveProductsFile(
    file.data,
    file.sha,
    `Add product ${normalized.id}`
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

  const index =
    file.data.findIndex(
      item =>
        item.id === productId
    );

  if (index === -1) {
    throw new Error(
      "Product not found"
    );
  }

  const updated =
    normalizeProduct({
      ...file.data[index],
      ...changes,
      id: productId,
      updatedAt: nowISO()
    });

  file.data[index] =
    updated;

  await saveProductsFile(
    file.data,
    file.sha,
    `Update product ${productId}`
  );

  return updated;
}


// ============================================================
// DELETE PRODUCT
// ============================================================

async function deleteProduct(
  productId
) {

  const file =
    await getProductsFile();

  const index =
    file.data.findIndex(
      item =>
        item.id === productId
    );

  if (index === -1) {
    throw new Error(
      "Product not found"
    );
  }

  const deleted =
    file.data[index];

  file.data.splice(index, 1);

  await saveProductsFile(
    file.data,
    file.sha,
    `Delete product ${productId}`
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


async function createCategory(category) {

  const file =
    await getCategoriesFile();

  const newCategory = {

    id:
      category.id ||
      generateId("cat"),

    name:
      category.name ||
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

  file.data.push(newCategory);

  await writeJsonFile(
    "data/categories.json",
    file.data,
    `Add category ${newCategory.id}`,
    file.sha
  );

  return newCategory;
}


// ============================================================
// VARIANTS
// ============================================================

async function getVariantsFile() {

  return readJsonFile(
    "data/variants.json",
    []
  );
}


async function syncVariantsFromProducts(
  products
) {

  const variants = [];

  for (const product of products) {

    if (
      !Array.isArray(product.variants)
    ) {
      continue;
    }

    for (const variant of product.variants) {

      variants.push({

        ...variant,

        productId:
          product.id,

        updatedAt:
          nowISO()
      });
    }
  }

  return variants;
}


// ============================================================
// DISCOUNTS
// ============================================================

async function getDiscountsFile() {

  return readJsonFile(
    "data/discounts.json",
    []
  );
}


function isDiscountActive(discount) {

  if (discount.active === false) {
    return false;
  }

  const now =
    Date.now();

  if (discount.startsAt) {

    if (
      now <
      new Date(discount.startsAt).getTime()
    ) {
      return false;
    }
  }

  if (discount.endsAt) {

    if (
      now >
      new Date(discount.endsAt).getTime()
    ) {
      return false;
    }
  }

  if (
    discount.usageLimit !== undefined &&
    safeNumber(discount.usedCount, 0) >=
      safeNumber(discount.usageLimit, 0)
  ) {
    return false;
  }

  return true;
}


// ============================================================
// APPLY DISCOUNT
// ============================================================

async function calculateDiscount(
  code,
  subtotal
) {

  if (!code) {

    return {
      discount: null,
      amount: 0
    };
  }

  const file =
    await getDiscountsFile();

  const discount =
    file.data.find(
      item =>
        String(item.code || "")
          .toUpperCase() ===
        String(code)
          .trim()
          .toUpperCase()
    );

  if (!discount) {

    throw new Error(
      "کد تخفیف معتبر نیست"
    );
  }

  if (!isDiscountActive(discount)) {

    throw new Error(
      "کد تخفیف فعال نیست"
    );
  }

  if (
    discount.minOrderAmount &&
    subtotal <
      safeNumber(
        discount.minOrderAmount
      )
  ) {

    throw new Error(
      "مبلغ سفارش برای استفاده از این تخفیف کافی نیست"
    );
  }

  let amount = 0;

  if (
    discount.type === "percent"
  ) {

    amount =
      Math.floor(
        subtotal *
        (
          safeNumber(
            discount.value
          ) /
          100
        )
      );

  } else {

    amount =
      safeNumber(
        discount.value
      );
  }

  amount =
    Math.min(
      amount,
      subtotal
    );

  return {
    discount,
    amount
  };
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


async function getOrder(orderId) {

  const file =
    await getOrdersFile();

  return (
    file.data.find(
      order =>
        order.id === orderId
    ) || null
  );
}


// ============================================================
// CUSTOMERS
// ============================================================

async function getCustomersFile() {

  return readJsonFile(
    "data/customers.json",
    []
  );
}


async function findOrCreateCustomer(
  customerData
) {

  const file =
    await getCustomersFile();

  const phone =
    customerData.phone
      ? String(customerData.phone).trim()
      : null;

  let customer =
    file.data.find(
      item =>
        phone &&
        item.phone === phone
    );

  if (customer) {

    customer.name =
      customerData.name ||
      customer.name;

    customer.address =
      customerData.address ||
      customer.address;

    customer.updatedAt =
      nowISO();

  } else {

    customer = {

      id:
        generateId("CUS"),

      name:
        customerData.name ||
        "",

      phone,

      address:
        customerData.address ||
        "",

      createdAt:
        nowISO(),

      updatedAt:
        nowISO()
    };

    file.data.push(
      customer
    );
  }

  await writeJsonFile(
    "data/customers.json",
    file.data,
    `Update customer ${customer.id}`,
    file.sha
  );

  return customer;
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


async function syncInventory() {

  const productsFile =
    await getProductsFile();

  const inventory =
    productsFile.data.map(
      product => ({

        productId:
          product.id,

        productName:
          product.name,

        stock:
          safeNumber(
            product.totalStock ??
            product.stock,
            0
          ),

        variants:
          Array.isArray(
            product.variants
          )
            ? product.variants.map(
                variant => ({

                  variantId:
                    variant.id,

                  name:
                    variant.name ||
                    "",

                  sku:
                    variant.sku ||
                    "",

                  stock:
                    safeNumber(
                      variant.stock,
                      0
                    )
                })
              )
            : [],

        updatedAt:
          nowISO()
      })
    );

  return inventory;
}


// ============================================================
// SETTINGS
// ============================================================

async function getSettingsFile() {

  return readJsonFile(
    "data/settings.json",
    {
      shopName: "HamedShop",
      currency: "IRR",
      shippingCost: 0,
      freeShippingThreshold: 0,
      active: true
    }
  );
}


// ============================================================
// IMAGE UPLOAD
// ============================================================

async function uploadImageToGitHub(
  fileId,
  productId,
  imageIndex = 0
) {

  console.log(
    "Getting Bale file information..."
  );

  const fileInfo =
    await baleRequest(
      "getFile",
      {
        file_id: fileId
      }
    );

  if (
    !fileInfo ||
    !fileInfo.file_path
  ) {

    throw new Error(
      "Bale file_path not found"
    );
  }

  console.log(
    "Bale file path:",
    fileInfo.file_path
  );

  const token =
    process.env.BALE_BOT_TOKEN;

  const fileUrl =
    `https://tapi.bale.ai/file/bot${token}/${fileInfo.file_path}`;

  console.log(
    "Downloading image from Bale..."
  );

  const imageResponse =
    await fetch(fileUrl);

  if (!imageResponse.ok) {

    throw new Error(
      `Could not download image from Bale: ${imageResponse.status}`
    );
  }

  const imageBuffer =
    await imageResponse.arrayBuffer();

  const base64Image =
    Buffer
      .from(imageBuffer)
      .toString("base64");

  const suffix =
    imageIndex === 0
      ? ""
      : `-${imageIndex}`;

  const githubPath =
    `images/${productId}${suffix}.jpg`;

  console.log(
    "Uploading image to GitHub:",
    githubPath
  );

  const result =
    await githubRequest(
      githubContentPath(githubPath),
      {
        method: "PUT",

        body: JSON.stringify({

          message:
            `Add product image ${productId}`,

          content:
            base64Image,

          branch:
            GITHUB_BRANCH
        })
      }
    );

  console.log(
    "Image uploaded successfully."
  );

  return {

    path:
      githubPath,

    sha:
      result.content?.sha
  };
}


// ============================================================
// BALE MAIN MENU
// ============================================================

async function sendMainMenu(
  chatId
) {

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        "🛍️ به HamedShop خوش آمدید\n\n" +
        "لطفاً یک گزینه را انتخاب کنید:",

      reply_markup: {

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
                "🌐 مشاهده سایت"
            }
          ]

        ],

        resize_keyboard:
          true
      }
    }
  );
}


// ============================================================
// CATEGORY MENU
// ============================================================

async function sendCategoryMenu(
  chatId
) {

  try {

    const file =
      await getCategoriesFile();

    const categories =
      Array.isArray(file.data)
        ? file.data.filter(
            item =>
              item.active !== false
          )
        : [];

    if (categories.length > 0) {

      const rows = [];

      for (
        let i = 0;
        i < categories.length;
        i += 2
      ) {

        const row = [];

        const first =
          categories[i];

        if (first) {

          row.push({

            text:
              `${first.icon || "📦"} ${first.name}`,

            callback_data:
              `category_id:${first.id}`
          });
        }

        const second =
          categories[i + 1];

        if (second) {

          row.push({

            text:
              `${second.icon || "📦"} ${second.name}`,

            callback_data:
              `category_id:${second.id}`
          });
        }

        rows.push(row);
      }

      await baleRequest(
        "sendMessage",
        {

          chat_id:
            chatId,

          text:
            "📂 لطفاً دسته‌بندی محصول را انتخاب کنید:",

          reply_markup: {

            inline_keyboard:
              rows
          }
        }
      );

      return;
    }

  } catch (error) {

    console.error(
      "CATEGORY LOAD ERROR:",
      error
    );
  }


  // ----------------------------------------------------------
  // FALLBACK
  // ----------------------------------------------------------

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        "📂 لطفاً دسته‌بندی محصول را انتخاب کنید:",

      reply_markup: {

        inline_keyboard: [

          [
            {
              text:
                "👕 پوشاک",

              callback_data:
                "category:👕 پوشاک"
            },

            {
              text:
                "👟 کفش",

              callback_data:
                "category:👟 کفش"
            }
          ],

          [
            {
              text:
                "👜 کیف",

              callback_data:
                "category:👜 کیف"
            },

            {
              text:
                "💄 لوازم آرایشی",

              callback_data:
                "category:💄 لوازم آرایشی"
            }
          ],

          [
            {
              text:
                "🏠 لوازم خانه",

              callback_data:
                "category:🏠 لوازم خانه"
            },

            {
              text:
                "📱 دیجیتال",

              callback_data:
                "category:📱 دیجیتال"
            }
          ]

        ]
      }
    }
  );
}


// ============================================================
// PRODUCT CONFIRMATION
// ============================================================

async function sendProductConfirmation(
  chatId,
  product
) {

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        `📦 اطلاعات محصول\n\n` +
        `📌 نام: ${product.name}\n` +
        `📂 دسته‌بندی: ${product.category}\n\n` +
        `آیا محصول ثبت شود؟`,

      reply_markup: {

        inline_keyboard: [

          [

            {
              text:
                "✅ ثبت نهایی",

              callback_data:
                "confirm_product"
            },

            {
              text:
                "❌ لغو",

              callback_data:
                "cancel_product"
            }

          ]

        ]
      }
    }
  );
}


// ============================================================
// ADMIN CHECK
// ============================================================
//
// برای عملیات مدیریتی API می‌توانیم بعداً ADMIN_API_KEY
// را در Netlify Environment Variables تعریف کنیم.
//
// عملیات عمومی مثل products.list و orders.create
// نیاز به این کلید ندارند.
//
// ============================================================

function isAdminRequest(event) {

  const configuredKey =
    process.env.ADMIN_API_KEY;

  if (!configuredKey) {

    return false;
  }

  const receivedKey =
    event.headers?.["x-admin-key"] ||
    event.headers?.["X-Admin-Key"];

  return (
    receivedKey &&
    receivedKey === configuredKey
  );
}


// ============================================================
// PUBLIC API ACTIONS
// ============================================================

async function handleApiAction(
  event,
  body
) {

  const action =
    body.action ||
    event.queryStringParameters?.action ||
    "";


  // ==========================================================
  // PRODUCTS LIST
  // ==========================================================

  if (
    action === "products.list"
  ) {

    const file =
      await getProductsFile();

    const products =
      file.data
        .map(normalizeProduct)
        .filter(
          product =>
            product.active !== false
        );

    return jsonResponse(
      200,
      {
        ok: true,

        action,

        products
      }
    );
  }


  // ==========================================================
  // PRODUCT GET
  // ==========================================================

  if (
    action === "products.get"
  ) {

    const productId =
      body.productId ||
      event.queryStringParameters?.productId;

    if (!productId) {

      return jsonResponse(
        400,
        {
          ok: false,
          error:
            "productId is required"
        }
      );
    }

    const product =
      await getProduct(productId);

    if (!product) {

      return jsonResponse(
        404,
        {
          ok: false,
          error:
            "Product not found"
        }
      );
    }

    return jsonResponse(
      200,
      {
        ok: true,
        product
      }
    );
  }


  // ==========================================================
  // CATEGORIES LIST
  // ==========================================================

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
          Array.isArray(file.data)
            ? file.data.filter(
                item =>
                  item.active !== false
              )
            : []
      }
    );
  }


  // ==========================================================
  // VARIANTS LIST
  // ==========================================================

  if (
    action === "variants.list"
  ) {

    const productsFile =
      await getProductsFile();

    const variants =
      await syncVariantsFromProducts(
        productsFile.data
      );

    return jsonResponse(
      200,
      {
        ok: true,
        variants
      }
    );
  }


  // ==========================================================
  // DISCOUNTS VALIDATE
  // ==========================================================

  if (
    action === "discounts.validate"
  ) {

    const code =
      body.code;

    const subtotal =
      positiveNumber(
        body.subtotal || 0,
        "subtotal"
      );

    const result =
      await calculateDiscount(
        code,
        subtotal
      );

    return jsonResponse(
      200,
      {
        ok: true,

        code,

        discount:
          result.discount,

        amount:
          result.amount,

        finalAmount:
          subtotal -
          result.amount
      }
    );
  }


  // ==========================================================
  // SETTINGS
  // ==========================================================

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


  // ==========================================================
  // INVENTORY
  // ==========================================================

  if (
    action === "inventory.list"
  ) {

    const inventory =
      await syncInventory();

    return jsonResponse(
      200,
      {
        ok: true,

        inventory
      }
    );
  }


  // ==========================================================
  // ORDERS LIST
  // ==========================================================

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


  // ==========================================================
  // ORDER GET
  // ==========================================================

  if (
    action === "orders.get"
  ) {

    const orderId =
      body.orderId ||
      event.queryStringParameters?.orderId;

    if (!orderId) {

      return jsonResponse(
        400,
        {
          ok: false,
          error:
            "orderId is required"
        }
      );
    }

    const order =
      await getOrder(orderId);

    if (!order) {

      return jsonResponse(
        404,
        {
          ok: false,
          error:
            "Order not found"
        }
      );
    }

    return jsonResponse(
      200,
      {
        ok: true,
        order
      }
    );
  }


  // ==========================================================
  // ORDER CREATE
  // ==========================================================

  if (
    action === "orders.create"
  ) {

    return createOrder(
      body
    );
  }


  // ==========================================================
  // PRODUCT CREATE
  // ==========================================================

  if (
    action === "products.create"
  ) {

    if (!isAdminRequest(event)) {

      return jsonResponse(
        403,
        {
          ok: false,
          error:
            "Admin authorization required"
        }
      );
    }

    const product =
      await createProduct(
        body.product || body
      );

    return jsonResponse(
      201,
      {
        ok: true,
        product
      }
    );
  }


  // ==========================================================
  // PRODUCT UPDATE
  // ==========================================================

  if (
    action === "products.update"
  ) {

    if (!isAdminRequest(event)) {

      return jsonResponse(
        403,
        {
          ok: false,
          error:
            "Admin authorization required"
        }
      );
    }

    const product =
      await updateProduct(
        body.productId,
        body.changes ||
          {}
      );

    return jsonResponse(
      200,
      {
        ok: true,
        product
      }
    );
  }


  // ==========================================================
  // PRODUCT DELETE
  // ==========================================================

  if (
    action === "products.delete"
  ) {

    if (!isAdminRequest(event)) {

      return jsonResponse(
        403,
        {
          ok: false,
          error:
            "Admin authorization required"
        }
      );
    }

    const product =
      await deleteProduct(
        body.productId
      );

    return jsonResponse(
      200,
      {
        ok: true,
        deleted:
          product
      }
    );
  }


  // ==========================================================
  // CATEGORY CREATE
  // ==========================================================

  if (
    action === "categories.create"
  ) {

    if (!isAdminRequest(event)) {

      return jsonResponse(
        403,
        {
          ok: false,
          error:
            "Admin authorization required"
        }
      );
    }

    const category =
      await createCategory(
        body.category ||
        body
      );

    return jsonResponse(
      201,
      {
        ok: true,
        category
      }
    );
  }


  // ==========================================================
  // UNKNOWN ACTION
  // ==========================================================

  return jsonResponse(
    400,
    {
      ok: false,

      error:
        "Unknown API action",

      action
    }
  );
}


// ============================================================
// CREATE ORDER
// ============================================================

async function createOrder(
  body
) {

  const itemsInput =
    Array.isArray(body.items)
      ? body.items
      : [];

  if (
    itemsInput.length === 0
  ) {

    return jsonResponse(
      400,
      {
        ok: false,

        error:
          "Order must contain at least one item"
      }
    );
  }


  const productsFile =
    await getProductsFile();


  const products =
    productsFile.data
      .map(normalizeProduct);


  const orderItems = [];

  let subtotal = 0;


  // ----------------------------------------------------------
  // Validate products and stock
  // ----------------------------------------------------------

  for (
    const inputItem of itemsInput
  ) {

    const product =
      products.find(
        item =>
          item.id ===
          inputItem.productId
      );

    if (!product) {

      return jsonResponse(
        400,
        {
          ok: false,

          error:
            `Product not found: ${inputItem.productId}`
        }
      );
    }


    const quantity =
      Math.floor(
        safeNumber(
          inputItem.quantity,
          0
        )
      );


    if (
      quantity <= 0
    ) {

      return jsonResponse(
        400,
        {
          ok: false,

          error:
            "Invalid quantity"
        }
      );
    }


    let unitPrice =
      safeNumber(
        product.finalPrice ??
        product.price,
        0
      );


    let variant =
      null;


    // --------------------------------------------------------
    // Variant
    // --------------------------------------------------------

    if (
      inputItem.variantId &&
      Array.isArray(
        product.variants
      )
    ) {

      variant =
        product.variants.find(
          item =>
            item.id ===
            inputItem.variantId
        );

      if (!variant) {

        return jsonResponse(
          400,
          {
            ok: false,

            error:
              `Variant not found: ${inputItem.variantId}`
          }
        );
      }


      unitPrice =
        safeNumber(
          variant.price,
          unitPrice
        );


      const variantStock =
        safeNumber(
          variant.stock,
          0
        );


      if (
        variantStock <
        quantity
      ) {

        return jsonResponse(
          400,
          {
            ok: false,

            error:
              `موجودی ${product.name} کافی نیست`
          }
        );
      }

    } else {

      const productStock =
        safeNumber(
          product.totalStock ??
          product.stock,
          0
        );


      if (
        productStock <
        quantity
      ) {

        return jsonResponse(
          400,
          {
            ok: false,

            error:
              `موجودی ${product.name} کافی نیست`
          }
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

      variantName:
        variant
          ? (
              variant.name ||
              ""
            )
          : "",

      quantity,

      unitPrice,

      discount:
        0,

      total
    });
  }


  // ----------------------------------------------------------
  // Discount
  // ----------------------------------------------------------

  let discountAmount = 0;
  let discountData = null;


  if (
    body.discountCode
  ) {

    try {

      const discountResult =
        await calculateDiscount(
          body.discountCode,
          subtotal
        );

      discountAmount =
        discountResult.amount;

      discountData =
        discountResult.discount;

    } catch (error) {

      return jsonResponse(
        400,
        {
          ok: false,

          error:
            error.message
        }
      );
    }
  }


  // ----------------------------------------------------------
  // Shipping
  // ----------------------------------------------------------

  const settingsFile =
    await getSettingsFile();

  const settings =
    settingsFile.data || {};


  let shipping =
    safeNumber(
      body.shipping,
      safeNumber(
        settings.shippingCost,
        0
      )
    );


  const freeShippingThreshold =
    safeNumber(
      settings.freeShippingThreshold,
      0
    );


  if (
    freeShippingThreshold > 0 &&
    subtotal >=
      freeShippingThreshold
  ) {

    shipping = 0;
  }


  const total =
    Math.max(
      subtotal -
      discountAmount +
      shipping,
      0
    );


  // ----------------------------------------------------------
  // Customer
  // ----------------------------------------------------------

  let customer = null;


  if (
    body.customer &&
    typeof body.customer === "object"
  ) {

    customer =
      await findOrCreateCustomer(
        body.customer
      );
  }


  // ----------------------------------------------------------
  // Order
  // ----------------------------------------------------------

  const order = {

    id:
      generateId("ORD"),

    customerId:
      customer
        ? customer.id
        : null,

    customer:
      customer ||
      body.customer ||
      null,

    items:
      orderItems,

    subtotal,

    discount:
      discountAmount,

    discountCode:
      discountData
        ? discountData.code
        : null,

    shipping,

    total,

    currency:
      settings.currency ||
      "IRR",

    notes:
      body.notes ||
      "",

    status:
      "pending",

    paymentStatus:
      "unpaid",

    createdAt:
      nowISO(),

    updatedAt:
      nowISO()
  };


  // ----------------------------------------------------------
  // Update stock
  // ----------------------------------------------------------

  const originalProducts =
    JSON.parse(
      JSON.stringify(
        productsFile.data
      )
    );


  for (
    const item of orderItems
  ) {

    const product =
      productsFile.data.find(
        p =>
          p.id ===
          item.productId
      );

    if (!product) {
      continue;
    }


    if (
      item.variantId &&
      Array.isArray(
        product.variants
      )
    ) {

      const variant =
        product.variants.find(
          v =>
            v.id ===
            item.variantId
        );

      if (variant) {

        variant.stock =
          Math.max(
            safeNumber(
              variant.stock,
              0
            ) -
            item.quantity,
            0
          );
      }

      product.totalStock =
        product.variants.reduce(
          (
            sum,
            v
          ) =>
            sum +
            safeNumber(
              v.stock,
              0
            ),
          0
        );

      product.stock =
        product.totalStock;

    } else {

      const currentStock =
        safeNumber(
          product.totalStock ??
          product.stock,
          0
        );

      product.totalStock =
        Math.max(
          currentStock -
          item.quantity,
          0
        );

      product.stock =
        product.totalStock;
    }


    product.updatedAt =
      nowISO();
  }


  // ----------------------------------------------------------
  // Save product stock
  // ----------------------------------------------------------

  try {

    const productsWrite =
      await saveProductsFile(
        productsFile.data,
        productsFile.sha,
        `Create order ${order.id} - update inventory`
      );


    // --------------------------------------------------------
    // Save order
    // --------------------------------------------------------

    const ordersFile =
      await getOrdersFile();


    ordersFile.data.push(
      order
    );


    try {

      await writeJsonFile(
        "data/orders.json",
        ordersFile.data,
        `Create order ${order.id}`,
        ordersFile.sha
      );

    } catch (orderError) {

      // ------------------------------------------------------
      // ROLLBACK STOCK
      // ------------------------------------------------------

      try {

        const latestProducts =
          await getProductsFile();

        await saveProductsFile(
          originalProducts,
          latestProducts.sha,
          `Rollback inventory for failed order ${order.id}`
        );

      } catch (rollbackError) {

        console.error(
          "ROLLBACK ERROR:",
          rollbackError
        );
      }


      throw orderError;
    }


    return jsonResponse(
      201,
      {
        ok: true,

        order
      }
    );

  } catch (error) {

    console.error(
      "ORDER CREATE ERROR:",
      error
    );

    return jsonResponse(
      500,
      {
        ok: false,

        error:
          error.message
      }
    );
  }
}


// ============================================================
// BALE CALLBACK HANDLER
// ============================================================

async function handleCallbackQuery(
  callback
) {

  const chatId =
    callback.message?.chat?.id;

  const data =
    callback.data || "";

  const userId =
    callback.from?.id ||
    chatId;


  if (!chatId) {

    return {
      statusCode: 200,
      body: "ok"
    };
  }


  // ==========================================================
  // CATEGORY BY ID
  // ==========================================================

  if (
    data.startsWith(
      "category_id:"
    )
  ) {

    const categoryId =
      data.replace(
        "category_id:",
        ""
      );


    const categoriesFile =
      await getCategoriesFile();


    const category =
      categoriesFile.data.find(
        item =>
          item.id ===
          categoryId
      );


    const product =
      pendingProducts.get(
        userId
      );


    if (!product) {

      await baleRequest(
        "sendMessage",
        {
          chat_id:
            chatId,

          text:
            "❌ اطلاعات محصول پیدا نشد.\n" +
            "لطفاً دوباره محصول را اضافه کنید."
        }
      );

      return {
        statusCode: 200,
        body: "ok"
      };
    }


    product.category =
      category
        ? (
            `${category.icon || ""} ${category.name}`
              .trim()
          )
        : categoryId;


    product.categoryId =
      categoryId;


    pendingProducts.set(
      userId,
      product
    );


    await baleRequest(
      "answerCallbackQuery",
      {
        callback_query_id:
          callback.id
      }
    );


    await sendProductConfirmation(
      chatId,
      product
    );


    return {
      statusCode: 200,
      body: "ok"
    };
  }


  // ==========================================================
  // OLD CATEGORY CALLBACK
  // ==========================================================

  if (
    data.startsWith(
      "category:"
    )
  ) {

    const category =
      data.replace(
        "category:",
        ""
      );


    const product =
      pendingProducts.get(
        userId
      );


    if (!product) {

      await baleRequest(
        "sendMessage",
        {

          chat_id:
            chatId,

          text:
            "❌ اطلاعات محصول پیدا نشد.\n" +
            "لطفاً دوباره محصول را اضافه کنید."
        }
      );

      return {
        statusCode: 200,
        body: "ok"
      };
    }


    product.category =
      category;


    product.categoryId =
      null;


    pendingProducts.set(
      userId,
      product
    );


    await baleRequest(
      "answerCallbackQuery",
      {
        callback_query_id:
          callback.id
      }
    );


    await sendProductConfirmation(
      chatId,
      product
    );


    return {
      statusCode: 200,
      body: "ok"
    };
  }


  // ==========================================================
  // CONFIRM PRODUCT
  // ==========================================================

  if (
    data ===
    "confirm_product"
  ) {

    const product =
      pendingProducts.get(
        userId
      );


    if (!product) {

      await baleRequest(
        "sendMessage",
        {

          chat_id:
            chatId,

          text:
            "❌ اطلاعات محصول پیدا نشد.\n" +
            "لطفاً دوباره محصول را اضافه کنید."
        }
      );

      return {
        statusCode: 200,
        body: "ok"
      };
    }


    await baleRequest(
      "answerCallbackQuery",
      {

        callback_query_id:
          callback.id,

        text:
          "در حال ثبت محصول..."
      }
    );


    try {

      // ------------------------------------------------------
      // Generate ID
      // ------------------------------------------------------

      const productId =
        generateProductId();


      // ------------------------------------------------------
      // Upload image
      // ------------------------------------------------------

      const image =
        await uploadImageToGitHub(
          product.photoId,
          productId
        );


      // ------------------------------------------------------
      // Rich product
      // ------------------------------------------------------

      const savedProduct =
        normalizeProduct({

          id:
            productId,

          name:
            product.name,

          category:
            product.category,

          categoryId:
            product.categoryId ||
            null,

          description:
            "",

          image:
            image.path,

          images:
            [
              image.path
            ],

          price:
            safeNumber(
              product.price,
              0
            ),

          compareAtPrice:
            safeNumber(
              product.compareAtPrice,
              safeNumber(
                product.price,
                0
              )
            ),

          discountPercent:
            0,

          discountAmount:
            0,

          finalPrice:
            safeNumber(
              product.price,
              0
            ),

          currency:
            "IRR",

          variants:
            Array.isArray(
              product.variants
            )
              ? product.variants
              : [],

          attributes:
            product.attributes ||
            {},

          stock:
            safeNumber(
              product.stock,
              0
            ),

          totalStock:
            safeNumber(
              product.stock,
              0
            ),

          active:
            true,

          featured:
            false,

          tags:
            [],

          createdAt:
            nowISO(),

          updatedAt:
            nowISO()
        });


      // ------------------------------------------------------
      // Save products
      // ------------------------------------------------------

      const productsFile =
        await getProductsFile();


      productsFile.data.push(
        savedProduct
      );


      await saveProductsFile(
        productsFile.data,
        productsFile.sha,
        `Add product ${savedProduct.id}`
      );


      // ------------------------------------------------------
      // Clean temporary product
      // ------------------------------------------------------

      pendingProducts.delete(
        userId
      );


      // ------------------------------------------------------
      // Success
      // ------------------------------------------------------

      await baleRequest(
        "sendMessage",
        {

          chat_id:
            chatId,

          text:
            `✅ محصول با موفقیت ثبت شد.\n\n` +

            `📌 نام: ${savedProduct.name}\n` +

            `📂 دسته‌بندی: ${savedProduct.category}\n` +

            `💰 قیمت: ${savedProduct.price}\n` +

            `📦 موجودی: ${savedProduct.totalStock}\n` +

            `🆔 شناسه: ${savedProduct.id}`
        }
      );

    } catch (error) {

      console.error(
        "PRODUCT SAVE ERROR:",
        error
      );


      await baleRequest(
        "sendMessage",
        {

          chat_id:
            chatId,

          text:
            "❌ هنگام ثبت محصول خطایی رخ داد.\n\n" +
            `جزئیات: ${error.message}`
        }
      );
    }


    return {
      statusCode: 200,
      body: "ok"
    };
  }


  // ==========================================================
  // CANCEL PRODUCT
  // ==========================================================

  if (
    data ===
    "cancel_product"
  ) {

    pendingProducts.delete(
      userId
    );


    await baleRequest(
      "answerCallbackQuery",
      {

        callback_query_id:
          callback.id,

        text:
          "لغو شد"
      }
    );


    await baleRequest(
      "sendMessage",
      {

        chat_id:
          chatId,

        text:
          "❌ ثبت محصول لغو شد."
      }
    );


    return {
      statusCode: 200,
      body: "ok"
    };
  }


  return {
    statusCode: 200,
    body: "ok"
  };
}


// ============================================================
// BALE MESSAGE HANDLER
// ============================================================

async function handleMessage(
  message
) {

  const chatId =
    message.chat?.id;

  const userId =
    message.from?.id ||
    chatId;


  if (!chatId) {

    return {
      statusCode: 200,
      body: "ok"
    };
  }


  const text =
    message.text || "";


  // ==========================================================
  // START
  // ==========================================================

  if (
    text === "/start"
  ) {

    await sendMainMenu(
      chatId
    );

    return {
      statusCode: 200,
      body: "ok"
    };
  }


  // ==========================================================
  // ADD PRODUCT
  // ==========================================================

  if (
    text ===
    "➕ افزودن محصول"
  ) {

    await baleRequest(
      "sendMessage",
      {

        chat_id:
          chatId,

        text:
          "📷 لطفاً عکس محصول را ارسال کنید و نام محصول را در کپشن عکس بنویسید."
      }
    );


    return {
      statusCode: 200,
      body: "ok"
    };
  }


  // ==========================================================
  // VIEW PRODUCTS
  // ==========================================================

  if (
    text ===
    "📦 مشاهده محصولات"
  ) {

    try {

      const file =
        await getProductsFile();


      const products =
        file.data;


      if (
        products.length === 0
      ) {

        await baleRequest(
          "sendMessage",
          {

            chat_id:
              chatId,

            text:
              "📦 هنوز محصولی ثبت نشده است."
          }
        );

      } else {

        const visible =
          products
            .slice(-20)
            .reverse();


        let response =
          "📦 آخرین محصولات:\n\n";


        for (
          const product of visible
        ) {

          response +=
            `🔹 ${product.name}\n` +
            `📂 ${product.category || "-"}\n` +
            `🆔 ${product.id}\n\n`;
        }


        await baleRequest(
          "sendMessage",
          {

            chat_id:
              chatId,

            text:
              response
          }
        );
      }

    } catch (error) {

      console.error(
        "VIEW PRODUCTS ERROR:",
        error
      );


      await baleRequest(
        "sendMessage",
        {

          chat_id:
            chatId,

          text:
            "❌ خطا در دریافت محصولات."
        }
      );
    }


    return {
      statusCode: 200,
      body: "ok"
    };
  }


  // ==========================================================
  // WEBSITE
  // ==========================================================

  if (
    text ===
    "🌐 مشاهده سایت"
  ) {

    await baleRequest(
      "sendMessage",
      {

        chat_id:
          chatId,

        text:
          `🌐 سایت HamedShop:\n\n${SITE_URL}`
      }
    );


    return {
      statusCode: 200,
      body: "ok"
    };
  }


  // ==========================================================
  // PRODUCT PHOTO
  // ==========================================================

  if (
    message.photo &&
    message.photo.length > 0
  ) {

    const photos =
      message.photo;


    const largestPhoto =
      photos[
        photos.length - 1
      ];


    const photoId =
      largestPhoto.file_id;


    const caption =
      (
        message.caption ||
        ""
      ).trim();


    if (!caption) {

      await baleRequest(
        "sendMessage",
        {

          chat_id:
            chatId,

          text:
            "❌ لطفاً نام محصول را در کپشن عکس بنویسید."
        }
      );


      return {
        statusCode: 200,
        body: "ok"
      };
    }


    const product = {

      name:
        caption,

      photoId:
        photoId,

      category:
        null,

      categoryId:
        null,

      price:
        0,

      compareAtPrice:
        0,

      stock:
        0,

      variants:
        [],

      attributes:
        {}
    };


    pendingProducts.set(
      userId,
      product
    );


    await sendCategoryMenu(
      chatId
    );


    return {
      statusCode: 200,
      body: "ok"
    };
  }


  // ==========================================================
  // UNKNOWN MESSAGE
  // ==========================================================

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        "لطفاً از منوی اصلی یکی از گزینه‌ها را انتخاب کنید."
    }
  );


  return {
    statusCode: 200,
    body: "ok"
  };
}


// ============================================================
// MAIN HANDLER
// ============================================================

exports.handler = async (
  event
) => {

  try {

    // ========================================================
    // CORS PREFLIGHT
    // ========================================================

    if (
      event.httpMethod ===
      "OPTIONS"
    ) {

      return {
        statusCode: 204,

        headers: {

          "Access-Control-Allow-Origin":
            "*",

          "Access-Control-Allow-Headers":
            "Content-Type, X-Admin-Key",

          "Access-Control-Allow-Methods":
            "GET, POST, PUT, DELETE, OPTIONS"
        },

        body: ""
      };
    }


    // ========================================================
    // GET
    // ========================================================

    if (
      event.httpMethod ===
      "GET"
    ) {

      const action =
        event.queryStringParameters?.action;


      // ------------------------------------------------------
      // API status
      // ------------------------------------------------------

      if (!action) {

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
              Boolean(
                process.env.BALE_BOT_TOKEN
              ),

            github:
              Boolean(
                process.env.GITHUB_TOKEN
              ),

            site:
              SITE_URL,

            timestamp:
              nowISO()
          }
        );
      }


      return handleApiAction(
        event,
        {}
      );
    }


    // ========================================================
    // ONLY POST AFTER THIS
    // ========================================================

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


    // ========================================================
    // PARSE BODY
    // ========================================================

    const body =
      parseJsonBody(
        event
      );


    // ========================================================
    // API ACTION
    // ========================================================
    //
    // اگر body.action وجود داشته باشد، درخواست API است.
    //
    // در غیر این صورت update بله است.
    //
    // ========================================================

    if (
      body &&
      body.action
    ) {

      return handleApiAction(
        event,
        body
      );
    }


    // ========================================================
    // BALE UPDATE
    // ========================================================

    const update =
      body;


    console.log(
      "BALE UPDATE:",
      JSON.stringify(update)
    );


    // ========================================================
    // CALLBACK QUERY
    // ========================================================

    if (
      update.callback_query
    ) {

      return handleCallbackQuery(
        update.callback_query
      );
    }


    // ========================================================
    // MESSAGE
    // ========================================================

    if (
      update.message
    ) {

      return handleMessage(
        update.message
      );
    }


    // ========================================================
    // OTHER BALE UPDATES
    // ========================================================

    return {
      statusCode: 200,
      body: "ok"
    };

  } catch (error) {

    console.error(
      "MAIN ERROR:",
      error
    );


    return jsonResponse(
      500,
      {

        ok: false,

        error:
          error.message,

        timestamp:
          nowISO()
      }
    );
  }
};
