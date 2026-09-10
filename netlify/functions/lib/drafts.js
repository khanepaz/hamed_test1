// ============================================================
// HamedShop - Product Drafts (Wizard state persistence)
// ============================================================
// Netlify serverless is stateless → drafts live on GitHub.
// ============================================================

const { readJsonFile, writeJsonFile } = require("./github");
const { nowISO } = require("./utils");

async function getDraftsFile() {
  return readJsonFile("data/product_drafts.json", {});
}

async function getDraft(chatId) {
  const file = await getDraftsFile();
  const key = String(chatId);
  return file.data[key] || null;
}

async function saveDraft(chatId, draft) {
  const file = await getDraftsFile();
  const key = String(chatId);

  file.data[key] = {
    ...draft,
    updatedAt: nowISO()
  };

  await writeJsonFile(
    "data/product_drafts.json",
    file.data,
    `Save draft ${key}`,
    file.sha
  );

  return file.data[key];
}

async function deleteDraft(chatId) {
  const file = await getDraftsFile();
  const key = String(chatId);

  if (!(key in file.data)) return null;

  const deleted = file.data[key];
  delete file.data[key];

  await writeJsonFile(
    "data/product_drafts.json",
    file.data,
    `Delete draft ${key}`,
    file.sha
  );

  return deleted;
}

module.exports = {
  getDraft,
  saveDraft,
  deleteDraft
};
