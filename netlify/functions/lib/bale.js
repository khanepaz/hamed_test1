// ============================================================
// HamedShop - Bale Bot API
// Supports admin bot (BALE_BOT_TOKEN) and customer bot
// (BALE_CUSTOMER_BOT_TOKEN, falls back to BALE_BOT_TOKEN)
// ============================================================

const { SITE_URL } = require("./config");

function getToken(which = "admin") {
  if (which === "customer") {
    return (
      process.env.BALE_CUSTOMER_BOT_TOKEN ||
      process.env.BALE_BOT_TOKEN
    );
  }
  return process.env.BALE_BOT_TOKEN;
}

async function baleRequest(method, data, which = "admin") {
  const token = getToken(which);

  if (!token) {
    throw new Error(
      which === "customer"
        ? "BALE_CUSTOMER_BOT_TOKEN (or BALE_BOT_TOKEN) is missing"
        : "BALE_BOT_TOKEN is missing"
    );
  }

  const response = await fetch(
    `https://tapi.bale.ai/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }
  );

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = { ok: false, raw: text };
  }

  if (!response.ok || !result.ok) {
    throw new Error("Bale API Error: " + JSON.stringify(result));
  }

  return result.result;
}

function inlineKeyboard(rows) {
  return { inline_keyboard: rows };
}

function mainKeyboard() {
  return {
    keyboard: [
      [
        { text: "➕ افزودن محصول" },
        { text: "📦 مشاهده محصولات" }
      ],
      [
        { text: "📂 دسته‌بندی‌ها" },
        { text: "📊 موجودی" }
      ],
      [{ text: "🏷️ گزینه‌های ویژه" }],
      [
        { text: "🛒 سفارش‌ها" },
        { text: "👥 مشتریان" }
      ],
      [
        { text: "🏷️ تخفیف‌ها" },
        { text: "⚙️ تنظیمات" }
      ],
      [{ text: "🌐 مشاهده سایت" }]
    ],
    resize_keyboard: true
  };
}

function customerKeyboard() {
  return {
    keyboard: [
      [
        { text: "🧾 سفارش‌های من" },
        { text: "🔍 پیگیری سفارش" }
      ],
      [
        { text: "🌐 فروشگاه" },
        { text: "📞 پشتیبانی" }
      ]
    ],
    resize_keyboard: true
  };
}

async function sendMessage(chatId, text, replyMarkup = null, which = "admin") {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown"
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return baleRequest("sendMessage", payload, which);
}

async function sendMainMenu(chatId) {
  return sendMessage(
    chatId,
    "🏠 *پنل مدیریت فروشگاه*\n\nیکی از گزینه‌های زیر را انتخاب کنید:",
    mainKeyboard()
  );
}

async function sendCustomerMenu(chatId) {
  return sendMessage(
    chatId,
    "🛍️ *سلام! به فروشگاه خوش آمدید*\n\nاز منوی زیر استفاده کنید یا اگر کد سفارش دارید، پیگیری را بزنید.",
    customerKeyboard(),
    "customer"
  );
}

async function answerCallbackQuery(callbackQueryId, text = "", which = "admin") {
  const payload = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;
  return baleRequest("answerCallbackQuery", payload, which);
}

async function sendPhoto(chatId, photoUrl, caption = "", replyMarkup = null, which = "admin") {
  const payload = {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: "Markdown"
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return baleRequest("sendPhoto", payload, which);
}

/**
 * Send Bale in-app invoice for payment.
 * Shop stores prices in Toman → amount sent as Rials (×10).
 */
async function sendInvoice(chatId, {
  title,
  description,
  payload,
  prices,
  photoUrl,
  needName = false,
  needPhoneNumber = false,
  needShippingAddress = false
}, which = "customer") {
  const providerToken =
    process.env.BALE_PROVIDER_TOKEN ||
    process.env.PROVIDER_TOKEN ||
    "";

  const body = {
    chat_id: chatId,
    title: String(title).slice(0, 32),
    description: String(description || "").slice(0, 255),
    payload: String(payload || "order"),
    provider_token: providerToken,
    currency: "IRR",
    prices: prices.map((p) => ({
      label: String(p.label).slice(0, 32),
      amount: Math.max(0, Math.round(Number(p.amount) || 0))
    })),
    need_name: needName,
    need_phone_number: needPhoneNumber,
    need_shipping_address: needShippingAddress
  };

  if (photoUrl) body.photo_url = photoUrl;

  return baleRequest("sendInvoice", body, which);
}

async function answerPreCheckoutQuery(preCheckoutQueryId, ok = true, errorMessage = "", which = "customer") {
  const body = {
    pre_checkout_query_id: preCheckoutQueryId,
    ok
  };
  if (!ok && errorMessage) body.error_message = errorMessage;
  return baleRequest("answerPreCheckoutQuery", body, which);
}

async function downloadBaleFile(fileId, which = "admin") {
  const file = await baleRequest("getFile", { file_id: fileId }, which);
  const token = getToken(which);
  const url = `https://tapi.bale.ai/file/bot${token}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to download file from Bale");
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = {
  baleRequest,
  getToken,
  inlineKeyboard,
  mainKeyboard,
  customerKeyboard,
  sendMessage,
  sendMainMenu,
  sendCustomerMenu,
  answerCallbackQuery,
  sendPhoto,
  sendInvoice,
  answerPreCheckoutQuery,
  downloadBaleFile,
  SITE_URL
};
