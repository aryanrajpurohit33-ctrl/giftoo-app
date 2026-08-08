const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://aryanrajpurohit33_db_user:O5OjBvjJxB6FNYnn@cluster0.2fdvz9w.mongodb.net/giftoo?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('✅ Connected permanently to MongoDB Atlas');
    updateAdminAccount();
    seedCategories();
  })
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: { type: String, required: true },
  title: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, required: true },
  category: { type: String, required: true },
  mainCategory: { type: String, default: "Personal" },
  isCompany: { type: Boolean, default: false },
  date: { type: Date, default: Date.now }
});

const subscriptionSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  subscription: { type: Object, required: true }
});


const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }
});
const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

async function seedCategories() {
  try {
    const count = await Category.countDocuments();
    if (count === 0) {
      const defaults = ["Rikshaw 🛺", "Food 🍔", "Party Payment 🥳", "Shopping 🛍️", "Bills ⚡", "Other Expenses 📦"];
      await Category.insertMany(defaults.map(name => ({ name })));
    }
  } catch (err) {
    console.error("Category seed error:", err);
  }
}


const mainCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});
const MainCategory = mongoose.models.MainCategory || mongoose.model('MainCategory', mainCategorySchema);

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Subscription = mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);

async function updateAdminAccount() {
  try {
    // 1. Giftoo Admin
    let giftooAdmin = await User.findOne({ username: 'Giftoo' });
    if (giftooAdmin) {
      giftooAdmin.password = 'aditya1';
      giftooAdmin.role = 'admin';
      await giftooAdmin.save();
    } else {
      giftooAdmin = await User.create({ username: 'Giftoo', password: 'aditya1', role: 'admin' });
    }

    // 2. Nekoo Admin
    let nekooAdmin = await User.findOne({ username: 'Nekoo' });
    if (nekooAdmin) {
      nekooAdmin.password = '5669';
      nekooAdmin.role = 'admin';
      await nekooAdmin.save();
    } else {
      await User.create({ username: 'Nekoo', password: '5669', role: 'admin' });
    }

    // 3. Assign pre-existing unassigned users to Giftoo admin
    await User.updateMany(
      { role: 'user', $or: [{ createdBy: null }, { createdBy: { $exists: false } }] },
      { createdBy: giftooAdmin._id }
    );
  } catch (err) {
    console.error('Admin update error:', err);
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PUBLIC_VAPID_KEY = process.env.PUBLIC_VAPID_KEY || 'BMzkR1VD3y2eNOI9jfe1JDxr8-BgnfizL3YoXJLViPzkY_fa-v3oYDNHWuM6GYzjdjSBtUz3NOLlaBnA9FbIhOU';
const PRIVATE_VAPID_KEY = process.env.PRIVATE_VAPID_KEY || 'OFra9SaNaN2P8XaJeiuRmzLXzmEjnc2VUvLQ1ol7Wj8';

webpush.setVapidDetails('mailto:admin@giftoo.app', PUBLIC_VAPID_KEY, PRIVATE_VAPID_KEY);

app.use(session({
  secret: 'giftoo_secret_key_2026',
  resave: true,
  saveUninitialized: true,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

app.get('/sw.js', (req, res) => res.sendFile(path.join(__dirname, 'sw.js')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'manifest.json')));
app.get('/icon.svg', (req, res) => res.sendFile(path.join(__dirname, 'icon.svg')));

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get(['/', '/history', '/analytics', '/admin'], (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/profile', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
  res.sendFile(path.join(__dirname, 'profile.html'));
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Missing credentials' });
    const user = await User.findOne({ username, password }).maxTimeMS(4000);
    if (user) {
      req.session.user = { id: user._id.toString(), username: user.username, role: user.role };
      return res.json({ success: true, role: user.role });
    }
    return res.status(401).json({ success: false, message: 'Invalid Username or Password' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Database Connection Error' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/api/session', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(req.session.user);
});

app.post('/api/subscribe', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ error: 'Invalid subscription object' });

    await Subscription.findOneAndUpdate(
      { userId: req.session.user.id },
      { userId: req.session.user.id, subscription },
      { upsert: true, new: true }
    );
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Subscription Endpoint Error:', err);
    return res.status(500).json({ error: 'Failed to save subscription' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const allUsers = await User.find({ createdBy: req.session.user.id }, 'username password role');
    res.json(allUsers.map(u => ({ id: u._id, username: u.username, password: u.password, role: u.role })));
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/admin/users', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Required fields missing' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username exists' });
    const newUser = await User.create({ username, password, role: 'user', createdBy: req.session.user.id });
    res.json({ success: true, user: { id: newUser._id, username: newUser.username, role: newUser.role } });
  } catch {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const userToDelete = await User.findOne({ _id: req.params.id, createdBy: req.session.user.id });
    if (!userToDelete) return res.status(404).json({ error: 'User not found in your domain' });
    await Transaction.deleteMany({ userId: req.params.id });
    await Subscription.deleteMany({ userId: req.params.id });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Delete operation failed' });
  }
});


app.get('/api/categories', async (req, res) => {
  try {
    const categories = await Category.find({});
    res.json(categories);
  } catch {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.post('/api/admin/categories', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Category name required' });
    const trimmed = name.trim();
    const existing = await Category.findOne({ name: trimmed });
    if (existing) return res.status(400).json({ error: 'Category already exists' });

    const newCategory = await Category.create({ name: trimmed });
    res.json({ success: true, category: newCategory });
  } catch {
    res.status(500).json({ error: 'Failed to create category' });
  }
});


app.delete('/api/admin/categories/:id', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});


app.get('/api/company-transactions', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const transactions = await Transaction.find({ userId: req.session.user.id, isCompany: true }).sort({ date: -1, _id: -1 });
    res.json(transactions.map(t => ({
      id: t._id, userId: t.userId, username: t.username, title: t.title, amount: t.amount, type: t.type, category: t.category,
      mainCategory: req.body.mainCategory || "Personal", date: t.date
    })));
  } catch {
    res.status(500).json({ error: 'Failed to fetch company transactions' });
  }
});

app.post('/api/company-transactions', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { title, amount, type, category, date } = req.body;
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Invalid amount' });

    let selectedDate = new Date();
    if (date) {
      const parsedDate = new Date(date);
      if (!isNaN(parsedDate)) selectedDate = parsedDate;
    }
    }

    const newTx = await Transaction.create({
      userId: req.session.user.id,
      username: req.session.user.username,
      title: title && title.trim() !== '' ? title.trim() : category.split(' ')[0],
      amount: parseFloat(amount),
      type,
      category,
      date: selectedDate,
      isCompany: true
    });

    res.json({ success: true, transaction: newTx });
  } catch {
    res.status(500).json({ error: 'Failed to record company transaction' });
  }
});


app.get('/api/main-categories', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    let list = await MainCategory.find({ userId: req.session.user.id });
    if (list.length === 0) {
      const defaults = ["Personal", "Home Construction", "Nekoo Operations"];
      const created = await MainCategory.insertMany(defaults.map(name => ({ name, userId: req.session.user.id })));
      return res.json(created);
    }
    res.json(list);
  } catch {
    res.status(500).json({ error: 'Failed to fetch main categories' });
  }
});

app.post('/api/main-categories', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const trimmed = name.trim();
    const existing = await MainCategory.findOne({ name: trimmed, userId: req.session.user.id });
    if (existing) return res.status(400).json({ error: 'Main category exists' });

    const newCat = await MainCategory.create({ name: trimmed, userId: req.session.user.id });
    res.json({ success: true, mainCategory: newCat });
  } catch {
    res.status(500).json({ error: 'Failed to add main category' });
  }
});

app.get('/api/transactions', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { userId, filter } = req.query;
    let query = {};

    if (req.session.user.role !== 'admin') {
      // Regular user sees only their own
      query.userId = req.session.user.id; query.isCompany = { $ne: true };
    } else {
      // Admin sees only users created by this admin + admin's own transactions
      const domainUsers = await User.find({ createdBy: req.session.user.id });
      const domainUserIds = domainUsers.map(u => u._id.toString());
      domainUserIds.push(req.session.user.id);

      if (userId && domainUserIds.includes(userId)) {
        query.userId = userId;
      } else {
        query.userId = { $in: domainUserIds };
      }
    }

    if (filter && filter !== 'all') {
      const now = new Date();
      let cutoff = new Date();
      if (filter === '1w') cutoff.setDate(now.getDate() - 7);
      else if (filter === '1m') cutoff.setMonth(now.getMonth() - 1);
      else if (filter === '3m') cutoff.setMonth(now.getMonth() - 3);
      query.date = { $gte: cutoff };
    }

    const transactions = await Transaction.find(query).sort({ date: -1, _id: -1 });
    res.json(transactions.map(t => ({
      id: t._id, userId: t.userId, username: t.username, title: t.title, amount: t.amount, type: t.type, category: t.category, date: t.date
    })));
  } catch {
    res.status(500).json({ error: 'Failed to record transaction' });
  }
});

app.listen(PORT, () => console.log(`🚀 Money App live on port ${PORT}`));
