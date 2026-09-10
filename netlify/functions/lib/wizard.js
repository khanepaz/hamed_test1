// ============================================================
// HamedShop - Product Wizard
// ============================================================

const { sendMessage, inlineKeyboard } = require("./bale");
const { getDraft, saveDraft, deleteDraft } = require("./drafts");
const {
  createProduct,
  uploadBaleImage,
  parseAttributes,
  createVariantCombinations,
  updateProduct,
  getProduct
} = require("./products");
const { getCategoriesFile } = require("./categories");
const {
  safeNumber,
  safeText,
  escapeMd,
  formatPrice,
  generateProductId
} = require("./utils");
const { calculatePricing, parseDiscountInput } = require("./pricing");

async function startProductWizard(chatId) {
  const draft = {
    step: "name",
    name: "",
    images: [],
    categoryId: null,
    category: "",
    description: "",
    compareAtPrice: 0,
    discountType: "none",
    discountValue: 0,
    discountLabel: "بدون تخفیف",
    price: 0,
    attributes: {},
    variants: [],
    totalStock: 0,
    featured: false,
    tags: []
  };

  await saveDraft(chatId, draft);

  return sendMessage(
    chatId,
    "*ثبت محصول جدید*\n\n" + "1️⃣ نام محصول را ارسال کنید:"
  );
}

async function wizardNext(chatId, draft) {
  switch (draft.step) {
    case "photos":
      return sendMessage(
        chatId,
        "2️⃣ عکس محصول را ارسال کنید.\n\n" +
          `تعداد عکس‌های دریافت‌شده: ${draft.images.length}\n\n` +
          "بعد از ارسال همه عکس‌ها، روی «پایان عکس‌ها» بزنید.",
        inlineKeyboard([
          [{ text: "✅ پایان عکس‌ها", callback_data: "draft:photos_done" }],
          [{ text: "❌ لغو", callback_data: "draft:cancel" }]
        ])
      );

    case "category":
      return showCategorySelector(chatId);

    case "description":
      return sendMessage(
        chatId,
        "3️⃣ توضیحات محصول را ارسال کنید.",
        inlineKeyboard([
          [{ text: "⏭ بدون توضیحات", callback_data: "draft:skip_description" }]
        ])
      );

    case "price":
      return sendMessage(
        chatId,
        "4️⃣ *قیمت اصلی (واقعی)* محصول را به تومان وارد کنید.\n" +
          "مثال: `850000`\n\n" +
          "⚠️ فقط قیمت واقعی را بدهید. تخفیف در مرحله بعد جداگانه وارد می‌شود."
      );

    case "discount":
      return sendMessage(
        chatId,
        "5️⃣ مقدار تخفیف را وارد کنید (قیمت نهایی *خودکار* محاسبه می‌شود).\n\n" +
          "فرمت‌های قابل قبول:\n" +
          "• `percent:15`  یا  `15%`\n" +
          "• `amount:100000`\n" +
          "• `none`  یا  `بدون تخفیف`"
      );

    case "attributes":
      return sendMessage(
        chatId,
        "6️⃣ ویژگی‌های محصول را وارد کنید.\n\n" +
          "مثال:\n" +
          "`رنگ: مشکی, سفید`\n" +
          "`سایز: M, L, XL`\n\n" +
          "اگر محصول تنوع ندارد بنویسید: `ندارد`"
      );

    case "variantStock": {
      const index = draft.variantIndex || 0;
      const variant = draft.variants[index];
      return sendMessage(
        chatId,
        `7️⃣ موجودی تنوع *${escapeMd(variant.name)}* را وارد کنید.`
      );
    }

    case "stock":
      return sendMessage(chatId, "7️⃣ موجودی کل محصول را وارد کنید.");

    case "featured":
      return sendMessage(
        chatId,
        "8️⃣ محصول ویژه باشد؟",
        inlineKeyboard([
          [
            { text: "⭐ بله", callback_data: "draft:featured_yes" },
            { text: "خیر", callback_data: "draft:featured_no" }
          ]
        ])
      );

    case "tags":
      return sendMessage(
        chatId,
        "🔟 برچسب‌ها را با کاما جدا کنید.\n\n" +
          "مثال: `جدید, مردانه, پرفروش`\n\n" +
          "اگر ندارد بنویسید: `ندارد`"
      );

    case "preview":
      return productPreview(chatId, draft);
  }
}

async function productPreview(chatId, draft) {
  const pricing = calculatePricing({
    compareAtPrice: draft.compareAtPrice,
    discountType: draft.discountType,
    discountValue: draft.discountValue
  });

  const attributes =
    Object.entries(draft.attributes || {})
      .map(([key, values]) => `${escapeMd(key)}: ${escapeMd(values.join(", "))}`)
      .join("\n") || "ندارد";

  const variants = draft.variants.length
    ? draft.variants.map((v) => `• ${escapeMd(v.name)} — ${v.stock}`).join("\n")
    : "ندارد";

  return sendMessage(
    chatId,
    "*پیش‌نمایش محصول*\n\n" +
      `*نام:* ${escapeMd(draft.name)}\n` +
      `*دسته:* ${escapeMd(draft.category || "-")}\n` +
      `*توضیحات:* ${escapeMd(draft.description || "-")}\n\n` +
      `*قیمت اصلی:* ${formatPrice(pricing.compareAtPrice)}\n` +
      `*تخفیف:* ${escapeMd(pricing.discountLabel)}\n` +
      `*قیمت نهایی:* ${formatPrice(pricing.finalPrice)}\n\n` +
      `*ویژگی‌ها:*\n${attributes}\n\n` +
      `*تنوع‌ها:*\n${variants}\n\n` +
      `*موجودی کل:* ${draft.totalStock || 0}\n` +
      `*محصول ویژه:* ${draft.featured ? "بله" : "خیر"}\n` +
      `*برچسب‌ها:* ${draft.tags.length ? escapeMd(draft.tags.join(", ")) : "ندارد"}\n` +
      `*تعداد تصاویر:* ${draft.images.length}`,
    inlineKeyboard([
      [
        { text: "✅ تأیید و ثبت", callback_data: "draft:confirm" },
        { text: "✏️ ویرایش", callback_data: "draft:edit" }
      ],
      [{ text: "❌ لغو", callback_data: "draft:cancel" }]
    ])
  );
}

async function showCategorySelector(chatId) {
  const file = await getCategoriesFile();
  const rows = file.data
    .filter((c) => c.active !== false)
    .map((c) => [
      {
        text: `${c.icon || "📦"} ${c.name}`,
        callback_data: `category:${c.id}`
      }
    ]);

  rows.push([{ text: "❌ لغو", callback_data: "draft:cancel" }]);

  return sendMessage(
    chatId,
    "دسته‌بندی محصول را انتخاب کنید:",
    inlineKeyboard(rows)
  );
}

async function finalizeProduct(chatId) {
  const draft = await getDraft(chatId);
  if (!draft) throw new Error("Product draft not found");

  const pricing = calculatePricing({
    compareAtPrice: draft.compareAtPrice,
    discountType: draft.discountType,
    discountValue: draft.discountValue
  });

  const product = {
    id: generateProductId(),
    name: draft.name,
    description: draft.description,
    categoryId: draft.categoryId,
    category: draft.category,
    ...pricing,
    attributes: draft.attributes,
    variants: draft.variants,
    stock: draft.totalStock,
    totalStock: draft.totalStock,
    featured: draft.featured,
    tags: draft.tags,
    active: true,
    images: []
  };

  const imagePaths = [];
  for (let i = 0; i < draft.images.length; i++) {
    const image = draft.images[i];
    const path = `images/${product.id}${i === 0 ? "" : "-" + i}.jpg`;
    await uploadBaleImage(image.fileId, path);
    imagePaths.push(path);
  }

  product.images = imagePaths;
  product.image = imagePaths[0] || "";

  const created = await createProduct(product);
  await deleteDraft(chatId);
  return created;
}

async function handleWizardText(chatId, message) {
  const draft = await getDraft(chatId);
  if (!draft || !draft.step) return false;

  const value = safeText(message.text);
  if (!value) return false;

  switch (draft.step) {
    case "name": {
      draft.name = value;
      draft.step = "photos";
      await saveDraft(chatId, draft);
      await wizardNext(chatId, draft);
      return true;
    }

    case "description": {
      draft.description = value;
      draft.step = "price";
      await saveDraft(chatId, draft);
      await wizardNext(chatId, draft);
      return true;
    }

    case "price": {
      if (!/^\d+(\.\d+)?$/.test(value)) {
        await sendMessage(chatId, "❗ قیمت نامعتبر است. فقط عدد وارد کنید (مثال: 850000).");
        return true;
      }
      draft.compareAtPrice = safeNumber(value);
      draft.step = "discount";
      await saveDraft(chatId, draft);
      await wizardNext(chatId, draft);
      return true;
    }

    case "discount": {
      const parsed = parseDiscountInput(value);
      if (!parsed) {
        await sendMessage(
          chatId,
          "❗ فرمت صحیح:\n`percent:15`  یا  `15%`\n`amount:100000`\n`none`"
        );
        return true;
      }
      const pricing = calculatePricing({
        compareAtPrice: draft.compareAtPrice,
        discountType: parsed.discountType,
        discountValue: parsed.discountValue
      });
      draft.discountType = pricing.discountType;
      draft.discountValue = pricing.discountValue;
      draft.discountLabel = pricing.discountLabel;
      draft.price = pricing.finalPrice;
      draft.step = "attributes";
      await saveDraft(chatId, draft);
      await wizardNext(chatId, draft);
      return true;
    }

    case "attributes": {
      if (value === "ندارد" || value.toLowerCase() === "none") {
        draft.attributes = {};
        draft.variants = [];
        draft.step = "stock";
      } else {
        draft.attributes = parseAttributes(value);
        draft.variants = createVariantCombinations(draft.attributes);
        if (draft.variants.length > 0) {
          draft.variantIndex = 0;
          draft.step = "variantStock";
        } else {
          draft.step = "stock";
        }
      }
      await saveDraft(chatId, draft);
      await wizardNext(chatId, draft);
      return true;
    }

    case "variantStock": {
      if (!/^\d+$/.test(value)) {
        await sendMessage(chatId, "❗ فقط عدد صحیح وارد کنید.");
        return true;
      }
      const idx = draft.variantIndex || 0;
      draft.variants[idx].stock = safeNumber(value);
      if (idx + 1 < draft.variants.length) {
        draft.variantIndex = idx + 1;
      } else {
        draft.totalStock = draft.variants.reduce((s, v) => s + safeNumber(v.stock), 0);
        draft.step = "featured";
      }
      await saveDraft(chatId, draft);
      await wizardNext(chatId, draft);
      return true;
    }

    case "stock": {
      if (!/^\d+$/.test(value)) {
        await sendMessage(chatId, "❗ فقط عدد صحیح وارد کنید.");
        return true;
      }
      draft.totalStock = safeNumber(value);
      draft.step = "featured";
      await saveDraft(chatId, draft);
      await wizardNext(chatId, draft);
      return true;
    }

    case "tags": {
      if (value === "ندارد" || value.toLowerCase() === "none") {
        draft.tags = [];
      } else {
        draft.tags = value.split(",").map((t) => safeText(t)).filter(Boolean);
      }
      draft.step = "preview";
      await saveDraft(chatId, draft);
      await wizardNext(chatId, draft);
      return true;
    }

    case "edit_name": {
      await updateProduct(draft.productId, { name: value });
      await deleteDraft(chatId);
      const { showProductManagement } = require("./ui");
      await showProductManagement(chatId, draft.productId);
      return true;
    }

    case "edit_description": {
      await updateProduct(draft.productId, { description: value });
      await deleteDraft(chatId);
      const { showProductManagement } = require("./ui");
      await showProductManagement(chatId, draft.productId);
      return true;
    }

    case "edit_price": {
      if (!/^\d+(\.\d+)?$/.test(value)) {
        await sendMessage(chatId, "❗ قیمت نامعتبر است.");
        return true;
      }
      draft.compareAtPrice = safeNumber(value);
      draft.step = "edit_discount";
      await saveDraft(chatId, draft);
      await sendMessage(
        chatId,
        "مقدار تخفیف را وارد کنید:\n`percent:15`  /  `amount:50000`  /  `none`"
      );
      return true;
    }

    case "edit_discount": {
      const parsed = parseDiscountInput(value);
      if (!parsed) {
        await sendMessage(chatId, "❗ فرمت صحیح: `percent:15` / `amount:50000` / `none`");
        return true;
      }
      const pricing = calculatePricing({
        compareAtPrice: draft.compareAtPrice,
        discountType: parsed.discountType,
        discountValue: parsed.discountValue
      });
      await updateProduct(draft.productId, pricing);
      await deleteDraft(chatId);
      const { showProductManagement } = require("./ui");
      await showProductManagement(chatId, draft.productId);
      return true;
    }

    case "edit_stock": {
      if (!/^\d+$/.test(value)) {
        await sendMessage(chatId, "❗ فقط عدد وارد کنید.");
        return true;
      }
      await updateProduct(draft.productId, {
        stock: safeNumber(value),
        totalStock: safeNumber(value)
      });
      await deleteDraft(chatId);
      const { showProductManagement } = require("./ui");
      await showProductManagement(chatId, draft.productId);
      return true;
    }

    case "edit_tags": {
      const tags =
        value === "ندارد"
          ? []
          : value.split(",").map((t) => safeText(t)).filter(Boolean);
      await updateProduct(draft.productId, { tags });
      await deleteDraft(chatId);
      const { showProductManagement } = require("./ui");
      await showProductManagement(chatId, draft.productId);
      return true;
    }

    case "category_name": {
      const { createCategory } = require("./categories");
      await createCategory({ name: value, icon: "📦" });
      await deleteDraft(chatId);
      const { showCategories } = require("./ui");
      await showCategories(chatId);
      return true;
    }

    case "category_edit_name": {
      const { updateCategory } = require("./categories");
      await updateCategory(draft.categoryId, { name: value });
      await deleteDraft(chatId);
      const { showCategories } = require("./ui");
      await showCategories(chatId);
      return true;
    }

    case "category_edit_icon": {
      const { updateCategory } = require("./categories");
      await updateCategory(draft.categoryId, { icon: value });
      await deleteDraft(chatId);
      const { showCategories } = require("./ui");
      await showCategories(chatId);
      return true;
    }

    case "badge_name": {
      const { createBadge } = require("./badges");
      await createBadge({ name: value });
      await deleteDraft(chatId);
      const { showBadges } = require("./ui");
      await showBadges(chatId);
      return true;
    }

    case "badge_edit_name": {
      const { updateBadge } = require("./badges");
      await updateBadge(draft.badgeId, { name: value });
      await deleteDraft(chatId);
      const { showBadges } = require("./ui");
      await showBadges(chatId);
      return true;
    }

    case "badge_edit_icon": {
      const { updateBadge } = require("./badges");
      await updateBadge(draft.badgeId, { icon: value });
      await deleteDraft(chatId);
      const { showBadges } = require("./ui");
      await showBadges(chatId);
      return true;
    }

    default:
      return false;
  }
}

async function handlePhoto(chatId, message) {
  const draft = await getDraft(chatId);
  if (!draft || draft.step !== "photos") return false;

  const photos = message.photo;
  if (!photos || !photos.length) return false;

  const best = photos[photos.length - 1];
  draft.images.push({ fileId: best.file_id });
  await saveDraft(chatId, draft);

  await sendMessage(
    chatId,
    `✅ عکس دریافت شد (جمعاً ${draft.images.length} عکس).\n` +
      "عکس بعدی را بفرستید یا روی «پایان عکس‌ها» بزنید.",
    inlineKeyboard([
      [{ text: "✅ پایان عکس‌ها", callback_data: "draft:photos_done" }],
      [{ text: "❌ لغو", callback_data: "draft:cancel" }]
    ])
  );

  return true;
}

module.exports = {
  startProductWizard,
  wizardNext,
  productPreview,
  showCategorySelector,
  finalizeProduct,
  handleWizardText,
  handlePhoto
};
