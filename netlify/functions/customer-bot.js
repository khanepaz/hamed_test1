// ============================================================
// HamedShop Customer Bot — Netlify Function
// Webhook: https://<site>/.netlify/functions/customer-bot
// Env: BALE_CUSTOMER_BOT_TOKEN, BALE_PROVIDER_TOKEN
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
        bot: "@Hamedtestshop_bot",
        hint: "Set webhook to this URL. Requires BALE_CUSTOMER_BOT_TOKEN."
      });
    }

    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { ok: false, error: "Method not allowed" });
    }

    const body = parseJsonBody(event);

    if (body.pre_checkout_query) {
      try {
        await handlePreCheckout(body.pre_checkout_query);
      } catch (e) {
        console.error("pre_checkout:", e);
      }
      return jsonResponse(200, { ok: true });
    }

    if (body.callback_query) {
      try {
        await handleCustomerCallback(body.callback_query);
      } catch (e) {
        console.error("callback:", e);
      }
      return jsonResponse(200, { ok: true });
    }

    if (body.message) {
      try {
        await handleCustomerMessage(body.message);
      } catch (e) {
        console.error("message:", e);
      }
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(200, { ok: true, ignored: true });
  } catch (error) {
    console.error("Customer bot ERROR:", error);
    // Always 200 so Bale does not drop the webhook
    return jsonResponse(200, {
      ok: false,
      error: error.message || String(error)
    });
  }
};
