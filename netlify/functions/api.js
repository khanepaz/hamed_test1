
const GITHUB_OWNER = "khanepaz";
const GITHUB_REPO = "hamed_test1";
const GITHUB_BRANCH = "main";

const pendingProducts = new Map();


// ===============================
// Bale API
// ===============================
async function baleRequest(method, data) {
  const token = process.env.BALE_BOT_TOKEN;

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


// ===============================
// GitHub API
// ===============================
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


// ===============================
// Product ID
// ===============================
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


// ===============================
// Upload image to GitHub
// ===============================
async function uploadImageToGitHub(fileId, productId) {

  console.log("Getting Bale file information...");

  const fileInfo = await baleRequest("getFile", {
    file_id: fileId
  });

  if (!fileInfo || !fileInfo.file_path) {
    throw new Error("Bale file_path not found");
  }

  console.log("Bale file path:", fileInfo.file_path);

  const token = process.env.BALE_BOT_TOKEN;

  const fileUrl =
    `https://tapi.bale.ai/file/bot${token}/${fileInfo.file_path}`;

  console.log("Downloading image from Bale...");

  const imageResponse = await fetch(fileUrl);

  if (!imageResponse.ok) {
    throw new Error(
      `Could not download image from Bale: ${imageResponse.status}`
    );
  }

  const imageBuffer = await imageResponse.arrayBuffer();

  const base64Image = Buffer
    .from(imageBuffer)
    .toString("base64");

  const githubPath =
    `images/${productId}.jpg`;

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

  console.log("Image uploaded successfully.");

  return {
    path: githubPath,
    sha: result.content?.sha
  };
}


// ===============================
// Read products.json
// ===============================
async function getProductsFile() {

  try {

    const result = await githubRequest(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/products.json?ref=${GITHUB_BRANCH}`
    );

    const content = Buffer
      .from(result.content.replace(/\n/g, ""), "base64")
      .toString("utf8");

    const products = JSON.parse(content);

    return {
      products: Array.isArray(products) ? products : [],
      sha: result.sha
    };

  } catch (error) {

    // فایل وجود ندارد
    if (
      error.message.includes("GitHub API Error 404")
    ) {
      console.log("products.json does not exist yet.");

      return {
        products: [],
        sha: null
      };
    }

    throw error;
  }
}


// ===============================
// Save product to products.json
// ===============================
async function saveProductToGitHub(product) {

  const fileData = await getProductsFile();

  fileData.products.push(product);

  const jsonContent = JSON.stringify(
    fileData.products,
    null,
    2
  );

  const base64Content = Buffer
    .from(jsonContent, "utf8")
    .toString("base64");

  const body = {
    message: `Add product ${product.id}`,
    content: base64Content,
    branch: GITHUB_BRANCH
  };

  // اگر فایل قبلاً وجود داشته SHA لازم است
  if (fileData.sha) {
    body.sha = fileData.sha;
  }

  console.log("Updating products.json...");

  await githubRequest(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/products.json`,
    {
      method: "PUT",
      body: JSON.stringify(body)
    }
  );

  console.log("products.json updated successfully.");
}


// ===============================
// Send Main Menu
// ===============================
async function sendMainMenu(chatId) {

  await baleRequest("sendMessage", {
    chat_id: chatId,
    text: "🛍️ به HamedShop خوش آمدید\n\nلطفاً یک گزینه را انتخاب کنید:",
    reply_markup: {
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
            text: "🌐 مشاهده سایت"
          }
        ]
      ],
      resize_keyboard: true
    }
  });
}


// ===============================
// Category Menu
// ===============================
async function sendCategoryMenu(chatId) {

  await baleRequest("sendMessage", {
    chat_id: chatId,
    text: "📂 لطفاً دسته‌بندی محصول را انتخاب کنید:",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "👕 پوشاک",
            callback_data: "category:👕 پوشاک"
          },
          {
            text: "👟 کفش",
            callback_data: "category:👟 کفش"
          }
        ],
        [
          {
            text: "👜 کیف",
            callback_data: "category:👜 کیف"
          },
          {
            text: "💄 لوازم آرایشی",
            callback_data: "category:💄 لوازم آرایشی"
          }
        ],
        [
          {
            text: "🏠 لوازم خانه",
            callback_data: "category:🏠 لوازم خانه"
          },
          {
            text: "📱 دیجیتال",
            callback_data: "category:📱 دیجیتال"
          }
        ]
      ]
    }
  });
}


// ===============================
// Product Confirmation
// ===============================
async function sendProductConfirmation(chatId, product) {

  await baleRequest("sendMessage", {
    chat_id: chatId,
    text:
      `📦 اطلاعات محصول\n\n` +
      `📌 نام: ${product.name}\n` +
      `📂 دسته‌بندی: ${product.category}\n\n` +
      `آیا محصول ثبت شود؟`,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ ثبت نهایی",
            callback_data: "confirm_product"
          },
          {
            text: "❌ لغو",
            callback_data: "cancel_product"
          }
        ]
      ]
    }
  });
}


// ===============================
// Main Handler
// ===============================
exports.handler = async (event) => {

  try {

    // فقط POST
    if (event.httpMethod !== "POST") {

      return {
        statusCode: 200,
        body: "Bale webhook is running"
      };
    }


    const update =
      JSON.parse(event.body || "{}");

    console.log(
      "BALE UPDATE:",
      JSON.stringify(update)
    );


    // =================================
    // Callback Query
    // =================================
    if (update.callback_query) {

      const callback =
        update.callback_query;

      const chatId =
        callback.message?.chat?.id;

      const data =
        callback.data || "";

      const userId =
        callback.from?.id || chatId;


      // -----------------------------
      // Category
      // -----------------------------
      if (data.startsWith("category:")) {

        const category =
          data.replace("category:", "");

        const product =
          pendingProducts.get(userId);

        if (!product) {

          await baleRequest("sendMessage", {
            chat_id: chatId,
            text:
              "❌ اطلاعات محصول پیدا نشد.\nلطفاً دوباره محصول را اضافه کنید."
          });

          return {
            statusCode: 200,
            body: "ok"
          };
        }


        product.category = category;

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


      // -----------------------------
      // Confirm Product
      // -----------------------------
      if (data === "confirm_product") {

        const product =
          pendingProducts.get(userId);

        if (!product) {

          await baleRequest("sendMessage", {
            chat_id: chatId,
            text:
              "❌ اطلاعات محصول پیدا نشد.\nلطفاً دوباره محصول را اضافه کنید."
          });

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
            text: "در حال ثبت محصول..."
          }
        );


        try {

          // -----------------------------
          // ساخت ID
          // -----------------------------
          const productId =
            generateProductId();


          // -----------------------------
          // آپلود عکس
          // -----------------------------
          const image =
            await uploadImageToGitHub(
              product.photoId,
              productId
            );


          // -----------------------------
          // ساخت رکورد محصول
          // -----------------------------
          const savedProduct = {

            id: productId,

            name: product.name,

            category: product.category,

            image: image.path,

            createdAt:
              new Date().toISOString()
          };


          // -----------------------------
          // ذخیره در products.json
          // -----------------------------
          await saveProductToGitHub(
            savedProduct
          );


          // -----------------------------
          // پاک کردن محصول موقت
          // -----------------------------
          pendingProducts.delete(userId);


          // -----------------------------
          // پاسخ موفق
          // -----------------------------
          await baleRequest(
            "sendMessage",
            {
              chat_id: chatId,

              text:
                `✅ محصول با موفقیت ثبت شد.\n\n` +
                `📌 نام: ${savedProduct.name}\n` +
                `📂 دسته‌بندی: ${savedProduct.category}\n` +
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
              chat_id: chatId,

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


      // -----------------------------
      // Cancel Product
      // -----------------------------
      if (data === "cancel_product") {

        pendingProducts.delete(userId);


        await baleRequest(
          "answerCallbackQuery",
          {
            callback_query_id:
              callback.id,
            text: "لغو شد"
          }
        );


        await baleRequest(
          "sendMessage",
          {
            chat_id: chatId,
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


    // =================================
    // Message
    // =================================

    const message =
      update.message;


    if (!message) {

      return {
        statusCode: 200,
        body: "ok"
      };
    }


    const chatId =
      message.chat?.id;

    const userId =
      message.from?.id || chatId;


    if (!chatId) {

      return {
        statusCode: 200,
        body: "ok"
      };
    }


    const text =
      message.text || "";


    // =================================
    // /start
    // =================================
    if (text === "/start") {

      await sendMainMenu(chatId);

      return {
        statusCode: 200,
        body: "ok"
      };
    }


    // =================================
    // Add Product
    // =================================
    if (text === "➕ افزودن محصول") {

      await baleRequest(
        "sendMessage",
        {
          chat_id: chatId,

          text:
            "📷 لطفاً عکس محصول را ارسال کنید و نام محصول را در کپشن عکس بنویسید."
        }
      );


      return {
        statusCode: 200,
        body: "ok"
      };
    }


    // =================================
    // View Products
    // =================================
    if (text === "📦 مشاهده محصولات") {

      await baleRequest(
        "sendMessage",
        {
          chat_id: chatId,

          text:
            "📦 بخش مشاهده محصولات در مرحله بعدی فعال می‌شود."
        }
      );


      return {
        statusCode: 200,
        body: "ok"
      };
    }


    // =================================
    // Website
    // =================================
    if (text === "🌐 مشاهده سایت") {

      await baleRequest(
        "sendMessage",
        {
          chat_id: chatId,

          text:
            "🌐 سایت HamedShop:\n\nhttps://khanepaz.github.io/hamed_test1/"
        }
      );


      return {
        statusCode: 200,
        body: "ok"
      };
    }


    // =================================
    // Product Photo
    // =================================
    if (
      message.photo &&
      message.photo.length > 0
    ) {

      const photos =
        message.photo;

      const largestPhoto =
        photos[photos.length - 1];


      const photoId =
        largestPhoto.file_id;


      const caption =
        (message.caption || "").trim();


      if (!caption) {

        await baleRequest(
          "sendMessage",
          {
            chat_id: chatId,

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

        name: caption,

        photoId: photoId,

        category: null
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


    // =================================
    // Unknown message
    // =================================
    await baleRequest(
      "sendMessage",
      {
        chat_id: chatId,

        text:
          "لطفاً از منوی اصلی یکی از گزینه‌ها را انتخاب کنید."
      }
    );


    return {
      statusCode: 200,
      body: "ok"
    };

  } catch (error) {

    console.error(
      "MAIN ERROR:",
      error
    );


    return {
      statusCode: 500,

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        ok: false,
        error: error.message
      })
    };
  }
};

