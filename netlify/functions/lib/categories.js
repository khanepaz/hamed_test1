// ============================================================
// HamedShop - Categories
// ============================================================

const { readJsonFile, writeJsonFile } = require("./github");
const { nowISO, generateId, safeText } = require("./utils");

async function getCategoriesFile() {
  return readJsonFile("data/categories.json", []);
}

async function createCategory(category) {
  const file = await getCategoriesFile();

  const newCategory = {
    id: category.id || generateId("cat"),
    name: safeText(category.name) || "دسته‌بندی جدید",
    icon: category.icon || "📦",
    active: category.active !== false,
    createdAt: nowISO(),
    updatedAt: nowISO()
  };

  file.data.push(newCategory);

  await writeJsonFile(
    "data/categories.json",
    file.data,
    `Add category ${newCategory.id}`,
    file.sha
  );

  return newCategory;
}

async function updateCategory(categoryId, changes) {
  const file = await getCategoriesFile();
  const index = file.data.findIndex(
    (c) => String(c.id) === String(categoryId)
  );

  if (index === -1) throw new Error("Category not found");

  file.data[index] = {
    ...file.data[index],
    ...changes,
    id: categoryId,
    updatedAt: nowISO()
  };

  await writeJsonFile(
    "data/categories.json",
    file.data,
    `Update category ${categoryId}`,
    file.sha
  );

  return file.data[index];
}

async function deleteCategory(categoryId) {
  const file = await getCategoriesFile();
  const index = file.data.findIndex(
    (c) => String(c.id) === String(categoryId)
  );

  if (index === -1) throw new Error("Category not found");

  const deleted = file.data.splice(index, 1)[0];

  await writeJsonFile(
    "data/categories.json",
    file.data,
    `Delete category ${categoryId}`,
    file.sha
  );

  return deleted;
}

module.exports = {
  getCategoriesFile,
  createCategory,
  updateCategory,
  deleteCategory
};
