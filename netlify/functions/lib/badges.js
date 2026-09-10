// ============================================================
// HamedShop - Badges (special labels)
// ============================================================

const { readJsonFile, writeJsonFile } = require("./github");
const { nowISO, generateId, safeText } = require("./utils");

async function getBadgesFile() {
  return readJsonFile("data/badges.json", []);
}

async function createBadge(badge) {
  const file = await getBadgesFile();

  const newBadge = {
    id: badge.id || generateId("badge"),
    name: safeText(badge.name) || "برچسب",
    icon: badge.icon || "🏷️",
    color: badge.color || "#6366f1",
    active: badge.active !== false,
    createdAt: nowISO(),
    updatedAt: nowISO()
  };

  file.data.push(newBadge);

  await writeJsonFile(
    "data/badges.json",
    file.data,
    `Add badge ${newBadge.id}`,
    file.sha
  );

  return newBadge;
}

async function updateBadge(badgeId, changes) {
  const file = await getBadgesFile();
  const index = file.data.findIndex(
    (b) => String(b.id) === String(badgeId)
  );

  if (index === -1) throw new Error("Badge not found");

  file.data[index] = {
    ...file.data[index],
    ...changes,
    id: badgeId,
    updatedAt: nowISO()
  };

  await writeJsonFile(
    "data/badges.json",
    file.data,
    `Update badge ${badgeId}`,
    file.sha
  );

  return file.data[index];
}

async function deleteBadge(badgeId) {
  const file = await getBadgesFile();
  const index = file.data.findIndex(
    (b) => String(b.id) === String(badgeId)
  );

  if (index === -1) throw new Error("Badge not found");

  const deleted = file.data.splice(index, 1)[0];

  await writeJsonFile(
    "data/badges.json",
    file.data,
    `Delete badge ${badgeId}`,
    file.sha
  );

  return deleted;
}

module.exports = {
  getBadgesFile,
  createBadge,
  updateBadge,
  deleteBadge
};
