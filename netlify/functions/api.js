
// ============================================================
// HamedShop - Bale Bot + GitHub + Store API
// Version: Unified Product Management
// ============================================================
//
// GitHub:
//   data/products.json
//   data/categories.json
//   data/discounts.json
//   data/orders.json
//   images/{productId}.jpg
//
// Environment Variables:
//   BALE_BOT_TOKEN
//   GITHUB_TOKEN
//
// GitHub:
//   owner = khanepaz
//   repo  = hamed_test1
//   branch = main
//
// ============================================================


const GITHUB_OWNER = "khanepaz";
const GITHUB_REPO = "hamed_test1";
const GITHUB_BRANCH = "main";


// ============================================================
// Temporary conversation state
// ============================================================

const pendingProducts = new Map();


// ============================================================
// Bale API
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

  const result = await response.json();

  if (!result.ok) {
    throw new Error(
      `Bale API Error: ${JSON.stringify(result)}`
    );
  }

  return result.result;
}


// ============================================================
// GitHub API
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
// Generic GitHub JSON Reader
// ============================================================

async function getJsonFile(filePath, defaultValue = []) {

  try {

    const result = await githubRequest(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`
    );

    const content = Buffer
      .from(
        result.content.replace(/\n/g, ""),
        "base64"
      )
      .toString("utf8");

    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = defaultValue;
    }

    return {
      data: parsed,
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
// Generic GitHub JSON Writer
// ============================================================

async function saveJsonFile(
  filePath,
  data,
  commitMessage,
  sha = null
) {

  const jsonContent =
    JSON.stringify(data, null, 2);

  const base64Content =
    Buffer
      .from(jsonContent, "utf8")
      .toString("base64");

  const body = {

    message: commitMessage,

    content: base64Content,

    branch: GITHUB_BRANCH
  };

  if (sha) {
    body.sha = sha;
  }

  return await githubRequest(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
    {
      method: "PUT",
      body: JSON.stringify(body)
    }
  );
}


// ============================================================
// Product ID
// ============================================================

function generateProductId() {

  const now = new Date();

  const yy =
    String(now.getFullYear()).slice(-2);

  const mm =
    String(now.getMonth() + 1).padStart(2, "0");

  const dd =
    String(now.getDate()).padStart(2, "0");

  const hh =
    String(now.getHours()).padStart(2, "0");

  const min =
    String(now.getMinutes()).padStart(2, "0");

  const sec =
    String(now.getSeconds()).padStart(2, "0");

  const random =
    Math.floor(Math.random() * 100)
      .toString()
      .padStart(2, "0");

  return `P${yy}${mm}${dd}${hh}${min}${sec}${random}`;
}


// ============================================================
// Category ID
// ============================================================

function generateCategoryId(name) {

  const normalized =
    String(name)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\u0600-\u06FF-]/g, "");

  return (
    normalized ||
    `category-${Date.now()}`
  );
}


// ============================================================
// Discount ID
// ============================================================

function generateDiscountId() {

  return (
    "D" +
    Date.now().toString(36) +
    Math.floor(Math.random() * 1000)
  ).toUpperCase();
}


// ============================================================
// Order ID
// ============================================================

function generateOrderId() {

  const now = new Date();

  const yy =
    String(now.getFullYear()).slice(-2);

  const mm =
    String(now.getMonth() + 1).padStart(2, "0");

  const dd =
    String(now.getDate()).padStart(2, "0");

  const random =
    Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, "0");

  return `O${yy}${mm}${dd}${random}`;
}


// ============================================================
// Upload image to GitHub
// ============================================================

async function uploadImageToGitHub(
  fileId,
  productId
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

  const githubPath =
    `images/${productId}.jpg`;

  console.log(
    "Uploading image to GitHub:",
    githubPath
  );

  const result =
    await githubRequest(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}`,
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

  return {
    path: githubPath,
    sha: result.content?.sha
  };
}


// ============================================================
// Delete GitHub file
// ============================================================

async function deleteGitHubFile(
  filePath,
  commitMessage
) {

  try {

    const result =
      await githubRequest(
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`
      );

    await githubRequest(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
      {
        method: "DELETE",

        body: JSON.stringify({

          message:
            commitMessage,

          sha:
            result.sha,

          branch:
            GITHUB_BRANCH
        })
      }
    );

  } catch (error) {

    if (
      error.message.includes(
        "GitHub API Error 404"
      )
    ) {
      return;
    }

    throw error;
  }
}


// ============================================================
// Products
// ============================================================

async function getProducts() {

  const result =
    await getJsonFile(
      "data/products.json",
      []
    );

  return result.data;
}


async function saveProducts(products) {

  const file =
    await getJsonFile(
      "data/products.json",
      []
    );

  await saveJsonFile(
    "data/products.json",
    products,
    "Update products",
    file.sha
  );
}


// ============================================================
// Categories
// ============================================================

async function getCategories() {

  const result =
    await getJsonFile(
      "data/categories.json",
      []
    );

  return Array.isArray(result.data)
    ? result.data
    : [];
}


async function saveCategories(categories) {

  const file =
    await getJsonFile(
      "data/categories.json",
      []
    );

  await saveJsonFile(
    "data/categories.json",
    categories,
    "Update categories",
    file.sha
  );
}


// ============================================================
// Discounts
// ============================================================

async function getDiscounts() {

  const result =
    await getJsonFile(
      "data/discounts.json",
      []
    );

  return Array.isArray(result.data)
    ? result.data
    : [];
}


async function saveDiscounts(discounts) {

  const file =
    await getJsonFile(
      "data/discounts.json",
      []
    );

  await saveJsonFile(
    "data/discounts.json",
    discounts,
    "Update discounts",
    file.sha
  );
}


// ============================================================
// Orders
// ============================================================

async function getOrders() {

  const result =
    await getJsonFile(
      "data/orders.json",
      []
    );

  return Array.isArray(result.data)
    ? result.data
    : [];
}


async function saveOrders(orders) {

  const file =
    await getJsonFile(
      "data/orders.json",
      []
    );

  await saveJsonFile(
    "data/orders.json",
    orders,
    "Update orders",
    file.sha
  );
}


// ============================================================
// Main menu
// ============================================================

async function sendMainMenu(chatId) {

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        "🛍️ HamedShop\n\nلطفاً یک گزینه را انتخاب کنید:",

      reply_markup: {

        keyboard: [

          [
            {
              text:
                "➕ افزودن محصول"
            },

            {
              text:
                "📦 مدیریت محصولات"
            }
          ],

          [
            {
              text:
                "📂 مدیریت دسته‌بندی"
            },

            {
              text:
                "🏷️ مدیریت تخفیف"
            }
          ],

          [
            {
              text:
                "⭐ محصولات ویژه"
            },

            {
              text:
                "🧾 سفارش‌ها"
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
// Cancel / Back button
// ============================================================

async function sendBackMenu(chatId) {

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        "برای ادامه یکی از گزینه‌های زیر را انتخاب کنید.",

      reply_markup: {

        keyboard: [

          [
            {
              text:
                "🏠 منوی اصلی"
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
// Category menu
// ============================================================

async function sendCategoryMenu(
  chatId,
  includeManagement = false
) {

  const categories =
    await getCategories();

  const keyboard = [];

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
          `${first.icon || "📂"} ${first.name}`,

        callback_data:
          `category:${first.id}`
      });
    }

    const second =
      categories[i + 1];

    if (second) {

      row.push({

        text:
          `${second.icon || "📂"} ${second.name}`,

        callback_data:
          `category:${second.id}`
      });
    }

    if (row.length) {
      keyboard.push(row);
    }
  }

  if (includeManagement) {

    keyboard.push([

      {
        text:
          "➕ افزودن دسته‌بندی",

        callback_data:
          "category_manage:add"
      },

      {
        text:
          "✏️ ویرایش",

        callback_data:
          "category_manage:edit"
      }

    ]);

    keyboard.push([

      {
        text:
          "🗑 حذف",

        callback_data:
          "category_manage:delete"
      }

    ]);
  }

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        categories.length
          ? "📂 دسته‌بندی را انتخاب کنید:"
          : "📂 هنوز دسته‌بندی‌ای ثبت نشده است.",

      reply_markup:
        {
          inline_keyboard:
            keyboard
        }
    }
  );
}


// ============================================================
// Default categories
// ============================================================

async function ensureDefaultCategories() {

  const categories =
    await getCategories();

  if (categories.length > 0) {
    return categories;
  }

  const defaults = [

    {
      id: "clothing",
      name: "پوشاک",
      icon: "👕",
      active: true,
      createdAt:
        new Date().toISOString()
    },

    {
      id: "shoes",
      name: "کفش",
      icon: "👟",
      active: true,
      createdAt:
        new Date().toISOString()
    },

    {
      id: "bags",
      name: "کیف",
      icon: "👜",
      active: true,
      createdAt:
        new Date().toISOString()
    },

    {
      id: "beauty",
      name: "لوازم آرایشی",
      icon: "💄",
      active: true,
      createdAt:
        new Date().toISOString()
    },

    {
      id: "home",
      name: "لوازم خانه",
      icon: "🏠",
      active: true,
      createdAt:
        new Date().toISOString()
    },

    {
      id: "digital",
      name: "دیجیتال",
      icon: "📱",
      active: true,
      createdAt:
        new Date().toISOString()
    }

  ];

  await saveCategories(
    defaults
  );

  return defaults;
}


// ============================================================
// Product variant parser
//
// Example:
//
// رنگ: مشکی, سفید
// سایز: 40, 41, 42
//
// ============================================================

function parseVariantAttributes(text) {

  const attributes = {};

  const lines =
    String(text || "")
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

  for (const line of lines) {

    const separator =
      line.indexOf(":");

    if (separator === -1) {
      continue;
    }

    const key =
      line
        .slice(0, separator)
        .trim();

    const valuesText =
      line
        .slice(separator + 1)
        .trim();

    if (!key || !valuesText) {
      continue;
    }

    const values =
      valuesText
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);

    if (values.length > 0) {
      attributes[key] = [
        ...new Set(values)
      ];
    }
  }

  return attributes;
}


// ============================================================
// Generate variant combinations
// ============================================================

function generateVariantCombinations(
  attributes
) {

  const keys =
    Object.keys(attributes);

  if (!keys.length) {
    return [];
  }

  let combinations = [
    {}
  ];

  for (const key of keys) {

    const values =
      attributes[key];

    const next = [];

    for (
      const combination
      of combinations
    ) {

      for (
        const value
        of values
      ) {

        next.push({

          ...combination,

          [key]:
            value
        });
      }
    }

    combinations = next;
  }

  return combinations.map(
    (attributes, index) => ({

      id:
        `V${String(index + 1).padStart(3, "0")}`,

      attributes,

      stock:
        0,

      enabled:
        true

    })
  );
}


// ============================================================
// Variant display
// ============================================================

function variantLabel(variant) {

  if (
    !variant ||
    !variant.attributes
  ) {
    return "ترکیب";
  }

  return Object.entries(
    variant.attributes
  )
    .map(
      ([key, value]) =>
        `${key}: ${value}`
    )
    .join(" | ");
}


// ============================================================
// Variant inventory keyboard
// ============================================================

function buildInventoryKeyboard(
  variants
) {

  const keyboard = [];

  for (
    let i = 0;
    i < variants.length;
    i++
  ) {

    const variant =
      variants[i];

    keyboard.push([

      {
        text:
          `➖ ${variantLabel(variant)}`,

        callback_data:
          `stock:minus:${i}`
      },

      {
        text:
          `📦 ${variant.stock}`,

        callback_data:
          `stock:info:${i}`
      },

      {
        text:
          `➕ ${variantLabel(variant)}`,

        callback_data:
          `stock:plus:${i}`
      }

    ]);
  }

  keyboard.push([

    {
      text:
        "✅ تأیید موجودی",

      callback_data:
        "stock:done"
    }

  ]);

  return keyboard;
}


// ============================================================
// Send inventory editor
// ============================================================

async function sendInventoryEditor(
  chatId,
  userId
) {

  const product =
    pendingProducts.get(userId);

  if (!product) {

    await baleRequest(
      "sendMessage",
      {

        chat_id:
          chatId,

        text:
          "❌ اطلاعات محصول پیدا نشد."

      }
    );

    return;
  }

  const text =
    product.variants?.length

      ? "📊 موجودی تنوع‌های محصول\n\nبرای افزایش یا کاهش موجودی از دکمه‌ها استفاده کنید.\n\n⚠️ نبودن یک ترکیب با صفر بودن موجودی متفاوت است."

      : "📊 این محصول تنوع ندارد.";

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text,

      reply_markup:
        {
          inline_keyboard:
            buildInventoryKeyboard(
              product.variants || []
            )
        }
    }
  );
}


// ============================================================
// Price menu
// ============================================================

async function sendPriceMenu(
  chatId
) {

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        "💰 قیمت محصول را به صورت عددی و بدون جداکننده وارد کنید.\n\nمثال:\n1500000"

    }
  );
}


// ============================================================
// Discount menu
// ============================================================

async function sendDiscountMenu(
  chatId
) {

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        "🏷️ نوع تخفیف را انتخاب کنید:",

      reply_markup: {

        inline_keyboard: [

          [

            {
              text:
                "بدون تخفیف",

              callback_data:
                "discount_product:none"
            }

          ],

          [

            {
              text:
                "درصدی",

              callback_data:
                "discount_product:percent"
            },

            {
              text:
                "مبلغ ثابت",

              callback_data:
                "discount_product:fixed"
            }

          ]

        ]
      }
    }
  );
}


// ============================================================
// Features menu
// ============================================================

async function sendFeaturesMenu(
  chatId
) {

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        "⭐ ویژگی‌های محصول را انتخاب کنید. می‌توانید چند مورد را همزمان فعال کنید:",

      reply_markup: {

        inline_keyboard: [

          [

            {
              text:
                "⭐ ویژه",

              callback_data:
                "feature:featured"
            },

            {
              text:
                "🔥 پرفروش",

              callback_data:
                "feature:bestseller"
            }

          ],

          [

            {
              text:
                "🆕 جدید",

              callback_data:
                "feature:new"
            },

            {
              text:
                "🏷️ تخفیف‌دار",

              callback_data:
                "feature:discounted"
            }

          ],

          [

            {
              text:
                "⏭ ادامه",

              callback_data:
                "feature:done"
            }

          ]

        ]
      }
    }
  );
}


// ============================================================
// Product confirmation
// ============================================================

async function sendProductConfirmation(
  chatId,
  product
) {

  const variants =
    product.variants || [];

  let variantText =
    "بدون تنوع";

  if (variants.length) {

    variantText =
      variants
        .map(
          v =>
            `• ${variantLabel(v)} → ${v.stock}`
        )
        .join("\n");
  }

  const discount =
    product.discount;

  let discountText =
    "بدون تخفیف";

  if (
    discount &&
    discount.type !== "none"
  ) {

    discountText =
      discount.type === "percent"

        ? `${discount.value}%`

        : `${discount.value} تومان`;
  }

  const features =
    [];

  if (product.featured)
    features.push("⭐ ویژه");

  if (product.bestseller)
    features.push("🔥 پرفروش");

  if (product.isNew)
    features.push("🆕 جدید");

  if (product.discounted)
    features.push("🏷️ تخفیف‌دار");

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:

        `📦 خلاصه محصول\n\n` +

        `📌 نام: ${product.name}\n` +

        `📂 دسته‌بندی: ${product.categoryName}\n\n` +

        `🎨 تنوع‌ها:\n${variantText}\n\n` +

        `💰 قیمت: ${Number(product.price || 0).toLocaleString()} تومان\n` +

        `🏷️ تخفیف: ${discountText}\n\n` +

        `⭐ ویژگی‌ها: ${features.length ? features.join("، ") : "بدون ویژگی"}\n\n` +

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
// Product management menu
// ============================================================

async function sendProductManagementMenu(
  chatId
) {

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        "📦 مدیریت محصولات:",

      reply_markup: {

        inline_keyboard: [

          [

            {
              text:
                "📋 فهرست محصولات",

              callback_data:
                "products:list"
            }

          ],

          [

            {
              text:
                "📊 مدیریت موجودی",

              callback_data:
                "products:stock"
            }

          ]

        ]
      }
    }
  );
}


// ============================================================
// Product list
// ============================================================

async function sendProductList(
  chatId
) {

  const products =
    await getProducts();

  if (!products.length) {

    await baleRequest(
      "sendMessage",
      {

        chat_id:
          chatId,

        text:
          "📦 هنوز محصولی ثبت نشده است."

      }
    );

    return;
  }

  const rows = [];

  for (
    const product
    of products.slice(0, 50)
  ) {

    rows.push([

      {
        text:
          `📦 ${product.name}`,

        callback_data:
          `product:view:${product.id}`
      }

    ]);
  }

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        `📦 محصولات ثبت‌شده: ${products.length}\n\nیک محصول را انتخاب کنید:`,

      reply_markup:
        {
          inline_keyboard:
            rows
        }
    }
  );
}


// ============================================================
// Product details
// ============================================================

async function sendProductDetails(
  chatId,
  productId
) {

  const products =
    await getProducts();

  const product =
    products.find(
      p =>
        p.id === productId
    );

  if (!product) {

    await baleRequest(
      "sendMessage",
      {

        chat_id:
          chatId,

        text:
          "❌ محصول پیدا نشد."

      }
    );

    return;
  }

  const variants =
    product.variants || [];

  const totalStock =
    variants.length

      ? variants.reduce(
          (sum, v) =>
            sum +
            Number(v.stock || 0),
          0
        )

      : Number(
          product.stock || 0
        );

  let text =

    `📦 ${product.name}\n\n` +

    `🆔 ${product.id}\n` +

    `📂 ${product.categoryName || product.category || "-"}\n` +

    `💰 ${Number(product.price || 0).toLocaleString()} تومان\n` +

    `📊 موجودی کل: ${totalStock}\n\n`;

  if (variants.length) {

    text +=
      "🎨 تنوع‌ها:\n\n";

    text +=
      variants
        .map(
          v =>
            `• ${variantLabel(v)} → ${v.stock}`
        )
        .join("\n");
  }

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text,

      reply_markup: {

        inline_keyboard: [

          [

            {
              text:
                "📊 موجودی",

              callback_data:
                `product_stock:${product.id}`
            }

          ],

          [

            {
              text:
                "🗑 حذف محصول",

              callback_data:
                `product_delete:${product.id}`
            }

          ]

        ]
      }
    }
  );
}


// ============================================================
// Category management menu
// ============================================================

async function sendCategoryManagementMenu(
  chatId
) {

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        "📂 مدیریت دسته‌بندی‌ها:",

      reply_markup: {

        inline_keyboard: [

          [

            {
              text:
                "➕ افزودن دسته‌بندی",

              callback_data:
                "category_manage:add"
            }

          ],

          [

            {
              text:
                "✏️ ویرایش دسته‌بندی",

              callback_data:
                "category_manage:edit"
            }

          ],

          [

            {
              text:
                "🗑 حذف دسته‌بندی",

              callback_data:
                "category_manage:delete"
            }

          ],

          [

            {
              text:
                "📋 مشاهده دسته‌بندی‌ها",

              callback_data:
                "category_manage:list"
            }

          ]

        ]
      }
    }
  );
}


// ============================================================
// Category list
// ============================================================

async function sendCategoryList(
  chatId,
  mode = "view"
) {

  const categories =
    await getCategories();

  if (!categories.length) {

    await baleRequest(
      "sendMessage",
      {

        chat_id:
          chatId,

        text:
          "📂 دسته‌بندی‌ای وجود ندارد."

      }
    );

    return;
  }

  const rows = [];

  for (
    const category
    of categories
  ) {

    rows.push([

      {

        text:
          `${category.icon || "📂"} ${category.name}`,

        callback_data:
          `category_${mode}:${category.id}`

      }

    ]);
  }

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        "📂 دسته‌بندی را انتخاب کنید:",

      reply_markup:
        {
          inline_keyboard:
            rows
        }
    }
  );
}


// ============================================================
// Discount management menu
// ============================================================

async function sendDiscountManagementMenu(
  chatId
) {

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        "🏷️ مدیریت تخفیف‌ها:",

      reply_markup: {

        inline_keyboard: [

          [

            {
              text:
                "➕ ایجاد تخفیف",

              callback_data:
                "discount_manage:add"
            }

          ],

          [

            {
              text:
                "📋 فهرست تخفیف‌ها",

              callback_data:
                "discount_manage:list"
            }

          ]

        ]
      }
    }
  );
}


// ============================================================
// Featured products
// ============================================================

async function sendFeaturedProducts(
  chatId
) {

  const products =
    await getProducts();

  const featured =
    products.filter(
      p =>
        p.featured ||
        p.bestseller ||
        p.isNew ||
        p.discounted
    );

  if (!featured.length) {

    await baleRequest(
      "sendMessage",
      {

        chat_id:
          chatId,

        text:
          "⭐ هنوز محصول ویژه‌ای تعریف نشده است."

      }
    );

    return;
  }

  const rows =
    featured.map(
      product => [

        {
          text:
            `${product.featured ? "⭐ " : ""}${product.name}`,

          callback_data:
            `product:view:${product.id}`
        }

      ]
    );

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        `⭐ محصولات ویژه\n\nتعداد: ${featured.length}`,

      reply_markup:
        {
          inline_keyboard:
            rows
        }
    }
  );
}


// ============================================================
// Orders menu
// ============================================================

async function sendOrdersMenu(
  chatId
) {

  const orders =
    await getOrders();

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        `🧾 سفارش‌ها\n\nتعداد سفارش‌ها: ${orders.length}\n\nساختار سفارش در API آماده است و سایت می‌تواند سفارش جدید ایجاد کند.`,

      reply_markup: {

        inline_keyboard: [

          [

            {
              text:
                "📋 مشاهده سفارش‌ها",

              callback_data:
                "orders:list"
            }

          ]

        ]
      }
    }
  );
}


// ============================================================
// Orders list
// ============================================================

async function sendOrdersList(
  chatId
) {

  const orders =
    await getOrders();

  if (!orders.length) {

    await baleRequest(
      "sendMessage",
      {

        chat_id:
          chatId,

        text:
          "🧾 هنوز سفارشی ثبت نشده است."

      }
    );

    return;
  }

  const rows =
    orders
      .slice(-50)
      .reverse()
      .map(
        order => [

          {

            text:
              `${order.id} - ${order.status || "pending"}`,

            callback_data:
              `order:view:${order.id}`

          }

        ]
      );

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        `🧾 تعداد سفارش‌ها: ${orders.length}`,

      reply_markup:
        {
          inline_keyboard:
            rows
        }
    }
  );
}


// ============================================================
// Product total stock
// ============================================================

function calculateProductStock(
  product
) {

  if (
    Array.isArray(product.variants) &&
    product.variants.length
  ) {

    return product.variants.reduce(
      (
        total,
        variant
      ) =>
        total +
        Number(
          variant.stock || 0
        ),
      0
    );
  }

  return Number(
    product.stock || 0
  );
}


// ============================================================
// Calculate final price
// ============================================================

function calculateFinalPrice(
  price,
  discount
) {

  const base =
    Number(price || 0);

  if (
    !discount ||
    discount.type === "none"
  ) {

    return base;
  }

  if (
    discount.type === "percent"
  ) {

    return Math.max(
      0,
      base -
      (
        base *
        Number(discount.value || 0) /
        100
      )
    );
  }

  if (
    discount.type === "fixed"
  ) {

    return Math.max(
      0,
      base -
      Number(discount.value || 0)
    );
  }

  return base;
}


// ============================================================
// Normalize old products
// ============================================================
//
// This allows products already stored using the old schema
// to continue working.
// ============================================================

function normalizeProduct(
  product
) {

  return {

    ...product,

    categoryName:
      product.categoryName ||
      product.category ||
      "",

    categoryId:
      product.categoryId ||
      "",

    variants:
      Array.isArray(product.variants)
        ? product.variants
        : [],

    price:
      Number(product.price || 0),

    discount:
      product.discount ||
      {
        type: "none",
        value: 0
      },

    featured:
      Boolean(product.featured),

    bestseller:
      Boolean(product.bestseller),

    isNew:
      Boolean(product.isNew),

    discounted:
      Boolean(
        product.discounted ||
        (
          product.discount &&
          product.discount.type !== "none"
        )
      )

  };
}


// ============================================================
// Update product inventory
// ============================================================

async function updateProductVariantStock(
  productId,
  variantIndex,
  delta
) {

  const products =
    await getProducts();

  const index =
    products.findIndex(
      p =>
        p.id === productId
    );

  if (index === -1) {
    throw new Error(
      "Product not found"
    );
  }

  const product =
    normalizeProduct(
      products[index]
    );

  if (
    !product.variants ||
    !product.variants[
      variantIndex
    ]
  ) {

    throw new Error(
      "Variant not found"
    );
  }

  const variant =
    product.variants[
      variantIndex
    ];

  const current =
    Number(
      variant.stock || 0
    );

  variant.stock =
    Math.max(
      0,
      current + Number(delta)
    );

  product.totalStock =
    calculateProductStock(
      product
    );

  product.updatedAt =
    new Date().toISOString();

  products[index] =
    product;

  await saveProducts(
    products
  );

  return product;
}


// ============================================================
// Create order
// ============================================================

async function createOrder(
  payload
) {

  if (
    !payload ||
    !Array.isArray(payload.items) ||
    payload.items.length === 0
  ) {

    throw new Error(
      "Order items are required"
    );
  }

  const products =
    await getProducts();

  const orderItems = [];

  let totalAmount =
    0;

  for (
    const requestedItem
    of payload.items
  ) {

    const product =
      products.find(
        p =>
          p.id ===
          requestedItem.productId
      );

    if (!product) {

      throw new Error(
        `Product not found: ${requestedItem.productId}`
      );
    }

    const normalized =
      normalizeProduct(
        product
      );

    const quantity =
      Math.max(
        1,
        Number(
          requestedItem.quantity || 1
        )
      );

    let selectedVariant =
      null;

    if (
      requestedItem.variantId
    ) {

      selectedVariant =
        normalized.variants.find(
          v =>
            v.id ===
            requestedItem.variantId
        );

      if (!selectedVariant) {

        throw new Error(
          `Variant not found: ${requestedItem.variantId}`
        );
      }

      if (
        Number(
          selectedVariant.stock || 0
        ) < quantity
      ) {

        throw new Error(
          `Insufficient stock for ${normalized.name}`
        );
      }

    } else if (
      normalized.variants.length
    ) {

      throw new Error(
        `Variant selection required for ${normalized.name}`
      );

    } else {

      if (
        Number(
          normalized.stock || 0
        ) < quantity
      ) {

        throw new Error(
          `Insufficient stock for ${normalized.name}`
        );
      }
    }

    const finalPrice =
      calculateFinalPrice(
        normalized.price,
        normalized.discount
      );

    const itemTotal =
      finalPrice *
      quantity;

    totalAmount +=
      itemTotal;

    orderItems.push({

      productId:
        normalized.id,

      productName:
        normalized.name,

      variantId:
        selectedVariant
          ? selectedVariant.id
          : null,

      variantAttributes:
        selectedVariant
          ? selectedVariant.attributes
          : {},

      quantity,

      unitPrice:
        finalPrice,

      totalPrice:
        itemTotal

    });
  }

  // ----------------------------------------------------------
  // Decrease stock
  // ----------------------------------------------------------

  for (
    const item
    of orderItems
  ) {

    const productIndex =
      products.findIndex(
        p =>
          p.id ===
          item.productId
      );

    const product =
      normalizeProduct(
        products[productIndex]
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

      variant.stock =
        Number(
          variant.stock || 0
        ) -
        item.quantity;

    } else {

      product.stock =
        Number(
          product.stock || 0
        ) -
        item.quantity;
    }

    product.totalStock =
      calculateProductStock(
        product
      );

    product.updatedAt =
      new Date().toISOString();

    products[productIndex] =
      product;
  }

  await saveProducts(
    products
  );

  // ----------------------------------------------------------
  // Save order
  // ----------------------------------------------------------

  const order = {

    id:
      generateOrderId(),

    status:
      "pending",

    customer:
      payload.customer || {},

    items:
      orderItems,

    totalAmount,

    currency:
      "IRR",

    createdAt:
      new Date().toISOString()

  };

  const orders =
    await getOrders();

  orders.push(
    order
  );

  await saveOrders(
    orders
  );

  return order;
}


// ============================================================
// Public API response
// ============================================================

function apiResponse(
  statusCode,
  body
) {

  return {

    statusCode,

    headers: {

      "Content-Type":
        "application/json",

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Headers":
        "Content-Type",

      "Access-Control-Allow-Methods":
        "GET,POST,OPTIONS"

    },

    body:
      JSON.stringify(body)

  };
}


// ============================================================
// Public API
// ============================================================

async function handlePublicApi(
  event
) {

  if (
    event.httpMethod === "OPTIONS"
  ) {

    return apiResponse(
      200,
      {
        ok: true
      }
    );
  }

  let payload = {};

  if (
    event.body
  ) {

    try {

      payload =
        JSON.parse(
          event.body
        );

    } catch {

      payload = {};
    }
  }

  const action =
    payload.action ||
    event.queryStringParameters?.action ||
    "";

  // ----------------------------------------------------------
  // GET PRODUCTS
  // ----------------------------------------------------------

  if (
    action === "get_products"
  ) {

    const products =
      await getProducts();

    return apiResponse(
      200,
      {

        ok:
          true,

        products:
          products.map(
            normalizeProduct
          )

      }
    );
  }


  // ----------------------------------------------------------
  // GET CATEGORIES
  // ----------------------------------------------------------

  if (
    action === "get_categories"
  ) {

    const categories =
      await getCategories();

    return apiResponse(
      200,
      {

        ok:
          true,

        categories

      }
    );
  }


  // ----------------------------------------------------------
  // GET PRODUCT
  // ----------------------------------------------------------

  if (
    action === "get_product"
  ) {

    const products =
      await getProducts();

    const product =
      products.find(
        p =>
          p.id ===
          payload.productId
      );

    if (!product) {

      return apiResponse(
        404,
        {

          ok:
            false,

          error:
            "Product not found"

        }
      );
    }

    return apiResponse(
      200,
      {

        ok:
          true,

        product:
          normalizeProduct(
            product
          )

      }
    );
  }


  // ----------------------------------------------------------
  // CREATE ORDER
  // ----------------------------------------------------------

  if (
    action === "create_order"
  ) {

    try {

      const order =
        await createOrder(
          payload
        );

      return apiResponse(
        200,
        {

          ok:
            true,

          order

        }
      );

    } catch (error) {

      return apiResponse(
        400,
        {

          ok:
            false,

          error:
            error.message

        }
      );
    }
  }


  // ----------------------------------------------------------
  // UNKNOWN ACTION
  // ----------------------------------------------------------

  return apiResponse(
    400,
    {

      ok:
        false,

      error:
        "Unknown API action"

    }
  );
}


// ============================================================
// Callback: Product category
// ============================================================

async function handleProductCategory(
  callback,
  chatId,
  userId,
  categoryId
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
          "❌ اطلاعات محصول پیدا نشد.\nلطفاً دوباره محصول را اضافه کنید."

      }
    );

    return;
  }

  const categories =
    await getCategories();

  const category =
    categories.find(
      c =>
        c.id === categoryId
    );

  if (!category) {

    await baleRequest(
      "sendMessage",
      {

        chat_id:
          chatId,

        text:
          "❌ دسته‌بندی پیدا نشد."

      }
    );

    return;
  }

  product.categoryId =
    category.id;

  product.categoryName =
    category.name;

  product.category =
    category.name;

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

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        "🎨 آیا این محصول تنوع دارد؟",

      reply_markup: {

        inline_keyboard: [

          [

            {
              text:
                "🎨 بله، تنوع دارد",

              callback_data:
                "variant:yes"
            },

            {
              text:
                "📦 بدون تنوع",

              callback_data:
                "variant:no"
            }

          ]

        ]
      }
    }
  );
}


// ============================================================
// Callback: Variant yes/no
// ============================================================

async function handleVariantChoice(
  callback,
  chatId,
  userId,
  value
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
          "❌ اطلاعات محصول پیدا نشد."

      }
    );

    return;
  }

  await baleRequest(
    "answerCallbackQuery",
    {

      callback_query_id:
        callback.id

    }
  );

  if (
    value === "no"
  ) {

    product.variants =
      [];

    product.stock =
      0;

    pendingProducts.set(
      userId,
      product
    );

    await baleRequest(
      "sendMessage",
      {

        chat_id:
          chatId,

        text:
          "📦 موجودی اولیه محصول را وارد کنید.\n\nاگر فعلاً موجودی ندارید، عدد 0 را وارد کنید."

      }
    );

    product.step =
      "simple_stock";

    pendingProducts.set(
      userId,
      product
    );

    return;
  }

  product.step =
    "variants";

  pendingProducts.set(
    userId,
    product
  );

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:
        "🎨 ویژگی‌های محصول را وارد کنید.\n\nمثال:\n\nرنگ: مشکی, سفید\nسایز: 40, 41, 42\n\nهر ویژگی را در یک خط بنویسید."

    }
  );
}


// ============================================================
// Callback: Stock buttons
// ============================================================

async function handleStockCallback(
  callback,
  chatId,
  userId,
  action,
  index
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
          "❌ اطلاعات محصول پیدا نشد."

      }
    );

    return;
  }

  if (
    action === "plus"
  ) {

    const variant =
      product.variants[
        index
      ];

    if (variant) {

      variant.stock =
        Number(
          variant.stock || 0
        ) + 1;
    }
  }


  if (
    action === "minus"
  ) {

    const variant =
      product.variants[
        index
      ];

    if (variant) {

      variant.stock =
        Math.max(
          0,
          Number(
            variant.stock || 0
          ) - 1
        );
    }
  }


  if (
    action === "info"
  ) {

    const variant =
      product.variants[
        index
      ];

    if (variant) {

      await baleRequest(
        "answerCallbackQuery",
        {

          callback_query_id:
            callback.id,

          text:
            `${variantLabel(variant)} | موجودی: ${variant.stock}`

        }
      );

      return;
    }
  }

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

  if (
    action !== "info"
  ) {

    await sendInventoryEditor(
      chatId,
      userId
    );
  }
}


// ============================================================
// Product discount callback
// ============================================================

async function handleProductDiscount(
  callback,
  chatId,
  userId,
  type
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
          "❌ اطلاعات محصول پیدا نشد."

      }
    );

    return;
  }

  await baleRequest(
    "answerCallbackQuery",
    {

      callback_query_id:
        callback.id
    }
  );

  if (
    type === "none"
  ) {

    product.discount = {

      type:
        "none",

      value:
        0

    };

    product.discounted =
      false;

    pendingProducts.set(
      userId,
      product
    );

    await sendFeaturesMenu(
      chatId
    );

    return;
  }

  product.discountStep =
    type;

  product.step =
    "discount_value";

  pendingProducts.set(
    userId,
    product
  );

  await baleRequest(
    "sendMessage",
    {

      chat_id:
        chatId,

      text:

        type === "percent"

          ? "🏷️ درصد تخفیف را وارد کنید.\nمثال: 20"

          : "🏷️ مبلغ تخفیف را به تومان وارد کنید.\nمثال: 300000"

    }
  );
}


// ============================================================
// Feature callback
// ============================================================

async function handleFeatureCallback(
  callback,
  chatId,
  userId,
  feature
) {

  const product =
    pendingProducts.get(
      userId
    );

  if (!product) {

    return;
  }

  await baleRequest(
    "answerCallbackQuery",
    {
      callback_query_id:
        callback.id
    }
  );

  if (
    feature === "done"
  ) {

    await sendProductConfirmation(
      chatId,
      product
    );

    return;
  }

  if (
    feature === "featured"
  ) {
    product.featured =
      !product.featured;
  }

  if (
    feature === "bestseller"
  ) {
    product.bestseller =
      !product.bestseller;
  }

  if (
    feature === "new"
  ) {
    product.isNew =
      !product.isNew;
  }

  if (
    feature === "discounted"
  ) {
    product.discounted =
      !product.discounted;
  }

  pendingProducts.set(
    userId,
    product
  );

  await sendFeaturesMenu(
    chatId
  );
}


// ============================================================
// Main handler
// ============================================================

exports.handler =
  async (event) => {

    try {

      // --------------------------------------------------------
      // Public API requests
      // --------------------------------------------------------

      const isApiRequest =
        event.httpMethod === "GET" &&
        (
          event.queryStringParameters?.action
        );

      if (
        isApiRequest
      ) {

        return await handlePublicApi(
          event
        );
      }


      if (
        event.httpMethod === "OPTIONS"
      ) {

        return apiResponse(
          200,
          {
            ok: true
          }
        );
      }


      // --------------------------------------------------------
      // Only POST for Bale webhook
      // --------------------------------------------------------

      if (
        event.httpMethod !== "POST"
      ) {

        return {

          statusCode:
            200,

          body:
            "HamedShop Bale webhook is running"

        };
      }


      // --------------------------------------------------------
      // Parse update
      // --------------------------------------------------------

      const update =
        JSON.parse(
          event.body || "{}"
        );

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

        const callback =
          update.callback_query;

        const chatId =
          callback.message?.chat?.id;

        const userId =
          callback.from?.id ||
          chatId;

        const data =
          callback.data ||
          "";


        // ------------------------------------------------------
        // Category selection
        // ------------------------------------------------------

        if (
          data.startsWith(
            "category:"
          )
        ) {

          const categoryId =
            data.replace(
              "category:",
              ""
            );

          await handleProductCategory(
            callback,
            chatId,
            userId,
            categoryId
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ------------------------------------------------------
        // Variant yes/no
        // ------------------------------------------------------

        if (
          data.startsWith(
            "variant:"
          )
        ) {

          const value =
            data.replace(
              "variant:",
              ""
            );

          await handleVariantChoice(
            callback,
            chatId,
            userId,
            value
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ------------------------------------------------------
        // Inventory
        // ------------------------------------------------------

        if (
          data.startsWith(
            "stock:"
          )
        ) {

          const parts =
            data.split(":");

          const action =
            parts[1];

          if (
            action === "done"
          ) {

            const product =
              pendingProducts.get(
                userId
              );

            await baleRequest(
              "answerCallbackQuery",
              {

                callback_query_id:
                  callback.id

              }
            );

            if (product) {

              product.step =
                "price";

              pendingProducts.set(
                userId,
                product
              );

              await sendPriceMenu(
                chatId
              );
            }

          } else {

            const index =
              Number(
                parts[2]
              );

            await handleStockCallback(
              callback,
              chatId,
              userId,
              action,
              index
            );
          }

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ------------------------------------------------------
        // Product discount
        // ------------------------------------------------------

        if (
          data.startsWith(
            "discount_product:"
          )
        ) {

          const type =
            data.replace(
              "discount_product:",
              ""
            );

          await handleProductDiscount(
            callback,
            chatId,
            userId,
            type
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ------------------------------------------------------
        // Product features
        // ------------------------------------------------------

        if (
          data.startsWith(
            "feature:"
          )
        ) {

          const feature =
            data.replace(
              "feature:",
              ""
            );

          await handleFeatureCallback(
            callback,
            chatId,
            userId,
            feature
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ------------------------------------------------------
        // Confirm product
        // ------------------------------------------------------

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
                  "❌ اطلاعات محصول پیدا نشد.\nلطفاً دوباره محصول را اضافه کنید."

              }
            );

            return {

              statusCode:
                200,

              body:
                "ok"

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

            const productId =
              generateProductId();

            const image =
              await uploadImageToGitHub(
                product.photoId,
                productId
              );

            const savedProduct = {

              id:
                productId,

              name:
                product.name,

              categoryId:
                product.categoryId || "",

              categoryName:
                product.categoryName ||
                product.category ||
                "",

              category:
                product.categoryName ||
                product.category ||
                "",

              image:
                image.path,

              variants:
                product.variants || [],

              stock:
                Number(
                  product.stock || 0
                ),

              totalStock:
                calculateProductStock(
                  product
                ),

              price:
                Number(
                  product.price || 0
                ),

              discount:
                product.discount ||
                {
                  type:
                    "none",

                  value:
                    0
                },

              featured:
                Boolean(
                  product.featured
                ),

              bestseller:
                Boolean(
                  product.bestseller
                ),

              isNew:
                Boolean(
                  product.isNew
                ),

              discounted:
                Boolean(
                  product.discounted
                ),

              createdAt:
                new Date().toISOString(),

              updatedAt:
                new Date().toISOString()

            };

            const products =
              await getProducts();

            products.push(
              savedProduct
            );

            await saveProducts(
              products
            );

            pendingProducts.delete(
              userId
            );

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:

                  `✅ محصول با موفقیت ثبت شد.\n\n` +

                  `📌 نام: ${savedProduct.name}\n` +

                  `📂 دسته‌بندی: ${savedProduct.categoryName}\n` +

                  `💰 قیمت: ${Number(savedProduct.price).toLocaleString()} تومان\n` +

                  `📊 موجودی: ${savedProduct.totalStock}\n` +

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

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ------------------------------------------------------
        // Cancel product
        // ------------------------------------------------------

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

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ======================================================
        // PRODUCT MANAGEMENT
        // ======================================================

        if (
          data ===
          "products:list"
        ) {

          await baleRequest(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id
            }
          );

          await sendProductList(
            chatId
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        if (
          data.startsWith(
            "product:view:"
          )
        ) {

          const productId =
            data.replace(
              "product:view:",
              ""
            );

          await baleRequest(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id
            }
          );

          await sendProductDetails(
            chatId,
            productId
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        if (
          data.startsWith(
            "product_stock:"
          )
        ) {

          const productId =
            data.replace(
              "product_stock:",
              ""
            );

          const products =
            await getProducts();

          const product =
            products.find(
              p =>
                p.id ===
                productId
            );

          await baleRequest(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id
            }
          );

          if (!product) {

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:
                  "❌ محصول پیدا نشد."

              }
            );

            return {

              statusCode:
                200,

              body:
                "ok"

            };
          }

          pendingProducts.set(
            userId,
            {
              mode:
                "manage_stock",

              productId,

              variants:
                product.variants || []

            }
          );

          await sendInventoryEditor(
            chatId,
            userId
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        if (
          data.startsWith(
            "product_delete:"
          )
        ) {

          const productId =
            data.replace(
              "product_delete:",
              ""
            );

          await baleRequest(
            "answerCallbackQuery",
            {

              callback_query_id:
                callback.id

            }
          );

          await baleRequest(
            "sendMessage",
            {

              chat_id:
                chatId,

              text:
                "⚠️ آیا مطمئن هستید که می‌خواهید این محصول حذف شود؟",

              reply_markup: {

                inline_keyboard: [

                  [

                    {
                      text:
                        "🗑 بله، حذف شود",

                      callback_data:
                        `product_delete_confirm:${productId}`
                    },

                    {
                      text:
                        "❌ خیر",

                      callback_data:
                        "product_delete_cancel"
                    }

                  ]

                ]
              }
            }
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        if (
          data.startsWith(
            "product_delete_confirm:"
          )
        ) {

          const productId =
            data.replace(
              "product_delete_confirm:",
              ""
            );

          const products =
            await getProducts();

          const product =
            products.find(
              p =>
                p.id ===
                productId
            );

          if (!product) {

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:
                  "❌ محصول پیدا نشد."

              }
            );

            return {

              statusCode:
                200,

              body:
                "ok"

            };
          }

          const newProducts =
            products.filter(
              p =>
                p.id !==
                productId
            );

          await saveProducts(
            newProducts
          );

          if (
            product.image
          ) {

            await deleteGitHubFile(
              product.image,
              `Delete product image ${productId}`
            );
          }

          await baleRequest(
            "answerCallbackQuery",
            {

              callback_query_id:
                callback.id,

              text:
                "محصول حذف شد"

            }
          );

          await baleRequest(
            "sendMessage",
            {

              chat_id:
                chatId,

              text:
                `🗑 محصول «${product.name}» حذف شد.`

            }
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        if (
          data ===
          "product_delete_cancel"
        ) {

          await baleRequest(
            "answerCallbackQuery",
            {

              callback_query_id:
                callback.id,

              text:
                "لغو شد"

            }
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ======================================================
        // CATEGORY MANAGEMENT
        // ======================================================

        if (
          data ===
          "category_manage:add"
        ) {

          await baleRequest(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id
            }
          );

          pendingProducts.set(
            userId,
            {
              mode:
                "add_category",

              step:
                "category_name"
            }
          );

          await baleRequest(
            "sendMessage",
            {

              chat_id:
                chatId,

              text:
                "📂 نام دسته‌بندی جدید را وارد کنید.\n\nمثال:\nساعت"

            }
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        if (
          data ===
          "category_manage:edit"
        ) {

          await baleRequest(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id
            }
          );

          await sendCategoryList(
            chatId,
            "edit"
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        if (
          data ===
          "category_manage:delete"
        ) {

          await baleRequest(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id
            }
          );

          await sendCategoryList(
            chatId,
            "delete"
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        if (
          data ===
          "category_manage:list"
        ) {

          await baleRequest(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id
            }
          );

          await sendCategoryList(
            chatId,
            "view"
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        if (
          data.startsWith(
            "category_edit:"
          )
        ) {

          const categoryId =
            data.replace(
              "category_edit:",
              ""
            );

          const categories =
            await getCategories();

          const category =
            categories.find(
              c =>
                c.id ===
                categoryId
            );

          if (!category) {

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:
                  "❌ دسته‌بندی پیدا نشد."

              }
            );

            return {

              statusCode:
                200,

              body:
                "ok"

            };
          }

          pendingProducts.set(
            userId,
            {

              mode:
                "edit_category",

              categoryId,

              step:
                "category_name",

              oldName:
                category.name

            }
          );

          await baleRequest(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id
            }
          );

          await baleRequest(
            "sendMessage",
            {

              chat_id:
                chatId,

              text:
                `✏️ نام جدید برای «${category.name}» را وارد کنید.`

            }
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        if (
          data.startsWith(
            "category_delete:"
          )
        ) {

          const categoryId =
            data.replace(
              "category_delete:",
              ""
            );

          const categories =
            await getCategories();

          const category =
            categories.find(
              c =>
                c.id ===
                categoryId
            );

          if (!category) {

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:
                  "❌ دسته‌بندی پیدا نشد."

              }
            );

            return {

              statusCode:
                200,

              body:
                "ok"

            };
          }

          await baleRequest(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id
            }
          );

          await baleRequest(
            "sendMessage",
            {

              chat_id:
                chatId,

              text:
                `⚠️ آیا دسته‌بندی «${category.name}» حذف شود؟`,

              reply_markup: {

                inline_keyboard: [

                  [

                    {
                      text:
                        "🗑 حذف",

                      callback_data:
                        `category_delete_confirm:${categoryId}`
                    },

                    {
                      text:
                        "❌ لغو",

                      callback_data:
                        "category_delete_cancel"
                    }

                  ]

                ]
              }
            }
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        if (
          data.startsWith(
            "category_delete_confirm:"
          )
        ) {

          const categoryId =
            data.replace(
              "category_delete_confirm:",
              ""
            );

          const categories =
            await getCategories();

          const category =
            categories.find(
              c =>
                c.id ===
                categoryId
            );

          const newCategories =
            categories.filter(
              c =>
                c.id !==
                categoryId
            );

          await saveCategories(
            newCategories
          );

          await baleRequest(
            "answerCallbackQuery",
            {

              callback_query_id:
                callback.id,

              text:
                "دسته‌بندی حذف شد"

            }
          );

          await baleRequest(
            "sendMessage",
            {

              chat_id:
                chatId,

              text:
                `🗑 دسته‌بندی «${category?.name || ""}» حذف شد.`

            }
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        if (
          data ===
          "category_delete_cancel"
        ) {

          await baleRequest(
            "answerCallbackQuery",
            {

              callback_query_id:
                callback.id,

              text:
                "لغو شد"

            }
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ======================================================
        // DISCOUNT MANAGEMENT
        // ======================================================

        if (
          data ===
          "discount_manage:add"
        ) {

          await baleRequest(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id
            }
          );

          pendingProducts.set(
            userId,
            {

              mode:
                "add_discount",

              step:
                "discount_name"

            }
          );

          await baleRequest(
            "sendMessage",
            {

              chat_id:
                chatId,

              text:
                "🏷️ نام کمپین یا تخفیف را وارد کنید.\n\nمثال:\nتخفیف تابستانه"

            }
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        if (
          data ===
          "discount_manage:list"
        ) {

          const discounts =
            await getDiscounts();

          await baleRequest(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id
            }
          );

          if (!discounts.length) {

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:
                  "🏷️ هنوز کمپینی ثبت نشده است."

              }
            );

          } else {

            const text =
              discounts
                .map(
                  d =>
                    `🏷️ ${d.name}\nنوع: ${d.type}\nمقدار: ${d.value}`
                )
                .join("\n\n");

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text

              }
            );
          }

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ======================================================
        // ORDERS
        // ======================================================

        if (
          data ===
          "orders:list"
        ) {

          await baleRequest(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id
            }
          );

          await sendOrdersList(
            chatId
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        if (
          data.startsWith(
            "order:view:"
          )
        ) {

          const orderId =
            data.replace(
              "order:view:",
              ""
            );

          const orders =
            await getOrders();

          const order =
            orders.find(
              o =>
                o.id ===
                orderId
            );

          await baleRequest(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id
            }
          );

          if (!order) {

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:
                  "❌ سفارش پیدا نشد."

              }
            );

          } else {

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:

                  `🧾 سفارش ${order.id}\n\n` +

                  `وضعیت: ${order.status}\n` +

                  `مبلغ: ${Number(order.totalAmount || 0).toLocaleString()} تومان\n\n` +

                  `اقلام:\n` +

                  order.items
                    .map(
                      item =>
                        `• ${item.productName} × ${item.quantity}`
                    )
                    .join("\n")

              }
            );
          }

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        return {

          statusCode:
            200,

          body:
            "ok"

        };
      }


      // ========================================================
      // MESSAGE
      // ========================================================

      const message =
        update.message;

      if (!message) {

        return {

          statusCode:
            200,

          body:
            "ok"

        };
      }

      const chatId =
        message.chat?.id;

      const userId =
        message.from?.id ||
        chatId;

      if (!chatId) {

        return {

          statusCode:
            200,

          body:
            "ok"

        };
      }

      const text =
        (
          message.text ||
          ""
        ).trim();


      // ========================================================
      // START
      // ========================================================

      if (
        text ===
        "/start"
      ) {

        await ensureDefaultCategories();

        await sendMainMenu(
          chatId
        );

        return {

          statusCode:
            200,

          body:
            "ok"

        };
      }


      // ========================================================
      // MAIN MENU
      // ========================================================

      if (
        text ===
        "🏠 منوی اصلی"
      ) {

        await sendMainMenu(
          chatId
        );

        return {

          statusCode:
            200,

          body:
            "ok"

        };
      }


      // ========================================================
      // ADD PRODUCT
      // ========================================================

      if (
        text ===
        "➕ افزودن محصول"
      ) {

        pendingProducts.set(
          userId,
          {

            mode:
              "add_product",

            step:
              "photo"

          }
        );

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

          statusCode:
            200,

          body:
            "ok"

        };
      }


      // ========================================================
      // PRODUCT MANAGEMENT
      // ========================================================

      if (
        text ===
        "📦 مدیریت محصولات"
      ) {

        await sendProductManagementMenu(
          chatId
        );

        return {

          statusCode:
            200,

          body:
            "ok"

        };
      }


      if (
        text ===
        "📂 مدیریت دسته‌بندی"
      ) {

        await sendCategoryManagementMenu(
          chatId
        );

        return {

          statusCode:
            200,

          body:
            "ok"

        };
      }


      if (
        text ===
        "🏷️ مدیریت تخفیف"
      ) {

        await sendDiscountManagementMenu(
          chatId
        );

        return {

          statusCode:
            200,

          body:
            "ok"

        };
      }


      if (
        text ===
        "⭐ محصولات ویژه"
      ) {

        await sendFeaturedProducts(
          chatId
        );

        return {

          statusCode:
            200,

          body:
            "ok"

        };
      }


      if (
        text ===
        "🧾 سفارش‌ها"
      ) {

        await sendOrdersMenu(
          chatId
        );

        return {

          statusCode:
            200,

          body:
            "ok"

        };
      }


      // ========================================================
      // WEBSITE
      // ========================================================

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
              "🌐 سایت HamedShop:\n\nhttps://khanepaz.github.io/hamed_test1/"

          }
        );

        return {

          statusCode:
            200,

          body:
            "ok"

        };
      }


      // ========================================================
      // PHOTO
      // ========================================================

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

            statusCode:
              200,

            body:
              "ok"

          };
        }

        const product = {

          mode:
            "add_product",

          step:
            "category",

          name:
            caption,

          photoId,

          categoryId:
            null,

          categoryName:
            null,

          category:
            null,

          variants:
            [],

          stock:
            0,

          price:
            0,

          discount:
            {
              type:
                "none",

              value:
                0
            },

          featured:
            false,

          bestseller:
            false,

          isNew:
            false,

          discounted:
            false

        };

        pendingProducts.set(
          userId,
          product
        );

        await sendCategoryMenu(
          chatId
        );

        return {

          statusCode:
            200,

          body:
            "ok"

        };
      }


      // ========================================================
      // Pending conversation
      // ========================================================

      const pending =
        pendingProducts.get(
          userId
        );

      if (
        pending
      ) {

        // ------------------------------------------------------
        // Simple product stock
        // ------------------------------------------------------

        if (
          pending.step ===
          "simple_stock"
        ) {

          const stock =
            Number(
              text
            );

          if (
            !Number.isInteger(stock) ||
            stock < 0
          ) {

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:
                  "❌ لطفاً موجودی را به صورت یک عدد صحیح وارد کنید."

              }
            );

            return {

              statusCode:
                200,

              body:
                "ok"

            };
          }

          pending.stock =
            stock;

          pending.totalStock =
            stock;

          pending.step =
            "price";

          pendingProducts.set(
            userId,
            pending
          );

          await sendPriceMenu(
            chatId
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ------------------------------------------------------
        // Variant definitions
        // ------------------------------------------------------

        if (
          pending.step ===
          "variants"
        ) {

          const attributes =
            parseVariantAttributes(
              text
            );

          if (
            !Object.keys(
              attributes
            ).length
          ) {

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:
                  "❌ فرمت ویژگی‌ها صحیح نیست.\n\nمثال:\nرنگ: مشکی, سفید\nسایز: 40, 41, 42"

              }
            );

            return {

              statusCode:
                200,

              body:
                "ok"

            };
          }

          const variants =
            generateVariantCombinations(
              attributes
            );

          pending.attributes =
            attributes;

          pending.variants =
            variants;

          pending.step =
            "inventory";

          pendingProducts.set(
            userId,
            pending
          );

          await sendInventoryEditor(
            chatId,
            userId
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ------------------------------------------------------
        // Price
        // ------------------------------------------------------

        if (
          pending.step ===
          "price"
        ) {

          const price =
            Number(
              text
                .replace(
                  /[,،\s]/g,
                  ""
                )
            );

          if (
            !Number.isFinite(price) ||
            price < 0
          ) {

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:
                  "❌ لطفاً قیمت معتبر وارد کنید."

              }
            );

            return {

              statusCode:
                200,

              body:
                "ok"

            };
          }

          pending.price =
            price;

          pending.step =
            "discount";

          pendingProducts.set(
            userId,
            pending
          );

          await sendDiscountMenu(
            chatId
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ------------------------------------------------------
        // Discount value
        // ------------------------------------------------------

        if (
          pending.step ===
          "discount_value"
        ) {

          const value =
            Number(
              text
                .replace(
                  /[,،\s]/g,
                  ""
                )
            );

          if (
            !Number.isFinite(value) ||
            value < 0
          ) {

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:
                  "❌ مقدار تخفیف معتبر نیست."

              }
            );

            return {

              statusCode:
                200,

              body:
                "ok"

            };
          }

          if (
            pending.discountStep ===
            "percent" &&
            value > 100
          ) {

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:
                  "❌ درصد تخفیف نمی‌تواند بیشتر از 100 باشد."

              }
            );

            return {

              statusCode:
                200,

              body:
                "ok"

            };
          }

          pending.discount = {

            type:
              pending.discountStep,

            value

          };

          pending.discounted =
            value > 0;

          pending.step =
            "features";

          pendingProducts.set(
            userId,
            pending
          );

          await sendFeaturesMenu(
            chatId
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ------------------------------------------------------
        // Add category
        // ------------------------------------------------------

        if (
          pending.mode ===
            "add_category" &&
          pending.step ===
            "category_name"
        ) {

          if (
            !text
          ) {

            return {

              statusCode:
                200,

              body:
                "ok"

            };
          }

          const categories =
            await getCategories();

          const duplicate =
            categories.find(
              c =>
                c.name.trim() ===
                text
            );

          if (
            duplicate
          ) {

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:
                  "❌ این دسته‌بندی قبلاً وجود دارد."

              }
            );

            return {

              statusCode:
                200,

              body:
                "ok"

            };
          }

          const category = {

            id:
              generateCategoryId(
                text
              ),

            name:
              text,

            icon:
              "📂",

            active:
              true,

            createdAt:
              new Date().toISOString()

          };

          categories.push(
            category
          );

          await saveCategories(
            categories
          );

          pendingProducts.delete(
            userId
          );

          await baleRequest(
            "sendMessage",
            {

              chat_id:
                chatId,

              text:
                `✅ دسته‌بندی «${text}» ایجاد شد.`

            }
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ------------------------------------------------------
        // Edit category
        // ------------------------------------------------------

        if (
          pending.mode ===
            "edit_category" &&
          pending.step ===
            "category_name"
        ) {

          const categories =
            await getCategories();

          const category =
            categories.find(
              c =>
                c.id ===
                pending.categoryId
            );

          if (!category) {

            pendingProducts.delete(
              userId
            );

            await baleRequest(
              "sendMessage",
              {

                chat_id:
                  chatId,

                text:
                  "❌ دسته‌بندی پیدا نشد."

              }
            );

            return {

              statusCode:
                200,

              body:
                "ok"

            };
          }

          category.name =
            text;

          await saveCategories(
            categories
          );

          // Update existing products
          const products =
            await getProducts();

          let changed =
            false;

          for (
            const product
            of products
          ) {

            if (
              product.categoryId ===
              category.id
            ) {

              product.categoryName =
                text;

              product.category =
                text;

              changed =
                true;
            }
          }

          if (changed) {

            await saveProducts(
              products
            );
          }

          pendingProducts.delete(
            userId
          );

          await baleRequest(
            "sendMessage",
            {

              chat_id:
                chatId,

              text:
                `✅ دسته‌بندی به «${text}» تغییر کرد.`

            }
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }


        // ------------------------------------------------------
        // Add discount / campaign
        // ------------------------------------------------------

        if (
          pending.mode ===
            "add_discount" &&
          pending.step ===
            "discount_name"
        ) {

          pending.discountName =
            text;

          pending.step =
            "discount_type";

          pendingProducts.set(
            userId,
            pending
          );

          await baleRequest(
            "sendMessage",
            {

              chat_id:
                chatId,

              text:
                "🏷️ نوع تخفیف کمپین را انتخاب کنید:",

              reply_markup: {

                inline_keyboard: [

                  [

                    {
                      text:
                        "درصدی",

                      callback_data:
                        "campaign_type:percent"
                    },

                    {
                      text:
                        "مبلغ ثابت",

                      callback_data:
                        "campaign_type:fixed"
                    }

                  ]

                ]
              }
            }
          );

          return {

            statusCode:
              200,

            body:
              "ok"

          };
        }

      }


      // ========================================================
      // Campaign callback
      // ========================================================

      if (
        update.message === message
      ) {
        // Nothing
      }


      // ========================================================
      // Unknown
      // ========================================================

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

        statusCode:
          200,

        body:
          "ok"

      };

    } catch (error) {

      console.error(
        "MAIN ERROR:",
        error
      );

      return {

        statusCode:
          500,

        headers: {

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify({

            ok:
              false,

            error:
              error.message

          })

      };
    }
  };

