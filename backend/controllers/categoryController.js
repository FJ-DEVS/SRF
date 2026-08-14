const Category = require('../models/Category');
const Item = require('../models/Item');
const Schema = require('../models/Schema');

// Blank / missing check level means "not tracked"
const parseCheckLevel = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const num = Number(value);
  return isNaN(num) || num < 0 ? null : num;
};

// Create category
exports.createCategory = async (req, res) => {
  try {
    const { name, checkLevel } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    const existing = await Category.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Category already exists' });
    }

    const category = new Category({
      name: name.trim(),
      checkLevel: parseCheckLevel(checkLevel) ?? null
    });
    await category.save();

    res.status(201).json({ success: true, message: 'Category created successfully', data: category });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Get all categories
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Update category — renaming cascades the new name to items using it
exports.updateCategory = async (req, res) => {
  try {
    const { name, checkLevel } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const parsedCheckLevel = parseCheckLevel(checkLevel);
    if (parsedCheckLevel !== undefined) category.checkLevel = parsedCheckLevel;

    // Check-level-only updates leave the name alone
    if (name === undefined) {
      await category.save();
      return res.status(200).json({ success: true, message: 'Category updated', data: category });
    }

    if (!name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    const newName = name.trim();
    if (newName === category.name) {
      await category.save();
      return res.status(200).json({ success: true, message: 'Category updated', data: category });
    }

    const existing = await Category.findOne({ name: newName, _id: { $ne: category._id } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Category already exists' });
    }

    const oldName = category.name;
    category.name = newName;
    await category.save();

    // Items store the category name as a string — keep them in sync
    const result = await Item.updateMany({ category: oldName }, { category: newName });

    // Schemas keep a display copy of the name alongside the id
    await Schema.updateMany(
      { 'pointsAllocations.category': category._id },
      { $set: { 'pointsAllocations.$[alloc].categoryName': newName } },
      { arrayFilters: [{ 'alloc.category': category._id }] }
    );

    res.status(200).json({
      success: true,
      message: `Category renamed. ${result.modifiedCount} item(s) updated.`,
      data: category
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.status(200).json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
