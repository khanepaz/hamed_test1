// ===============================
// HamedShop - Bale Bot
// ===============================

// ذخیره موقت اطلاعات محصولات در حال ثبت
// فعلاً فقط برای تست
const pendingProducts = new Map();

// دسته‌بندی‌های پیش‌فرض
const CATEGORIES = [
  "👕 پوشاک",
  "👟 کفش",
  "👜 کیف",
  "💄 لوازم آرایشی",
  "🏠 لوازم خانه",
  "📱 دیجیتال"
];


// ===============================
// ارسال درخواست به Bale
// ===============================

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

  console.log(`BALE ${method}:`, text);

  return JSON.parse(text);
}


// ===============================
// منوی اصلی
// ===============================

async function showMainMenu(chatId) {

  return await baleRequest("sendMessage", {
    chat_id: chatId,
    text: "🛍️ به HamedShop خوش آمدید\n\nلطفاً یکی از گزینه‌ها را انتخاب کنید:",
    reply_markup: {
      keyboard: [
        [
          {
            text: "➕ افزودن محصول"
          }
        ],
        [
          {
            text: "📦 مشاهده محصولات"
          },
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
// درخواست عکس محصول
// ===============================

async function askForProductPhoto(chatId) {

  return await baleRequest("sendMessage", {
    chat_id: chatId,
    text:
      "📷 لطفاً عکس محصول را ارسال کنید.\n\n" +
      "⚠️ نام محصول را در کپشن عکس بنویسید.\n\n" +
      "مثال:\n" +
      "کفش اسپرت مردانه مدل X",
    reply_markup: {
      keyboard: [
        [
          {
            text: "❌ لغو"
          }
        ]
      ],
      resize_keyboard: true
    }
  });
}


// ===============================
// نمایش دسته‌بندی‌ها
// ===============================

async function showCategories(chatId) {

  const buttons = [];

  for (const category of CATEGORIES) {
    buttons.push([
      {
        text: category,
        callback_data: `category:${category}`
      }
    ]);
  }

  return await baleRequest("sendMessage", {
    chat_id: chatId,
    text: "📂 لطفاً دسته‌بندی محصول را انتخاب کنید:",
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}


// ===============================
// نمایش تأیید نهایی
// ===============================

async function showConfirmation(chatId, product) {

  // اول عکس محصول را نمایش می‌دهیم
  await baleRequest("sendPhoto", {
    chat_id: chatId,
    photo: product.photoId,
    caption:
      `🛍️ محصول جدید\n\n` +
      `📌 نام: ${product.name}\n` +
      `📂 دسته‌بندی: ${product.category}`,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ ثبت نهایی",
            callback_data: "product_confirm"
          }
        ],
        [
          {
            text: "❌ لغو",
            callback_data: "product_cancel"
          }
        ]
      ]
    }
  });
}


// ===============================
// Handler اصلی Netlify
// ===============================

exports.handler = async (event) => {

  try {

    // --------------------------------
    // درخواست GET
    // --------------------------------

    if (event.httpMethod !== "POST") {

      return {
        statusCode: 200,
        body: "Bale webhook is running"
      };
    }


    // --------------------------------
    // دریافت Update از Bale
    // --------------------------------

    const update = JSON.parse(event.body || "{}");

    console.log(
      "BALE UPDATE:",
      JSON.stringify(update)
    );


    // =================================
    // 1. پیام معمولی
    // =================================

    const message = update.message;


    if (message) {

      const chatId = message.chat?.id;

      if (!chatId) {

        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true,
            message: "No chat id"
          })
        };
      }


      const text = message.text || "";


      console.log("CHAT ID:", chatId);
      console.log("TEXT:", text);


      // =================================
      // /start
      // =================================

      if (text === "/start") {

        await showMainMenu(chatId);

        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true
          })
        };
      }


      // =================================
      // افزودن محصول
      // =================================

      if (text === "➕ افزودن محصول") {

        await askForProductPhoto(chatId);

        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true
          })
        };
      }


      // =================================
      // لغو
      // =================================

      if (text === "❌ لغو") {

        pendingProducts.delete(String(chatId));

        await showMainMenu(chatId);

        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true
          })
        };
      }


      // =================================
      // دریافت عکس محصول
      // =================================

      if (message.photo && message.photo.length > 0) {

        const photos = message.photo;

        // بزرگ‌ترین سایز عکس
        const largestPhoto =
          photos[photos.length - 1];

        const photoId = largestPhoto.file_id;

        // کپشن عکس
        const caption =
          (message.caption || "").trim();


        // اگر کپشن وجود نداشت
        if (!caption) {

          await baleRequest("sendMessage", {
            chat_id: chatId,
            text:
              "⚠️ کپشن عکس پیدا نشد.\n\n" +
              "لطفاً دوباره عکس را ارسال کنید و نام محصول را در کپشن بنویسید."
          });

          return {
            statusCode: 200,
            body: JSON.stringify({
              ok: true
            })
          };
        }


        // ذخیره موقت محصول
        pendingProducts.set(
          String(chatId),
          {
            photoId: photoId,
            name: caption
          }
        );


        // نمایش دسته‌بندی‌ها
        await showCategories(chatId);


        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true
          })
        };
      }


      // =================================
      // سایر پیام‌ها
      // =================================

      await baleRequest("sendMessage", {
        chat_id: chatId,
        text:
          "لطفاً از منوی اصلی یک گزینه را انتخاب کنید."
      });


      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true
        })
      };
    }


    // =================================
    // 2. Callback Query
    // =================================

    const callbackQuery = update.callback_query;


    if (callbackQuery) {

      const chatId =
        callbackQuery.message?.chat?.id;

      const callbackData =
        callbackQuery.data || "";


      if (!chatId) {

        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true
          })
        };
      }


      console.log(
        "CALLBACK:",
        callbackData
      );


      // ---------------------------------
      // انتخاب دسته‌بندی
      // ---------------------------------

      if (
        callbackData.startsWith("category:")
      ) {

        const category =
          callbackData.substring(
            "category:".length
          );


        const product =
          pendingProducts.get(
            String(chatId)
          );


        if (!product) {

          await baleRequest(
            "sendMessage",
            {
              chat_id: chatId,
              text:
                "⚠️ اطلاعات محصول پیدا نشد.\n\n" +
                "لطفاً دوباره از گزینه افزودن محصول شروع کنید."
            }
          );

          return {
            statusCode: 200,
            body: JSON.stringify({
              ok: true
            })
          };
        }


        // اضافه کردن دسته‌بندی
        product.category = category;


        // ذخیره مجدد
        pendingProducts.set(
          String(chatId),
          product
        );


        // نمایش تأیید نهایی
        await showConfirmation(
          chatId,
          product
        );


        // بستن حالت Loading دکمه
        await baleRequest(
          "answerCallbackQuery",
          {
            callback_query_id:
              callbackQuery.id
          }
        );


        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true
          })
        };
      }


      // ---------------------------------
      // ثبت نهایی
      // ---------------------------------

      if (
        callbackData === "product_confirm"
      ) {

        const product =
          pendingProducts.get(
            String(chatId)
          );


        if (!product) {

          await baleRequest(
            "sendMessage",
            {
              chat_id: chatId,
              text:
                "⚠️ اطلاعات محصول پیدا نشد."
            }
          );

          return {
            statusCode: 200,
            body: JSON.stringify({
              ok: true
            })
          };
        }


        // فعلاً فقط تأیید می‌کنیم
        // ذخیره دائمی را در مرحله بعد اضافه می‌کنیم

        console.log(
          "PRODUCT CONFIRMED:",
          JSON.stringify(product)
        );


        // حذف از لیست موقت
        pendingProducts.delete(
          String(chatId)
        );


        await baleRequest(
          "answerCallbackQuery",
          {
            callback_query_id:
              callbackQuery.id
          }
        );


        await baleRequest(
          "sendMessage",
          {
            chat_id: chatId,
            text:
              "✅ محصول با موفقیت ثبت شد.\n\n" +
              `📌 نام: ${product.name}\n` +
              `📂 دسته‌بندی: ${product.category}`,
            reply_markup: {
              keyboard: [
                [
                  {
                    text: "➕ افزودن محصول"
                  }
                ],
                [
                  {
                    text: "📦 مشاهده محصولات"
                  },
                  {
                    text: "🌐 مشاهده سایت"
                  }
                ]
              ],
              resize_keyboard: true
            }
          }
        );


        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true
          })
        };
      }


      // ---------------------------------
      // لغو محصول
      // ---------------------------------

      if (
        callbackData === "product_cancel"
      ) {

        pendingProducts.delete(
          String(chatId)
        );


        await baleRequest(
          "answerCallbackQuery",
          {
            callback_query_id:
              callbackQuery.id
          }
        );


        await showMainMenu(chatId);


        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true
          })
        };
      }
    }


    // =================================
    // پایان
    // =================================

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true
      })
    };


  } catch (error) {

    console.error(
      "ERROR:",
      error
    );


    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ok: false,
        error: error.message
      })
    };
  }
};
