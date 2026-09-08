const GITHUB_OWNER = "khanepaz";
const GITHUB_REPO = "hamed_test1";
const GITHUB_BRANCH = "main";

// ===============================
// State Management
// ===============================
const pendingProducts = new Map();
const pendingCategories = new Map();
const pendingDiscounts = new Map();
const pendingEdits = new Map();
const userStates = new Map();
const pendingInventory = new Map();

// ===============================
// Bale API
// ===============================
async function baleRequest(method, data) {
  const token = process.env.BALE_BOT_TOKEN;
  const response = await fetch(
    `https://tapi.bale.ai/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }
  );
  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Bale API Error: ${JSON.stringify(result)}`);
  }
  return result.result;
}

// ===============================
// GitHub API
// ===============================
async function githubRequest(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is missing");

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
  try { data = JSON.parse(text); } catch { data = text; }

  if (!response.ok) {
    throw new Error(`GitHub API Error ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ===============================
// ID Generators
// ===============================
function generateProductId() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const sec = String(now.getSeconds()).padStart(2, "0");
  const random = Math.floor(Math.random() * 100).toString().padStart(2, "0");
  return `P${yy}${mm}${dd}${hh}${min}${sec}${random}`;
}

function generateCategoryId() {
  return `CAT_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
}

function generateDiscountId() {
  return `DISC_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
}

// ===============================
// File Operations
// ===============================
async function getFileFromGitHub(filePath, defaultValue = null) {
  try {
    const result = await githubRequest(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`
    );
    const content = Buffer.from(result.content.replace(/\n/g, ""), "base64").toString

("utf8");
    return { data: JSON.parse(content), sha: result.sha };
  } catch (error) {
    if (error.message.includes("GitHub API Error 404")) {
      return { data: defaultValue, sha: null };
    }
    throw error;
  }
}

async function saveFileToGitHub(filePath, data, sha = null) {
  const jsonContent = JSON.stringify(data, null, 2);
  const base64Content = Buffer.from(jsonContent, "utf8").toString("base64");
  const body = {
    message: `Update ${filePath}`,
    content: base64Content,
    branch: GITHUB_BRANCH
  };
  if (sha) body.sha = sha;

  await githubRequest(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
    { method: "PUT", body: JSON.stringify(body) }
  );
}

// ===============================
// Image Upload
// ===============================
async function uploadImageToGitHub(fileId, productId) {
  console.log("Getting Bale file information...");
  const fileInfo = await baleRequest("getFile", { file_id: fileId });
  if (!fileInfo || !fileInfo.file_path) {
    throw new Error("Bale file_path not found");
  }

  const token = process.env.BALE_BOT_TOKEN;
  const fileUrl = `https://tapi.bale.ai/file/bot${token}/${fileInfo.file_path}`;

  console.log("Downloading image from Bale...");
  const imageResponse = await fetch(fileUrl);
  if (!imageResponse.ok) {
    throw new Error(`Could not download image from Bale: ${imageResponse.status}`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString("base64");
  const githubPath = `images/${productId}.jpg`;

  console.log("Uploading image to GitHub:", githubPath);
  const result = await githubRequest(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message: `Add product image ${productId}`,
        content: base64Image,
        branch: GITHUB_BRANCH
      })
    }
  );

  return { path: githubPath, sha: result.content?.sha };
}

// ===============================
// Product CRUD with Search
// ===============================
async function getProducts() {
  const result = await getFileFromGitHub("data/products.json", []);
  return { products: Array.isArray(result.data) ? result.data : [], sha: result.sha };
}

async function saveProducts(products, sha = null) {
  await saveFileToGitHub("data/products.json", products, sha);
}

async function getProductById(productId) {
  const { products } = await getProducts();
  return products.find(p => p.id === productId);
}

async function searchProducts(query, category = null) {
  const { products } = await getProducts();
  let filtered = products;
  
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.id.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  }
  
  if (category) {
    filtered = filtered.filter(p => p.category === category);
  }
  
  return filtered;
}

async function addProduct(product) {
  const { products, sha } = await getProducts();
  products.push(product);
  await saveProducts(products, sha);
  return product;
}

async function updateProduct(productId, updatedData) {
  const { products, sha } = await getProducts();
  const index = products.findIndex(p => p.id === productId);
  if (index === -1) throw new Error(`Product ${productId} not found`);
  
  products[index] = { ...products[index], ...updatedData };
  await saveProducts(products, sha);
  return products[index];
}

async function deleteProduct(productId) {
  const { products, sha } = await getProducts();
  const filtered = products.filter(p => p.id !== productId);
  if (filtered.length === products.length) throw new Error(`Product ${productId} not 

found`);
  await saveProducts(filtered, sha);
  return true;
}

// ===============================
// Categories CRUD
// ===============================
async function getCategories() {
  const result = await getFileFromGitHub("data/categories.json", []);
  return { categories: Array.isArray(result.data) ? result.data : [], sha: result.sha };
}

async function saveCategories(categories, sha = null) {
  await saveFileToGitHub("data/categories.json", categories, sha);
}

async function addCategory(category) {
  const { categories, sha } = await getCategories();
  if (categories.some(c => c.name === category.name)) {
    throw new Error(`Category ${category.name} already exists`);
  }
  categories.push(category);
  await saveCategories(categories, sha);
  return category;
}

async function updateCategory(categoryId, updatedData) {
  const { categories, sha } = await getCategories();
  const index = categories.findIndex(c => c.id === categoryId);
  if (index === -1) throw new Error(`Category ${categoryId} not found`);
  
  categories[index] = { ...categories[index], ...updatedData };
  await saveCategories(categories, sha);
  return categories[index];
}

async function deleteCategory(categoryId) {
  const { categories, sha } = await getCategories();
  const filtered = categories.filter(c => c.id !== categoryId);
  if (filtered.length === categories.length) throw new Error(`Category ${categoryId} not 

found`);
  
  const { products } = await getProducts();
  if (products.some(p => p.category === categoryId)) {
    throw new Error("Cannot delete category that is in use by products");
  }
  
  await saveCategories(filtered, sha);
  return true;
}

// ===============================
// Discounts CRUD
// ===============================
async function getDiscounts() {
  const result = await getFileFromGitHub("data/discounts.json", []);
  return { discounts: Array.isArray(result.data) ? result.data : [], sha: result.sha };
}

async function saveDiscounts(discounts, sha = null) {
  await saveFileToGitHub("data/discounts.json", discounts, sha);
}

async function addDiscount(discount) {
  const { discounts, sha } = await getDiscounts();
  discounts.push(discount);
  await saveDiscounts(discounts, sha);
  return discount;
}

async function updateDiscount(discountId, updatedData) {
  const { discounts, sha } = await getDiscounts();
  const index = discounts.findIndex(d => d.id === discountId);
  if (index === -1) throw new Error(`Discount ${discountId} not found`);
  
  discounts[index] = { ...discounts[index], ...updatedData };
  await saveDiscounts(discounts, sha);
  return discounts[index];
}

async function deleteDiscount(discountId) {
  const { discounts, sha } = await getDiscounts();
  const filtered = discounts.filter(d => d.id !== discountId);
  if (filtered.length === discounts.length) throw new Error(`Discount ${discountId} not 

found`);
  await saveDiscounts(filtered, sha);
  return true;
}

// ===============================
// Calculate Final Price
// ===============================
function calculateFinalPrice(price, discount) {
  if (!discount) return price;
  if (discount.isPercentage) {
    return price - (price * discount.amount / 100);
  }
  return price - discount.amount;
}

// ===============================
// Utility: Variant Combinations
// ===============================
function getVariantCombinations(variants) {
  if (!variants || variants.length === 0) return [];
  
  let combinations = [[]];
  variants.forEach(variant => {
    const newCombinations = [];
    combinations.forEach(combo => {
      variant.options.forEach(option => {
        newCombinations.push([...combo, option]);
      });
    });
    combinations = newCombinations;
  });
  
  return combinations;
}

function getVariantKey(combination) {
  return combination.join('|');
}

// ===============================
// Menus
// ===============================
async function sendMainMenu(chatId) {
  await baleRequest("sendMessage", {
    chat_id: chatId,
    text: "🛍️ به HamedShop خوش آمدید\n\nلطفاً یک گزینه را انتخاب کنید:",
    reply_markup: {
      keyboard: [
        [{ text: "➕ افزودن محصول" }],
        [{ text: "🔍 جستجوی محصول" }],
        [{ text: "📦 مدیریت محصولات" }],
        [{ text: "📂 مدیریت دسته‌بندی" }],
        [{ text: "🏷️ مدیریت تخفیف‌ها" }],
        [{ text: "⭐ محصولات ویژه" }],
        [{ text: "🌐 مشاهده سایت" }]
      ],
      resize_keyboard: true
    }
  });
}

async function sendSearchMenu(chatId) {
  await baleRequest("sendMessage", {
    chat_id: chatId,
    text: "🔍 جستجوی محصول\n\nلطفاً عبارت جستجو را وارد کنید:\n(نام محصول، شناسه یا دسته‌بندی)"
  });
}

async function sendProductManagementMenu(chatId, product = null) {
  let text = "📦 مدیریت محصولات\n\n";
  
  if (product) {
    text += `📌 محصول انتخاب شده: ${product.name}\n`;
    text += `🆔 ${product.id}\n\n`;
    text += `چه عملیاتی انجام شود؟`;
  } else {
    text += `یک گزینه را انتخاب کنید:`;
  }
  
  const buttons = [];
  
  if (product) {
    buttons.push(
      [{ text: "✏️ ویرایش", callback_data: `edit_product:${product.id}` }],
      [{ text: "🗑 حذف", callback_data: `delete_product:${product.id}` }],
      [{ text: "📊 مدیریت موجودی", callback_data: `inventory:${product.id}` }],
      [{ text: "🏷️ اعمال تخفیف", callback_data: `discount_product:${product.id}` }]
    );
  }
  
  buttons.push(
    [{ text: "👁️ مشاهده همه محصولات", callback_data: "view_all_products" }],
    [{ text: "🔙 بازگشت به منوی اصلی", callback_data: "back_main" }]
  );
  
  await baleRequest("sendMessage", {
    chat_id: chatId,
    text: text,
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}

async function sendCategoryManagementMenu(chatId) {
  const { categories } = await getCategories();
  let text = "📂 مدیریت دسته‌بندی\n\n";
  
  if (categories.length === 0) {
    text += "❌ هیچ دسته‌بندی ثبت نشده است.\n\n";
  } else {
    text += "دسته‌بندی‌های موجود:\n";
    categories.forEach((cat, index) => {
      text += `\n${index + 1}. ${cat.icon || '📁'} ${cat.name}`;
    });
    text += "\n\n";
  }
  
  text += "یک گزینه را انتخاب کنید:";
  
  await baleRequest("sendMessage", {
    chat_id: chatId,
    text: text,
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ افزودن دسته‌بندی", callback_data: "add_category" }],
        [{ text: "✏️ ویرایش دسته‌بندی", callback_data: "edit_category_menu" }],
        [{ text: "🗑 حذف دسته‌بندی", callback_data: "delete_category_menu" }],
        [{ text: "🔙 بازگشت به منوی اصلی", callback_data: "back_main" }]
      ]
    }
  });
}

async function sendDiscountManagementMenu(chatId) {
  const { discounts } = await getDiscounts();
  let text = "🏷️ مدیریت تخفیف‌ها\n\n";
  
  if (discounts.length > 0) {
    text += "تخفیف‌های فعال:\n";
    discounts.forEach((d, index) => {
      text += `\n${index + 1}. ${d.type === 'product' ? '🎯 محصول' : d.type === 'category' ? 

'📂 دسته‌بندی' : '✨ ویژه'}\n`;
      text += `   ${d.amount}${d.isPercentage ? '%' : ' تومان'}`;
    });
    text += "\n\n";
  }
  
  text += "یک گزینه را انتخاب کنید:";
  
  await baleRequest("sendMessage", {
    chat_id: chatId,
    text: text,
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎯 تخفیف محصول", callback_data: "discount_product_menu" }],
        [{ text: "📂 تخفیف دسته‌بندی", callback_data: "discount_category_menu" }],
        [{ text: "✨ تخفیف ویژه (ویژگی)", callback_data: "discount_feature_menu" }],
        [{ text: "👁️ مشاهده همه تخفیف‌ها", callback_data: "view_all_discounts" }],
        [{ text: "🔙 بازگشت به منوی اصلی", callback_data: "back_main" }]
      ]
    }
  });
}

async function sendFeaturedProductsMenu(chatId) {
  const { products } = await getProducts();
  
  let text = "⭐ مدیریت محصولات ویژه\n\n";
  const featured = products.filter(p => p.isFeatured || p.isBestseller || p.isNew);
  
  if (featured.length > 0) {
    text += "محصولات ویژه فعلی:\n";
    featured.forEach(p => {
      const badges = [];
      if (p.isFeatured) badges.push("🌟 ویژه");
      if (p.isBestseller) badges.push("🔥 پرفروش");
      if (p.isNew) badges.push("🆕 جدید");
      text += `\n${p.name} - ${badges.join(', ')}`;
    });
    text += "\n\n";
  }
  
  text += "یک گزینه را انتخاب کنید:";
  
  await baleRequest("sendMessage", {
    chat_id: chatId,
    text: text,
    reply_markup: {
      inline_keyboard: [
        [{ text: "🌟 انتخاب محصول ویژه", callback_data: "featured_select" }],
        [{ text: "🔥 انتخاب محصول پرفروش", callback_data: "bestseller_select" }],
        [{ text: "🆕 انتخاب محصول جدید", callback_data: "new_select" }],
        [{ text: "👁️ مشاهده همه", callback_data: "featured_view_all" }],
        [{ text: "🔙 بازگشت به منوی اصلی", callback_data: "back_main" }]
      ]
    }
  });
}

async function sendProductListForSelection(chatId, action, title) {
  const { products } = await getProducts();
  
  if (products.length === 0) {
    await baleRequest("sendMessage", {
      chat_id: chatId,
      text: "❌ هیچ محصولی وجود ندارد."
    });
    return;
  }
  
  let text = `${title}\n\nلطفاً محصول مورد نظر را انتخاب کنید:`;
  const buttons = [];
  
  products.forEach(p => {
    buttons.push([
      { text: `${p.name} (${p.id})`, callback_data: `${action}:${p.id}` }
    ]);
  });
  
  buttons.push([{ text: "🔙 بازگشت", callback_data: "back_management" }]);
  
  await baleRequest("sendMessage", {
    chat_id: chatId,
    text: text,
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}

// ===============================
// Inventory Management
// ===============================
async function sendInventoryMenu(chatId, productId) {
  const product = await getProductById(productId);
  if (!product) {
    await baleRequest("sendMessage", {
      chat_id: chatId,
      text: "❌ محصول پیدا نشد."
    });
    return;
  }
  
  pendingInventory.set(chatId, { productId, page: 0 });
  
  await showInventoryPage(chatId, productId, 0);
}

async function showInventoryPage(chatId, productId, page) {
  const product = await getProductById(productId);
  if (!product) return;
  
  const combinations = getVariantCombinations(product.variants || []);
  
  if (combinations.length === 0) {
    // Product has no variants
    const inventory = product.inventory || {};
    const currentStock = inventory['default'] || 0;
    
    await baleRequest("sendMessage", {
      chat_id: chatId,
      text: `📊 مدیریت موجودی\n\n📌 ${product.name}\n\nموجودی فعلی: ${currentStock}\n\nموجودی را با دکمه‌های زیر مدیریت کنید:`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "➖", callback_data: `inv_dec:default` },
            { text: `${currentStock}`, callback_data: "inv_current" },
            { text: "➕", callback_data: `inv_inc:default` }
          ],
          [
            { text: "📝 وارد کردن دقیق", callback_data: `inv_set:default` },
            { text: "🔙 بازگشت", callback_data: "back_product_management" }
          ]
        ]
      }
    });
    return;
  }
  
  // Show variants with pagination
  const itemsPerPage = 5;
  const totalPages = Math.ceil(combinations.length / itemsPerPage);
  const start = page * itemsPerPage;
  const end = Math.min(start + itemsPerPage, combinations.length);
  const pageCombinations = combinations.slice(start, end);
  
  let text = `📊 مدیریت موجودی\n\n📌 ${product.name}\n\n`;
  text += `تنوع‌ها (صفحه ${page + 1}/${totalPages}):\n\n`;
  
  pageCombinations.forEach(combo => {
    const key = getVariantKey(combo);
    const stock = product.inventory?.[key] || 0;
    text += `${combo.join(' - ')}: ${stock}\n`;
  });
  
  const buttons = [];
  
  pageCombinations.forEach(combo => {
    const key = getVariantKey(combo);
    const stock = product.inventory?.[key] || 0;
    buttons.push([
      { text: `${combo.join(' - ')}`, callback_data: `inv_info:${key}` },
      { text: "➖", callback_data: `inv_dec:${key}` },
      { text: `${stock}`, callback_data: "inv_current" },
      { text: "➕", callback_data: `inv_inc:${key}` }
    ]);
  });
  
  // Pagination buttons
  const pagination = [];
  if (page > 0) {
    pagination.push({ text: "⬅️", callback_data: `inv_page:${page - 1}` });
  }
  pagination.push({ text: `${page + 1}/${totalPages}`, callback_data: "inv_current" });
  if (page < totalPages - 1) {
    pagination.push({ text: "➡️", callback_data: `inv_page:${page + 1}` });
  }
  buttons.push(pagination);
  
  buttons.push([
    { text: "📝 وارد کردن دقیق", callback_data: `inv_set_exact:${productId}` },
    { text: "🔙 بازگشت", callback_data: "back_product_management" }
  ]);
  
  await baleRequest("sendMessage", {
    chat_id: chatId,
    text: text,
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}

// ===============================
// Main Handler
// ===============================
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 200, body: "Bale webhook is running" };
    }

    const update = JSON.parse(event.body || "{}");
    console.log("BALE UPDATE:", JSON.stringify(update));

    // =================================
    // Callback Query Handler
    // =================================
    if (update.callback_query) {
      const callback = update.callback_query;
      const chatId = callback.message?.chat?.id;
      const data = callback.data || "";
      const userId = callback.from?.id || chatId;

      // ============================
      // Back to main menu
      // ============================
      if (data === "back_main") {
        await sendMainMenu(chatId);
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data === "back_management") {
        await sendProductManagementMenu(chatId);
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data === "back_product_management") {
        await sendProductManagementMenu(chatId);
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      // ============================
      // Category selection for product
      // ============================
      if (data.startsWith("category:")) {
        const category = data.replace("category:", "");
        const product = pendingProducts.get(userId);
        if (!product) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ اطلاعات محصول پیدا نشد. لطفاً دوباره شروع کنید."
          });
          return { statusCode: 200, body: "ok" };
        }
        
        product.category = category;
        pendingProducts.set(userId, product);
        userStates.set(userId, { step: "awaiting_variants" });
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "📊 تنوع‌های محصول را وارد کنید (هر خط یک تنوع):\n\nمثال:\nسایز: S,M,L\nرنگ: قرمز,آبی,سبز\n\nاگر تنوعی ندارید، 'ردی' را بفرستید."
        });
        
        return { statusCode: 200, body: "ok" };
      }

      // ============================
      // View all products
      // ============================
      if (data === "view_all_products") {
        const { products } = await getProducts();
        
        if (products.length === 0) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ هیچ محصولی ثبت نشده است."
          });
        } else {
          let text = "📦 لیست کامل محصولات:\n\n";
          products.forEach((p, index) => {
            const finalPrice = calculateFinalPrice(p.price, p.discount);
            text += `${index + 1}. ${p.name}\n`;
            text += `   🆔 ${p.id}\n`;
            text += `   📂 ${p.category || 'بدون دسته‌بندی'}\n`;
            text += `   💰 ${p.price?.toLocaleString() || 'نامشخص'} تومان`;
            if (p.discount) {
              text += ` (💰 ${finalPrice.toLocaleString()} تومان با تخفیف)`;
            }
            text += `\n`;
            const totalStock = p.inventory ? Object.values(p.inventory).reduce((a, b) => a 

+ b, 0) : 0;
            text += `   📊 موجودی: ${totalStock}\n`;
            
            const badges = [];
            if (p.isFeatured) badges.push("🌟 ویژه");
            if (p.isBestseller) badges.push("🔥 پرفروش");
            if (p.isNew) badges.push("🆕 جدید");
            if (badges.length > 0) text += `   🏷️ ${badges.join(', ')}\n`;
            text += `\n`;
          });
          
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: text
          });
        }
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      // ============================
      // Edit product - select product
      // ============================
      if (data === "edit_product_menu") {
        await sendProductListForSelection(chatId, "edit_product", "✏️ انتخاب محصول برای ویرایش");
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data.startsWith("edit_product:")) {
        const productId = data.replace("edit_product:", "");
        const product = await getProductById(productId);
        
        if (!product) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ محصول پیدا نشد."
          });
          return { statusCode: 200, body: "ok" };
        }
        
        // Start edit flow
        pendingEdits.set(userId, { productId, step: "edit_field" });
        userStates.set(userId, { step: "editing_product" });
        
        let text = `✏️ ویرایش محصول: ${product.name}\n\n`;
        text += `1. نام: ${product.name}\n`;
        text += `2. قیمت: ${product.price?.toLocaleString() || 'نامشخص'} تومان\n`;
        text += `3. تخفیف: ${product.discount ? `

${product.discount.amount}${product.discount.isPercentage ? '%' : ' تومان'}` : 'ندارد'}\n`;
        text += `4. دسته‌بندی: ${product.category || 'ندارد'}\n`;
        text += `5. ویژگی‌ها: ${product.features?.length > 0 ? product.features.join(', ') : '

ندارد'}\n\n`;
        text += `شماره فیلد مورد نظر برای ویرایش را وارد کنید یا 'لغو' بفرستید:`;
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: text
        });
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      // ============================
      // Delete product
      // ============================
      if (data === "delete_product_menu") {
        await sendProductListForSelection(chatId, "delete_product", "🗑 انتخاب محصول برای حذف");
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data.startsWith("delete_product:")) {
        const productId = data.replace("delete_product:", "");
        
        try {
          await deleteProduct(productId);
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: `✅ محصول با شناسه ${productId} با موفقیت حذف شد.`
          });
        } catch (error) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: `❌ خطا: ${error.message}`
          });
        }
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      // ============================
      // Inventory Management
      // ============================
      if (data.startsWith("inventory:")) {
        const productId = data.replace("inventory:", "");
        await sendInventoryMenu(chatId, productId);
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data.startsWith("inv_page:")) {
        const page = parseInt(data.replace("inv_page:", ""));
        const invData = pendingInventory.get(chatId);
        if (invData) {
          await showInventoryPage(chatId, invData.productId, page);
        }
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data.startsWith("inv_inc:") || data.startsWith("inv_dec:")) {
        const isInc = data.startsWith("inv_inc:");
        const key = data.replace(isInc ? "inv_inc:" : "inv_dec:", "");
        const invData = pendingInventory.get(chatId);
        
        if (!invData) {
          await baleRequest("answerCallbackQuery", { 
            callback_query_id: callback.id,
            text: "خطا در مدیریت موجودی"
          });
          return { statusCode: 200, body: "ok" };
        }
        
        const product = await getProductById(invData.productId);
        if (!product) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ محصول پیدا نشد."
          });
          return { statusCode: 200, body: "ok" };
        }
        
        if (!product.inventory) product.inventory = {};
        const current = product.inventory[key] || 0;
        product.inventory[key] = Math.max(0, current + (isInc ? 1 : -1));
        
        await updateProduct(product.id, { inventory: product.inventory });
        
        await showInventoryPage(chatId, invData.productId, invData.page || 0);
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data.startsWith("inv_set:")) {
        const key = data.replace("inv_set:", "");
        const invData = pendingInventory.get(chatId);
        if (!invData) {
          await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
          return { statusCode: 200, body: "ok" };
        }
        
        userStates.set(chatId, { 
          step: "awaiting_inventory_set", 
          productId: invData.productId, 
          key: key,
          page: invData.page || 0
        });
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `📝 مقدار دقیق موجودی را برای این تنوع وارد کنید:`
        });
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data.startsWith("inv_set_exact:")) {
        const productId = data.replace("inv_set_exact:", "");
        const product = await getProductById(productId);
        if (!product) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ محصول پیدا نشد."
          });
          return { statusCode: 200, body: "ok" };
        }
        
        const combinations = getVariantCombinations(product.variants || []);
        let text = `📝 تنظیم دقیق موجودی برای: ${product.name}\n\n`;
        
        if (combinations.length === 0) {
          text += `موجودی فعلی: ${product.inventory?.default || 0}\n\n`;
          text += `مقدار جدید را وارد کنید:`;
          userStates.set(chatId, { 
            step: "awaiting_inventory_set", 
            productId: productId, 
            key: "default"
          });
        } else {
          text += "کدام تنوع را می‌خواهید تنظیم کنید؟";
          const buttons = [];
          combinations.forEach(combo => {
            const key = getVariantKey(combo);
            const stock = product.inventory?.[key] || 0;
            buttons.push([
              { text: `${combo.join(' - ')} (${stock})`, callback_data: `inv_set:${key}` }
            ]);
          });
          buttons.push([{ text: "🔙 بازگشت", callback_data: `inventory:${productId}` }]);
          
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: text,
            reply_markup: {
              inline_keyboard: buttons
            }
          });
        }
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      // ============================
      // Discounts
      // ============================
      if (data === "discount_product_menu") {
        await sendProductListForSelection(chatId, "discount_product", "🎯 انتخاب محصول برای اعمال تخفیف");
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data.startsWith("discount_product:")) {
        const productId = data.replace("discount_product:", "");
        const product = await getProductById(productId);
        if (!product) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ محصول پیدا نشد."
          });
          return { statusCode: 200, body: "ok" };
        }
        
        userStates.set(chatId, { 
          step: "awaiting_discount_amount", 
          productId: productId,
          discountType: "product"
        });
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `🎯 اعمال تخفیف روی محصول: ${product.name}\n\n` +
                `💰 قیمت فعلی: ${product.price?.toLocaleString() || 'نامشخص'} تومان\n\n` +
                `مقدار تخفیف را وارد کنید (مثال: 20% یا 50000):\n` +
                `(برای حذف تخفیف، 'حذف' را بفرستید)`
        });
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data === "discount_category_menu") {
        const { categories } = await getCategories();
        if (categories.length === 0) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ هیچ دسته‌بندی وجود ندارد."
          });
          return { statusCode: 200, body: "ok" };
        }
        
        let text = "📂 انتخاب دسته‌بندی برای اعمال تخفیف:\n\n";
        const buttons = [];
        categories.forEach(cat => {
          buttons.push([
            { text: `${cat.icon || '📁'} ${cat.name}`, callback_data: `discount_category:

${cat.id}` }
          ]);
        });
        buttons.push([{ text: "🔙 بازگشت", callback_data: "back_main" }]);
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: text,
          reply_markup: {
            inline_keyboard: buttons
          }
        });
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data.startsWith("discount_category:")) {
        const categoryId = data.replace("discount_category:", "");
        const { categories } = await getCategories();
        const category = categories.find(c => c.id === categoryId);
        
        if (!category) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ دسته‌بندی پیدا نشد."
          });
          return { statusCode: 200, body: "ok" };
        }
        
        userStates.set(chatId, { 
          step: "awaiting_discount_amount", 
          categoryId: categoryId,
          discountType: "category"
        });
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `📂 اعمال تخفیف روی دسته‌بندی: ${category.name}\n\n` +
                `مقدار تخفیف را وارد کنید (مثال: 20% یا 50000):\n` +
                `(برای حذف تخفیف، 'حذف' را بفرستید)`
        });
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data === "discount_feature_menu") {
        let text = "✨ اعمال تخفیف روی محصولات با ویژگی خاص\n\n";
        text += "ویژگی مورد نظر را انتخاب کنید:\n\n";
        text += "1. 🌟 ویژه (isFeatured)\n";
        text += "2. 🔥 پرفروش (isBestseller)\n";
        text += "3. 🆕 جدید (isNew)\n";
        text += "\nشماره ویژگی را وارد کنید:";
        
        userStates.set(chatId, { step: "awaiting_discount_feature" });
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: text
        });
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data === "view_all_discounts") {
        const { discounts } = await getDiscounts();
        
        if (discounts.length === 0) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ هیچ تخفیفی ثبت نشده است."
          });
        } else {
          let text = "🏷️ لیست کامل تخفیف‌ها:\n\n";
          discounts.forEach((d, index) => {
            text += `${index + 1}. ${d.type === 'product' ? '🎯 محصول' : d.type === 

'category' ? '📂 دسته‌بندی' : '✨ ویژه'}\n`;
            if (d.type === 'product') {
              text += `   محصول: ${d.productId || 'نامشخص'}\n`;
            } else if (d.type === 'category') {
              text += `   دسته‌بندی: ${d.categoryId || 'نامشخص'}\n`;
            } else {
              text += `   ویژگی: ${d.feature || 'نامشخص'}\n`;
            }
            text += `   💰 ${d.amount}${d.isPercentage ? '%' : ' تومان'}\n`;
            text += `   📅 ${d.startDate || 'نامشخص'} تا ${d.endDate || 'نامشخص'}\n\n`;
          });
          
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: text
          });
        }
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      // ============================
      // Featured Products
      // ============================
      if (data === "featured_select" || data === "bestseller_select" || data === 

"new_select") {
        const type = data.replace("_select", "");
        const label = type === "featured" ? "🌟 ویژه" : type === "bestseller" ? "🔥 پرفروش" : "🆕 

جدید";
        
        await sendProductListForSelection(chatId, `featured_set:${type}`, `⭐ انتخاب محصول 

${label}`);
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data.startsWith("featured_set:")) {
        const [, type, productId] = data.split(':');
        const product = await getProductById(productId);
        
        if (!product) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ محصول پیدا نشد."
          });
          return { statusCode: 200, body: "ok" };
        }
        
        // Toggle the feature
        const updates = {};
        if (type === "featured") updates.isFeatured = !product.isFeatured;
        else if (type === "bestseller") updates.isBestseller = !product.isBestseller;
        else if (type === "new") updates.isNew = !product.isNew;
        
        await updateProduct(productId, updates);
        
        const status = Object.values(updates)[0] ? 'فعال' : 'غیرفعال';
        const label = type === "featured" ? "ویژه" : type === "bestseller" ? "پرفروش" : "جدید";
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `✅ وضعیت ${label} برای محصول ${product.name} به ${status} تغییر کرد.`
        });
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data === "featured_view_all") {
        const { products } = await getProducts();
        const featured = products.filter(p => p.isFeatured || p.isBestseller || p.isNew);
        
        if (featured.length === 0) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ هیچ محصول ویژه‌ای وجود ندارد."
          });
        } else {
          let text = "⭐ محصولات ویژه:\n\n";
          featured.forEach(p => {
            const badges = [];
            if (p.isFeatured) badges.push("🌟 ویژه");
            if (p.isBestseller) badges.push("🔥 پرفروش");
            if (p.isNew) badges.push("🆕 جدید");
            text += `${p.name}\n`;
            text += `   🏷️ ${badges.join(', ')}\n`;
            text += `   💰 ${p.price?.toLocaleString() || 'نامشخص'} تومان\n\n`;
          });
          
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: text
          });
        }
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      // ============================
      // Categories Management
      // ============================
      if (data === "add_category") {
        userStates.set(userId, { step: "awaiting_category_name" });
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "📂 نام دسته‌بندی جدید را وارد کنید:\n\nمثال: لباس مجلسی"
        });
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data === "edit_category_menu") {
        const { categories } = await getCategories();
        if (categories.length === 0) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ هیچ دسته‌بندی برای ویرایش وجود ندارد."
          });
          return { statusCode: 200, body: "ok" };
        }
        
        let text = "✏️ انتخاب دسته‌بندی برای ویرایش:\n\n";
        const buttons = [];
        categories.forEach(cat => {
          buttons.push([
            { text: `${cat.icon || '📁'} ${cat.name}`, callback_data: `edit_category:

${cat.id}` }
          ]);
        });
        buttons.push([{ text: "🔙 بازگشت", callback_data: "back_main" }]);
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: text,
          reply_markup: {
            inline_keyboard: buttons
          }
        });
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data.startsWith("edit_category:")) {
        const categoryId = data.replace("edit_category:", "");
        const { categories } = await getCategories();
        const category = categories.find(c => c.id === categoryId);
        
        if (!category) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ دسته‌بندی پیدا نشد."
          });
          return { statusCode: 200, body: "ok" };
        }
        
        userStates.set(userId, { 
          step: "awaiting_category_edit", 
          categoryId: categoryId 
        });
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `✏️ ویرایش دسته‌بندی: ${category.name}\n\n` +
                `نام جدید را وارد کنید یا 'لغو' بفرستید:`
        });
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data === "delete_category_menu") {
        const { categories } = await getCategories();
        if (categories.length === 0) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ هیچ دسته‌بندی برای حذف وجود ندارد."
          });
          return { statusCode: 200, body: "ok" };
        }
        
        let text = "🗑 انتخاب دسته‌بندی برای حذف:\n\n";
        const buttons = [];
        categories.forEach(cat => {
          buttons.push([
            { text: `${cat.icon || '📁'} ${cat.name}`, callback_data: `delete_category:

${cat.id}` }
          ]);
        });
        buttons.push([{ text: "🔙 بازگشت", callback_data: "back_main" }]);
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: text,
          reply_markup: {
            inline_keyboard: buttons
          }
        });
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      if (data.startsWith("delete_category:")) {
        const categoryId = data.replace("delete_category:", "");
        
        try {
          await deleteCategory(categoryId);
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: `✅ دسته‌بندی با موفقیت حذف شد.`
          });
        } catch (error) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: `❌ خطا: ${error.message}`
          });
        }
        
        await baleRequest("answerCallbackQuery", { callback_query_id: callback.id });
        return { statusCode: 200, body: "ok" };
      }

      // ============================
      // Confirm Product
      // ============================
      if (data === "confirm_product") {
        const product = pendingProducts.get(userId);
        if (!product) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ اطلاعات محصول پیدا نشد. لطفاً دوباره شروع کنید."
          });
          return { statusCode: 200, body: "ok" };
        }

        await baleRequest("answerCallbackQuery", {
          callback_query_id: callback.id,
          text: "در حال ثبت محصول..."
        });

        try {
          const productId = generateProductId();
          const image = await uploadImageToGitHub(product.photoId, productId);

          const savedProduct = {
            id: productId,
            name: product.name,
            category: product.category,
            price: product.price,
            discount: product.discount || null,
            variants: product.variants || [],
            inventory: product.inventory || {},
            features: product.features || [],
            image: image.path,
            isFeatured: false,
            isBestseller: false,
            isNew: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          await addProduct(savedProduct);
          pendingProducts.delete(userId);
          userStates.delete(userId);

          const finalPrice = calculateFinalPrice(savedProduct.price, 

savedProduct.discount);
          let responseText = `✅ محصول با موفقیت ثبت شد.\n\n`;
          responseText += `📌 نام: ${savedProduct.name}\n`;
          responseText += `📂 دسته‌بندی: ${savedProduct.category}\n`;
          responseText += `💰 قیمت: ${savedProduct.price?.toLocaleString() || 'نامشخص'} تومان\n`;
          if (savedProduct.discount) {
            responseText += `🏷️ تخفیف: 

${savedProduct.discount.amount}${savedProduct.discount.isPercentage ? '%' : ' تومان'}\n`;
            responseText += `💰 قیمت نهایی: ${finalPrice.toLocaleString()} تومان\n`;
          }
          responseText += `🆔 شناسه: ${savedProduct.id}`;

          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: responseText
          });

        } catch (error) {
          console.error("PRODUCT SAVE ERROR:", error);
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: `❌ هنگام ثبت محصول خطایی رخ داد.\n\nجزئیات: ${error.message}`
          });
        }

        return { statusCode: 200, body: "ok" };
      }

      if (data === "cancel_product") {
        pendingProducts.delete(userId);
        userStates.delete(userId);
        await baleRequest("answerCallbackQuery", {
          callback_query_id: callback.id,
          text: "لغو شد"
        });
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ ثبت محصول لغو شد."
        });
        return { statusCode: 200, body: "ok" };
      }

      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // Message Handler
    // =================================
    const message = update.message;
    if (!message) {
      return { statusCode: 200, body: "ok" };
    }

    const chatId = message.chat?.id;
    const userId = message.from?.id || chatId;
    const text = message.text || "";

    if (!chatId) {
      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // /start
    // =================================
    if (text === "/start") {
      await sendMainMenu(chatId);
      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // Main Menu Commands
    // =================================
    if (text === "➕ افزودن محصول") {
      const product = {
        name: null,
        photoId: null,
        category: null,
        variants: [],
        inventory: {},
        price: null,
        discount: null,
        features: []
      };
      
      pendingProducts.set(userId, product);
      userStates.set(userId, { step: "awaiting_photo" });
      
      await baleRequest("sendMessage", {
        chat_id: chatId,
        text: "📷 لطفاً عکس محصول را ارسال کنید و نام محصول را در کپشن عکس بنویسید."
      });
      
      return { statusCode: 200, body: "ok" };
    }

    if (text === "🔍 جستجوی محصول") {
      userStates.set(userId, { step: "awaiting_search" });
      await baleRequest("sendMessage", {
        chat_id: chatId,
        text: "🔍 عبارت جستجو را وارد کنید:\n\n(نام محصول، شناسه یا دسته‌بندی)"
      });
      return { statusCode: 200, body: "ok" };
    }

    if (text === "📦 مدیریت محصولات") {
      await sendProductManagementMenu(chatId);
      return { statusCode: 200, body: "ok" };
    }

    if (text === "📂 مدیریت دسته‌بندی") {
      await sendCategoryManagementMenu(chatId);
      return { statusCode: 200, body: "ok" };
    }

    if (text === "🏷️ مدیریت تخفیف‌ها") {
      await sendDiscountManagementMenu(chatId);
      return { statusCode: 200, body: "ok" };
    }

    if (text === "⭐ محصولات ویژه") {
      await sendFeaturedProductsMenu(chatId);
      return { statusCode: 200, body: "ok" };
    }

    if (text === "🌐 مشاهده سایت") {
      await baleRequest("sendMessage", {
        chat_id: chatId,
        text: "🌐 سایت HamedShop:\n\nhttps://khanepaz.github.io/hamed_test1/"
      });
      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // State-based handlers
    // =================================
    const userState = userStates.get(userId);

    // =================================
    // Search
    // =================================
    if (userState && userState.step === "awaiting_search") {
      const query = text.trim();
      const results = await searchProducts(query);
      
      if (results.length === 0) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ هیچ محصولی با عبارت جستجو پیدا نشد."
        });
        userStates.delete(userId);
        return { statusCode: 200, body: "ok" };
      }
      
      let response = `🔍 نتایج جستجو برای "${query}":\n\n`;
      results.forEach((p, index) => {
        response += `${index + 1}. ${p.name}\n`;
        response += `   🆔 ${p.id}\n`;
        response += `   📂 ${p.category || 'بدون دسته‌بندی'}\n`;
        response += `   💰 ${p.price?.toLocaleString() || 'نامشخص'} تومان\n`;
        const totalStock = p.inventory ? Object.values(p.inventory).reduce((a, b) => a + 

b, 0) : 0;
        response += `   📊 موجودی: ${totalStock}\n\n`;
      });
      
      // Add buttons for product actions
      const buttons = [];
      results.slice(0, 10).forEach(p => {
        buttons.push([
          { text: `📦 ${p.name}`, callback_data: `edit_product:${p.id}` }
        ]);
      });
      buttons.push([{ text: "🔙 بازگشت به منوی اصلی", callback_data: "back_main" }]);
      
      await baleRequest("sendMessage", {
        chat_id: chatId,
        text: response,
        reply_markup: {
          inline_keyboard: buttons
        }
      });
      
      userStates.delete(userId);
      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // Product Creation: Photo
    // =================================
    if (message.photo && message.photo.length > 0) {
      const photos = message.photo;
      const largestPhoto = photos[photos.length - 1];
      const photoId = largestPhoto.file_id;
      const caption = (message.caption || "").trim();

      if (!caption) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ لطفاً نام محصول را در کپشن عکس بنویسید."
        });
        return { statusCode: 200, body: "ok" };
      }

      let product = pendingProducts.get(userId);
      
      if (!product) {
        product = {
          name: null,
          photoId: null,
          category: null,
          variants: [],
          inventory: {},
          price: null,
          discount: null,
          features: []
        };
      }

      product.name = caption;
      product.photoId = photoId;
      pendingProducts.set(userId, product);
      userStates.set(userId, { step: "awaiting_category" });

      // Show category selection
      const { categories } = await getCategories();
      
      if (categories.length === 0) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ هیچ دسته‌بندی وجود ندارد. لطفاً ابتدا از بخش مدیریت دسته‌بندی یک دسته‌بندی ایجاد کنید."
        });
        return { statusCode: 200, body: "ok" };
      }

      const inlineKeyboard = [];
      let row = [];
      
      categories.forEach((cat, index) => {
        row.push({ text: `${cat.icon || '📁'} ${cat.name}`, callback_data: `category:

${cat.id}` });
        if ((index + 1) % 2 === 0) {
          inlineKeyboard.push(row);
          row = [];
        }
      });
      
      if (row.length > 0) {
        inlineKeyboard.push(row);
      }

      await baleRequest("sendMessage", {
        chat_id: chatId,
        text: "📂 لطفاً دسته‌بندی محصول را انتخاب کنید:",
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      });

      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // Variants input
    // =================================
    if (userState && userState.step === "awaiting_variants") {
      const product = pendingProducts.get(userId);
      
      if (text.toLowerCase() !== "ردی") {
        // Parse variants: e.g., "سایز: S,M,L" or "رنگ: قرمز,آبی,سبز"
        const variantLines = text.split('\n').filter(line => line.includes(':'));
        const variants = [];
        
        variantLines.forEach(line => {
          const [name, values] = line.split(':').map(s => s.trim());
          const options = values.split(',').map(v => v.trim());
          variants.push({ name, options });
        });
        
        product.variants = variants;
        
        // Initialize inventory for each combination
        if (variants.length > 0) {
          const combinations = getVariantCombinations(variants);
          combinations.forEach(combo => {
            const key = getVariantKey(combo);
            product.inventory[key] = 0;
          });
        } else {
          product.inventory = { default: 0 };
        }
      } else {
        product.inventory = { default: 0 };
      }
      
      pendingProducts.set(userId, product);
      userStates.set(userId, { step: "awaiting_price" });
      
      await baleRequest("sendMessage", {
        chat_id: chatId,
        text: "💰 قیمت محصول را به تومان وارد کنید:"
      });
      
      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // Price input
    // =================================
    if (userState && userState.step === "awaiting_price") {
      const product = pendingProducts.get(userId);
      const price = parseInt(text.replace(/,/g, ''));
      
      if (isNaN(price) || price <= 0) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ لطفاً یک عدد معتبر برای قیمت وارد کنید."
        });
        return { statusCode: 200, body: "ok" };
      }
      
      product.price = price;
      pendingProducts.set(userId, product);
      userStates.set(userId, { step: "awaiting_discount" });
      
      await baleRequest("sendMessage", {
        chat_id: chatId,
        text: "🏷️ تخفیف محصول را وارد کنید (درصد یا مبلغ ثابت):\n\nمثال: 20% یا 50000\n\nاگر تخفیفی ندارد، 'ردی' را بفرستید."
      });
      
      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // Discount input
    // =================================
    if (userState && userState.step === "awaiting_discount") {
      const product = pendingProducts.get(userId);
      
      if (text.toLowerCase() !== "ردی") {
        const discountMatch = text.match(/(\d+)(%?)/);
        if (discountMatch) {
          const amount = parseInt(discountMatch[1]);
          const isPercentage = discountMatch[2] === '%';
          product.discount = { amount, isPercentage };
        } else {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: "❌ فرمت تخفیف نامعتبر است. دوباره وارد کنید یا 'ردی' بفرستید."
          });
          return { statusCode: 200, body: "ok" };
        }
      }
      
      pendingProducts.set(userId, product);
      userStates.set(userId, { step: "awaiting_features" });
      
      await baleRequest("sendMessage", {
        chat_id: chatId,
        text: "⭐ ویژگی‌های محصول را وارد کنید (هر خط یک ویژگی):\n\nمثال:\nضد آب\nسبک و مقاوم\n\nاگر ویژگی ندارد، 'ردی' را بفرستید."
      });
      
      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // Features input
    // =================================
    if (userState && userState.step === "awaiting_features") {
      const product = pendingProducts.get(userId);
      
      if (text.toLowerCase() !== "ردی") {
        const features = text.split('\n').filter(line => line.trim());
        product.features = features;
      }
      
      pendingProducts.set(userId, product);
      userStates.set(userId, { step: "awaiting_confirm" });
      
      // Show product summary and ask for confirmation
      const finalPrice = calculateFinalPrice(product.price, product.discount);
      let summary = "📦 خلاصه محصول:\n\n";
      summary += `📌 نام: ${product.name}\n`;
      summary += `📂 دسته‌بندی: ${product.category}\n`;
      summary += `💰 قیمت: ${product.price.toLocaleString()} تومان\n`;
      
      if (product.discount) {
        summary += `🏷️ تخفیف: ${product.discount.amount}${product.discount.isPercentage ? '%' 

: ' تومان'}\n`;
        summary += `💰 قیمت نهایی: ${finalPrice.toLocaleString()} تومان\n`;
      }
      
      if (product.variants.length > 0) {
        summary += "\n📊 تنوع‌ها:\n";
        product.variants.forEach(v => {
          summary += `   ${v.name}: ${v.options.join(', ')}\n`;
        });
        
        const totalStock = Object.values(product.inventory).reduce((a, b) => a + b, 0);
        summary += `   📊 مجموع موجودی: ${totalStock}\n`;
      }
      
      if (product.features.length > 0) {
        summary += "\n⭐ ویژگی‌ها:\n";
        product.features.forEach(f => {
          summary += `   • ${f}\n`;
        });
      }
      
      summary += "\nآیا محصول ثبت شود؟";
      
      await baleRequest("sendMessage", {
        chat_id: chatId,
        text: summary,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ ثبت نهایی", callback_data: "confirm_product" },
              { text: "❌ لغو", callback_data: "cancel_product" }
            ]
          ]
        }
      });
      
      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // Edit Product
    // =================================
    if (userState && userState.step === "editing_product") {
      const editData = pendingEdits.get(userId);
      if (!editData) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ خطا در ویرایش محصول."
        });
        return { statusCode: 200, body: "ok" };
      }
      
      if (text.toLowerCase() === "لغو") {
        userStates.delete(userId);
        pendingEdits.delete(userId);
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ ویرایش لغو شد."
        });
        return { statusCode: 200, body: "ok" };
      }
      
      const fieldNumber = parseInt(text);
      const product = await getProductById(editData.productId);
      
      if (!product) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ محصول پیدا نشد."
        });
        return { statusCode: 200, body: "ok" };
      }
      
      // Map field numbers to field names
      const fieldMap = {
        1: "name",
        2: "price",
        3: "discount",
        4: "category",
        5: "features"
      };
      
      const field = fieldMap[fieldNumber];
      if (!field) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ شماره فیلد نامعتبر است. لطفاً یک شماره بین 1 تا 5 وارد کنید."
        });
        return { statusCode: 200, body: "ok" };
      }
      
      // Store edit context
      pendingEdits.set(userId, { ...editData, field: field });
      userStates.set(userId, { step: `editing_${field}` });
      
      let prompt = "";
      switch(field) {
        case "name":
          prompt = `📝 نام جدید را وارد کنید:\n(فعلی: ${product.name})`;
          break;
        case "price":
          prompt = `💰 قیمت جدید را وارد کنید:\n(فعلی: ${product.price?.toLocaleString() || 'نامشخص'} تومان)`;
          break;
        case "discount":
          prompt = `🏷️ تخفیف جدید را وارد کنید (مثال: 20% یا 50000):\n(فعلی: ${product.discount ? `

${product.discount.amount}${product.discount.isPercentage ? '%' : ' تومان'}` : 'ندارد'})`;
          break;
        case "category":
          prompt = `📂 دسته‌بندی جدید را وارد کنید:\n(فعلی: ${product.category || 'ندارد'})`;
          break;
        case "features":
          prompt = `⭐ ویژگی‌های جدید را وارد کنید (هر خط یک ویژگی):\n(فعلی: ${product.features?.length > 0 ? 

product.features.join(', ') : 'ندارد'})`;
          break;
      }
      
      await baleRequest("sendMessage", {
        chat_id: chatId,
        text: prompt
      });
      
      return { statusCode: 200, body: "ok" };
    }

    // Handle specific edit fields
    const editSteps = ["editing_name", "editing_price", "editing_discount", 

"editing_category", "editing_features"];
    if (userState && editSteps.includes(userState.step)) {
      const editData = pendingEdits.get(userId);
      if (!editData) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ خطا در ویرایش محصول."
        });
        return { statusCode: 200, body: "ok" };
      }
      
      const product = await getProductById(editData.productId);
      if (!product) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ محصول پیدا نشد."
        });
        return { statusCode: 200, body: "ok" };
      }
      
      let updates = {};
      
      switch(userState.step) {
        case "editing_name":
          updates.name = text.trim();
          break;
        case "editing_price":
          const price = parseInt(text.replace(/,/g, ''));
          if (isNaN(price) || price <= 0) {
            await baleRequest("sendMessage", {
              chat_id: chatId,
              text: "❌ لطفاً یک عدد معتبر وارد کنید."
            });
            return { statusCode: 200, body: "ok" };
          }
          updates.price = price;
          break;
        case "editing_discount":
          if (text.toLowerCase() !== "حذف") {
            const discountMatch = text.match(/(\d+)(%?)/);
            if (discountMatch) {
              updates.discount = {
                amount: parseInt(discountMatch[1]),
                isPercentage: discountMatch[2] === '%'
              };
            } else {
              await baleRequest("sendMessage", {
                chat_id: chatId,
                text: "❌ فرمت تخفیف نامعتبر است."
              });
              return { statusCode: 200, body: "ok" };
            }
          } else {
            updates.discount = null;
          }
          break;
        case "editing_category":
          updates.category = text.trim();
          break;
        case "editing_features":
          if (text.toLowerCase() !== "حذف") {
            updates.features = text.split('\n').filter(line => line.trim());
          } else {
            updates.features = [];
          }
          break;
      }
      
      updates.updatedAt = new Date().toISOString();
      
      try {
        await updateProduct(editData.productId, updates);
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `✅ محصول با موفقیت ویرایش شد.`
        });
        
        userStates.delete(userId);
        pendingEdits.delete(userId);
      } catch (error) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `❌ خطا: ${error.message}`
        });
      }
      
      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // Category creation
    // =================================
    if (userState && userState.step === "awaiting_category_name") {
      const categoryName = text.trim();
      
      try {
        const category = {
          id: generateCategoryId(),
          name: categoryName,
          icon: "📁",
          createdAt: new Date().toISOString()
        };
        
        await addCategory(category);
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `✅ دسته‌بندی "${categoryName}" با موفقیت ایجاد شد.`
        });
        
        userStates.delete(userId);
      } catch (error) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `❌ خطا: ${error.message}`
        });
      }
      
      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // Category edit
    // =================================
    if (userState && userState.step === "awaiting_category_edit") {
      if (text.toLowerCase() === "لغو") {
        userStates.delete(userId);
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ ویرایش دسته‌بندی لغو شد."
        });
        return { statusCode: 200, body: "ok" };
      }
      
      try {
        await updateCategory(userState.categoryId, { name: text.trim() });
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `✅ دسته‌بندی با موفقیت ویرایش شد.`
        });
        userStates.delete(userId);
      } catch (error) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `❌ خطا: ${error.message}`
        });
      }
      
      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // Discount amount input
    // =================================
    if (userState && userState.step === "awaiting_discount_amount") {
      const discountData = userState;
      
      if (text.toLowerCase() === "حذف") {
        // Remove discount
        if (discountData.discountType === "product") {
          const product = await getProductById(discountData.productId);
          if (product) {
            await updateProduct(discountData.productId, { discount: null });
            await baleRequest("sendMessage", {
              chat_id: chatId,
              text: `✅ تخفیف از محصول حذف شد.`
            });
          }
        } else if (discountData.discountType === "category") {
          // Remove all discounts from category
          const { discounts } = await getDiscounts();
          const categoryDiscounts = discounts.filter(d => d.categoryId === 

discountData.categoryId);
          for (const d of categoryDiscounts) {
            await deleteDiscount(d.id);
          }
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: `✅ تخفیف‌های دسته‌بندی حذف شدند.`
          });
        }
        
        userStates.delete(userId);
        return { statusCode: 200, body: "ok" };
      }
      
      const discountMatch = text.match(/(\d+)(%?)/);
      if (!discountMatch) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ فرمت تخفیف نامعتبر است. دوباره وارد کنید یا 'حذف' بفرستید."
        });
        return { statusCode: 200, body: "ok" };
      }
      
      const amount = parseInt(discountMatch[1]);
      const isPercentage = discountMatch[2] === '%';
      
      try {
        if (discountData.discountType === "product") {
          const product = await getProductById(discountData.productId);
          if (!product) {
            throw new Error("محصول پیدا نشد");
          }
          
          const discount = {
            id: generateDiscountId(),
            type: "product",
            productId: discountData.productId,
            amount: amount,
            isPercentage: isPercentage,
            startDate: new Date().toISOString(),
            endDate: null,
            createdAt: new Date().toISOString()
          };
          
          await addDiscount(discount);
          await updateProduct(discountData.productId, { discount: discount });
          
          const finalPrice = calculateFinalPrice(product.price, discount);
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: `✅ تخفیف با موفقیت روی محصول ${product.name} اعمال شد.\n\n` +
                  `💰 قیمت اصلی: ${product.price.toLocaleString()} تومان\n` +
                  `🏷️ تخفیف: ${amount}${isPercentage ? '%' : ' تومان'}\n` +
                  `💰 قیمت نهایی: ${finalPrice.toLocaleString()} تومان`
          });
          
        } else if (discountData.discountType === "category") {
          const { categories } = await getCategories();
          const category = categories.find(c => c.id === discountData.categoryId);
          if (!category) {
            throw new Error("دسته‌بندی پیدا نشد");
          }
          
          // Apply discount to all products in this category
          const { products } = await getProducts();
          const categoryProducts = products.filter(p => p.category === 

discountData.categoryId);
          
          if (categoryProducts.length === 0) {
            await baleRequest("sendMessage", {
              chat_id: chatId,
              text: `❌ هیچ محصولی در دسته‌بندی ${category.name} وجود ندارد.`
            });
            userStates.delete(userId);
            return { statusCode: 200, body: "ok" };
          }
          
          const discount = {
            id: generateDiscountId(),
            type: "category",
            categoryId: discountData.categoryId,
            amount: amount,
            isPercentage: isPercentage,
            startDate: new Date().toISOString(),
            endDate: null,
            createdAt: new Date().toISOString()
          };
          
          await addDiscount(discount);
          
          // Apply discount to all products in category
          for (const p of categoryProducts) {
            await updateProduct(p.id, { discount: discount });
          }
          
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: `✅ تخفیف با موفقیت روی دسته‌بندی ${category.name} اعمال شد.\n\n` +
                  `📦 تعداد محصولات: ${categoryProducts.length}\n` +
                  `🏷️ تخفیف: ${amount}${isPercentage ? '%' : ' تومان'}\n` +
                  `💰 این تخفیف روی تمام محصولات این دسته‌بندی اعمال شد.`
          });
        }
        
        userStates.delete(userId);
      } catch (error) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `❌ خطا: ${error.message}`
        });
      }
      
      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // Discount feature selection
    // =================================
    if (userState && userState.step === "awaiting_discount_feature") {
      const featureMap = {
        "1": "isFeatured",
        "2": "isBestseller",
        "3": "isNew"
      };
      
      const featureKey = featureMap[text.trim()];
      if (!featureKey) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ شماره نامعتبر. لطفاً 1، 2 یا 3 را وارد کنید."
        });
        return { statusCode: 200, body: "ok" };
      }
      
      const featureNames = {
        "isFeatured": "ویژه",
        "isBestseller": "پرفروش",
        "isNew": "جدید"
      };
      
      userStates.set(userId, { 
        step: "awaiting_discount_amount", 
        discountType: "feature",
        feature: featureKey,
        featureName: featureNames[featureKey]
      });
      
      await baleRequest("sendMessage", {
        chat_id: chatId,
        text: `✨ اعمال تخفیف روی محصولات ${featureNames[featureKey]}\n\n` +
              `مقدار تخفیف را وارد کنید (مثال: 20% یا 50000):\n` +
              `(برای حذف تخفیف، 'حذف' را بفرستید)`
      });
      
      return { statusCode: 200, body: "ok" };
    }

    // Handle discount feature amount
    if (userState && userState.step === "awaiting_discount_amount" && 

userState.discountType === "feature") {
      if (text.toLowerCase() === "حذف") {
        // Remove feature discounts
        const { products } = await getProducts();
        const featureKey = userState.feature;
        const featureProducts = products.filter(p => p[featureKey] === true);
        
        for (const p of featureProducts) {
          if (p.discount && p.discount.type === "feature") {
            await updateProduct(p.id, { discount: null });
          }
        }
        
        // Also remove from discounts list
        const { discounts } = await getDiscounts();
        const featureDiscounts = discounts.filter(d => d.type === "feature" && d.feature 

=== featureKey);
        for (const d of featureDiscounts) {
          await deleteDiscount(d.id);
        }
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `✅ تخفیف محصولات ${userState.featureName} حذف شد.`
        });
        
        userStates.delete(userId);
        return { statusCode: 200, body: "ok" };
      }
      
      const discountMatch = text.match(/(\d+)(%?)/);
      if (!discountMatch) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ فرمت تخفیف نامعتبر است. دوباره وارد کنید یا 'حذف' بفرستید."
        });
        return { statusCode: 200, body: "ok" };
      }
      
      const amount = parseInt(discountMatch[1]);
      const isPercentage = discountMatch[2] === '%';
      const featureKey = userState.feature;
      
      try {
        const { products } = await getProducts();
        const featureProducts = products.filter(p => p[featureKey] === true);
        
        if (featureProducts.length === 0) {
          await baleRequest("sendMessage", {
            chat_id: chatId,
            text: `❌ هیچ محصول ${userState.featureName}ای وجود ندارد.`
          });
          userStates.delete(userId);
          return { statusCode: 200, body: "ok" };
        }
        
        const discount = {
          id: generateDiscountId(),
          type: "feature",
          feature: featureKey,
          amount: amount,
          isPercentage: isPercentage,
          startDate: new Date().toISOString(),
          endDate: null,
          createdAt: new Date().toISOString()
        };
        
        await addDiscount(discount);
        
        // Apply discount to all featured products
        for (const p of featureProducts) {
          await updateProduct(p.id, { discount: discount });
        }
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `✅ تخفیف با موفقیت روی ${featureProducts.length} محصول ${userState.featureName} اعمال شد.\n

\n` +
                `🏷️ تخفیف: ${amount}${isPercentage ? '%' : ' تومان'}`
        });
        
        userStates.delete(userId);
      } catch (error) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `❌ خطا: ${error.message}`
        });
      }
      
      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // Inventory set exact
    // =================================
    if (userState && userState.step === "awaiting_inventory_set") {
      const amount = parseInt(text.replace(/,/g, ''));
      if (isNaN(amount) || amount < 0) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: "❌ لطفاً یک عدد معتبر (بزرگتر یا مساوی صفر) وارد کنید."
        });
        return { statusCode: 200, body: "ok" };
      }
      
      try {
        const product = await getProductById(userState.productId);
        if (!product) {
          throw new Error("محصول پیدا نشد");
        }
        
        if (!product.inventory) product.inventory = {};
        product.inventory[userState.key] = amount;
        
        await updateProduct(userState.productId, { inventory: product.inventory });
        
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `✅ موجودی با موفقیت به ${amount} تغییر یافت.`
        });
        
        userStates.delete(userId);
        
        // Show inventory menu again
        await sendInventoryMenu(chatId, userState.productId);
      } catch (error) {
        await baleRequest("sendMessage", {
          chat_id: chatId,
          text: `❌ خطا: ${error.message}`
        });
      }
      
      return { statusCode: 200, body: "ok" };
    }

    // =================================
    // Unknown message
    // =================================
    await baleRequest("sendMessage", {
      chat_id: chatId,
      text: "لطفاً از منوی اصلی یکی از گزینه‌ها را انتخاب کنید."
    });

    return { statusCode: 200, body: "ok" };

  } catch (error) {
    console.error("MAIN ERROR:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};
