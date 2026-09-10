// ============================================================
// HamedShop - Bale Bot API
// ============================================================

const { SITE_URL } = require("./config");

async function baleRequest(method, data) {
  const token = process.env.BALE_BOT_TOKEN;

  if (!token) {
    throw new Error("BALE_BOT_TOKEN is missing");
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
  return {
    inline_keyboard: rows
  };
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

async function sendMessage(chatId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown"
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  return baleRequest("sendMessage", payload);
}

async function sendMainMenu(chatId) {
  return sendMessage(
    chatId,
    "🏠 *پنل مدیریت فروشگاه*\n\nیکی از گزینه‌های زیر را انتخاب کنید:",
    mainKeyboard()
  );
}

async function answerCallbackQuery(callbackQueryId, text = "") {
  const payload = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;
  return baleRequest("answerCallbackQuery", payload);
}

/**
 * Download a file from Bale by file_id and return Buffer.
 */
async function downloadBaleFile(fileId) {
  const file = await baleRequest("getFile", { file_id: fileId });
  const token = process.env.BALE_BOT_TOKEN;
  const url = `https://tapi.bale.ai/file/bot${token}/${file.file_path}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to download file from Bale");
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = {
  baleRequest,
  inlineKeyboard,
  mainKeyboard,
  sendMessage,
  sendMainMenu,
  answerCallbackQuery,
  downloadBaleFile,
  SITE_URL
};
