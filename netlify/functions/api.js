exports.handler = async (event) => {
  try {
    // فقط درخواست POST از Bale
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 200,
        body: "Bale webhook is running"
      };
    }

    // دریافت اطلاعات پیام
    const update = JSON.parse(event.body || "{}");

    console.log("BALE UPDATE:", JSON.stringify(update));

    const message = update.message;

    // اگر پیام معمولی نیست، کاری نکن
    if (!message) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          message: "No message found"
        })
      };
    }

    const chatId = message.chat?.id;
    const text = message.text || "";

    console.log("CHAT ID:", chatId);
    console.log("TEXT:", text);

    // اگر chat_id وجود ندارد
    if (!chatId) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          message: "No chat id"
        })
      };
    }

    const token = process.env.BALE_BOT_TOKEN;

    if (!token) {
      console.error("BALE_BOT_TOKEN is missing!");

      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: "BALE_BOT_TOKEN is missing"
        })
      };
    }

    // ارسال پاسخ به Bale
    const response = await fetch(
      `https://tapi.bale.ai/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: `پیامت رسید ✅\n\n${text}`
        })
      }
    );

    const result = await response.text();

    console.log("BALE RESPONSE:", result);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ok: true,
        baleResponse: result
      })
    };

  } catch (error) {
    console.error("ERROR:", error);

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
