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
  })
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' }
});

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  title: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, required: true },
  category: { type: String, required: true },
  date: { type: Date, default: Date.now }
});

const subscriptionSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  subscription: { type: Object, required: true }
});

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Subscription = mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);

async function updateAdminAccount() {
  try {
    let adminUser = await User.findOne({ role: 'admin' });
    if (adminUser) {
      adminUser.username = 'Giftoo';
      adminUser.password = 'aditya1';
      await adminUser.save();
    } else {
      await User.create({ username: 'Giftoo', password: 'aditya1', role: 'admin' });
    }
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
    const allUsers = await User.find({}, 'username password role');
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
    const newUser = await User.create({ username, password, role: 'user' });
    res.json({ success: true, user: { id: newUser._id, username: newUser.username, role: newUser.role } });
  } catch {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const userToDelete = await User.findById(req.params.id);
    if (!userToDelete) return res.status(404).json({ error: 'User not found' });
    if (userToDelete.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin account' });
    await Transaction.deleteMany({ userId: req.params.id });
    await Subscription.deleteMany({ userId: req.params.id });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Delete operation failed' });
  }
});

app.get('/api/transactions', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { userId, filter } = req.query;
    let query = {};
    if (req.session.user.role !== 'admin') query.userId = req.session.user.id;
    else if (userId) query.userId = userId;

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
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.post('/api/transactions', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { targetUserId, title, amount, type, category, date } = req.body;
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Invalid amount' });

    let assignedUser = req.session.user;
    if (req.session.user.role === 'admin' && targetUserId) {
      const foundUser = await User.findById(targetUserId);
      if (foundUser) assignedUser = { id: foundUser._id.toString(), username: foundUser.username };
    }

    let selectedDate = new Date();
    if (date) {
      const parsedDate = new Date(date);
      const now = new Date();
      const pastWeek = new Date();
      pastWeek.setDate(now.getDate() - 7);
      pastWeek.setHours(0, 0, 0, 0);
      if (parsedDate >= pastWeek && parsedDate <= now) selectedDate = parsedDate;
    }

    const newTx = await Transaction.create({
      userId: assignedUser.id,
      username: assignedUser.username,
      title: title !== '' ? title : category.split(' ')[0],
      amount: parseFloat(amount),
      type,
      category,
      date: selectedDate
    });

    // Trigger Push Notification if assigned by admin to another user
    if (req.session.user.role === 'admin' && targetUserId && targetUserId !== req.session.user.id) {
      try {
        const subRecord = await Subscription.findOne({ userId: targetUserId });
        if (subRecord && subRecord.subscription) {
          const payload = JSON.stringify({
            title: 'New Transaction Logged 💸',
            body: `Admin logged ${type === 'income' ? '+' : '-'}₹${amount} for ${category}`
          });
          webpush.sendNotification(subRecord.subscription, payload).catch(e => console.error('Push delivery error:', e));
        }
      } catch (e) {
        console.error('Error fetching subscription:', e);
      }
    }

    res.json({ success: true, transaction: newTx });
  } catch {
    res.status(500).json({ error: 'Failed to record transaction' });
  }
});

app.listen(PORT, () => console.log(`🚀 Money App live on port ${PORT}`));
