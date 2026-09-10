// ============================================================
// HamedShop API v3 — Netlify Function Entry Point
// Bale Bot  ↔  Netlify  ↔  GitHub Pages
// ============================================================
// Modular architecture:
//   lib/config.js        – constants & defaults
//   lib/utils.js         – helpers
//   lib/pricing.js       – single source of truth for price/discount
//   lib/github.js        – GitHub storage
//   lib/bale.js          – Bale bot API
//   lib/products.js      – products, variants, inventory
//   lib/categories.js
//   lib/badges.js
//   lib/drafts.js        – wizard state
//   lib/orders.js        – orders + stock restore
//   lib/wizard.js        – product registration wizard
//   lib/ui.js            – admin list/detail screens
//   lib/handlers.js      – message & callback routing
//   lib/api-actions.js   – REST-like actions for the website
// ============================================================

const { API_VERSION, SITE_URL } = require("./lib/config");
const { jsonResponse, parseJsonBody } = require("./lib/utils");
const { handleMessage, handleCallbackQuery } = require("./lib/handlers");
const { handleApiAction } = require("./lib/api-actions");

exports.handler = async function (event) {
  try {
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return jsonResponse(200, { ok: true });
    }

    // Health check
    if (event.httpMethod === "GET") {
      return jsonResponse(200, {
        ok: true,
        service: "HamedShop API",
        version: API_VERSION,
        site: SITE_URL
      });
    }

    if (event.httpMethod !== "POST") {
      return jsonResponse(405, {
        ok: false,
        error: "Method not allowed"
      });
    }

    const body = parseJsonBody(event);

    // --------------------------------------------------------
    // Website / external API
    // --------------------------------------------------------
    if (body.action) {
      const result = await handleApiAction(body.action, body, event);
      return jsonResponse(200, { ok: true, result });
    }

    // --------------------------------------------------------
    // Bale callback
    // --------------------------------------------------------
    if (body.callback_query) {
      await handleCallbackQuery(body.callback_query, event);
      return jsonResponse(200, { ok: true });
    }

    // --------------------------------------------------------
    // Bale message
    // --------------------------------------------------------
    if (body.message) {
      await handleMessage(body.message, event);
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(200, { ok: true, ignored: true });
  } catch (error) {
    console.error("HamedShop API ERROR:", error);

    return jsonResponse(500, {
      ok: false,
      error: error.message || String(error)
    });
  }
};
