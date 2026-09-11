// ============================================================
// HamedShop Customer Bot — Netlify Function
// Webhook endpoint for @Hamedtestshop_bot
// Set webhook to:
//   https://<your-site>/.netlify/functions/customer-bot
// Env:
//   BALE_CUSTOMER_BOT_TOKEN  (or BALE_BOT_TOKEN fallback)
//   BALE_PROVIDER_TOKEN      (optional, for invoices)
// ============================================================

const { jsonResponse, parseJsonBody } = require("./lib/utils");
const {
  handleCustomerMessage,
  handleCustomerCallback,
  handlePreCheckout
} = require("./lib/customer-handlers");

exports.handler = async function (event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return jsonResponse(200, { ok: true });
    }

    if (event.httpMethod === "GET") {
      return jsonResponse(200, {
        ok: true,
        service: "HamedShop Customer Bot",
        bot: "@Hamedtestshop_bot"
      });
    }

    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { ok: false, error: "Method not allowed" });
    }

    const body = parseJsonBody(event);

    // Pre-checkout (must answer quickly)
    if (body.pre_checkout_query) {
      await handlePreCheckout(body.pre_checkout_query);
      return jsonResponse(200, { ok: true });
    }

    if (body.callback_query) {
      await handleCustomerCallback(body.callback_query);
      return jsonResponse(200, { ok: true });
    }

    if (body.message) {
      await handleCustomerMessage(body.message);
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(200, { ok: true, ignored: true });
  } catch (error) {
    console.error("Customer bot ERROR:", error);
    return jsonResponse(500, {
      ok: false,
      error: error.message || String(error)
    });
  }
};
