// ============================================================
// HamedShop - Centralized Pricing Engine
// ============================================================
// Admin only provides:
//   - compareAtPrice  (real / original price)
//   - discountType    ("none" | "percent" | "amount")
//   - discountValue   (number)
// System always calculates:
//   - price / finalPrice
//   - discountAmount
//   - discountPercent
// ============================================================

const { safeNumber, safeText } = require("./utils");

/**
 * Calculate all price fields from original price + discount.
 * @param {object} input
 * @param {number} input.compareAtPrice  - original (real) price
 * @param {string} [input.discountType]  - "none" | "percent" | "amount"
 * @param {number} [input.discountValue]
 * @returns {object} complete pricing fields
 */
function calculatePricing({
  compareAtPrice = 0,
  discountType = "none",
  discountValue = 0
} = {}) {
  const original = Math.max(0, Math.round(safeNumber(compareAtPrice)));
  let type = safeText(discountType).toLowerCase() || "none";
  let value = Math.max(0, safeNumber(discountValue));

  if (!["none", "percent", "amount"].includes(type)) {
    type = "none";
    value = 0;
  }

  let discountAmount = 0;
  let discountPercent = 0;
  let final = original;

  if (type === "percent") {
    discountPercent = Math.min(100, Math.max(0, value));
    discountAmount = Math.round((original * discountPercent) / 100);
    final = Math.max(0, original - discountAmount);
  } else if (type === "amount") {
    discountAmount = Math.min(original, Math.max(0, Math.round(value)));
    discountPercent =
      original > 0 ? Math.round((discountAmount / original) * 100) : 0;
    final = Math.max(0, original - discountAmount);
  } else {
    type = "none";
    value = 0;
  }

  const label =
    type === "none"
      ? "بدون تخفیف"
      : type === "percent"
        ? `${discountPercent}%`
        : `${discountAmount.toLocaleString("fa-IR")} تومان`;

  return {
    compareAtPrice: original,
    price: final,
    finalPrice: final,
    discountAmount,
    discountPercent,
    discountType: type,
    discountValue: value,
    discountLabel: label
  };
}

/**
 * Parse free-text discount input from admin (wizard / edit).
 * Accepts:
 *   none | بدون تخفیف
 *   percent:15  |  %15  |  15%
 *   amount:50000
 * @returns {{ discountType, discountValue } | null}
 */
function parseDiscountInput(raw) {
  const value = safeText(raw).toLowerCase();

  if (
    !value ||
    value === "none" ||
    value === "بدون تخفیف" ||
    value === "ندارد" ||
    value === "0"
  ) {
    return { discountType: "none", discountValue: 0 };
  }

  // percent:15  or  amount:100000
  let match = value.match(/^(percent|amount)\s*[:=]\s*(\d+(?:\.\d+)?)$/i);
  if (match) {
    return {
      discountType: match[1].toLowerCase(),
      discountValue: safeNumber(match[2])
    };
  }

  // 15%  or  %15
  match = value.match(/^(\d+(?:\.\d+)?)\s*%$/) || value.match(/^%\s*(\d+(?:\.\d+)?)$/);
  if (match) {
    return {
      discountType: "percent",
      discountValue: safeNumber(match[1])
    };
  }

  // pure number → treat as percent if ≤ 100, otherwise as amount
  if (/^\d+(\.\d+)?$/.test(value)) {
    const n = safeNumber(value);
    if (n <= 100) {
      return { discountType: "percent", discountValue: n };
    }
    return { discountType: "amount", discountValue: n };
  }

  return null; // invalid
}

/**
 * Apply pricing to a product-like object (mutates & returns).
 * Keeps existing compareAtPrice / discountType / discountValue if present.
 */
function applyPricingToProduct(product = {}) {
  const pricing = calculatePricing({
    compareAtPrice:
      product.compareAtPrice ?? product.originalPrice ?? product.price ?? 0,
    discountType: product.discountType ?? "none",
    discountValue: product.discountValue ?? 0
  });

  return {
    ...product,
    ...pricing
  };
}

module.exports = {
  calculatePricing,
  parseDiscountInput,
  applyPricingToProduct
};
