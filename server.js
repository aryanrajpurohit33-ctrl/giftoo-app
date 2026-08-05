const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://aryan:O5OjBvjJxB6FNYnn@cluster0.2fdvz9w.mongodb.net/giftoo?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected permanently to MongoDB Atlas'))
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

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

async function seedDefaultUsers() {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      await User.create([
        { username: 'Aryan', password: '12345678', role: 'admin' },
        { username: 'user1', password: 'user123', role: 'user' }
      ]);
      console.log('🌱 Default users seeded into MongoDB');
    }
  } catch (err) {
    console.error('Seeding error:', err);
  }
}
seedDefaultUsers();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/sw.js', (req, res) => res.sendFile(path.join(__dirname, 'sw.js')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'manifest.json')));

app.get('/icon.png', (req, res) => {
  const iconPath = path.join(__dirname, 'icon.png');
  if (fs.existsSync(iconPath)) {
    res.sendFile(iconPath);
  } else {
    const img = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': img.length });
    res.end(img);
  }
});

app.use(session({
  secret: 'giftoo_secret_key_2026',
  resave: true,
  saveUninitialized: true,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/users', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
  res.sendFile(path.join(__dirname, 'users.html'));
});

app.get('/profile', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'profile.html'));
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });

  if (user) {
    req.session.user = { id: user._id.toString(), username: user.username, role: user.role };
    return res.json({ success: true, role: user.role });
  }

  res.status(401).json({ success: false, message: 'Invalid Username or Password' });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/api/session', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(req.session.user);
});

app.get('/api/users/:id', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user._id, username: user.username, role: user.role });
  } catch {
    res.status(400).json({ error: 'Invalid User ID' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const allUsers = await User.find({}, 'username role');
  res.json(allUsers.map(u => ({ id: u._id, username: u.username, role: u.role })));
});

app.post('/api/admin/users', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Required fields missing' });

  const existing = await User.findOne({ username });
  if (existing) return res.status(400).json({ error: 'Username exists' });

  const newUser = await User.create({ username, password, role: 'user' });
  res.json({ success: true, user: { id: newUser._id, username: newUser.username, role: newUser.role } });
});

app.delete('/api/admin/users/:id', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const userToDelete = await User.findById(req.params.id);
    if (!userToDelete) return res.status(404).json({ error: 'User not found' });
    if (userToDelete.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin account' });

    await Transaction.deleteMany({ userId: req.params.id });
    await User.findByIdAndDelete(req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete operation failed' });
  }
});

app.get('/api/transactions', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

  const { userId, filter } = req.query;
  let query = {};

  if (req.session.user.role !== 'admin') {
    query.userId = req.session.user.id;
  } else if (userId) {
    query.userId = userId;
  }

  if (filter && filter !== 'all') {
    const now = new Date();
    let cutoff = new Date();

    if (filter === '1w') cutoff.setDate(now.getDate() - 7);
    else if (filter === '1m') cutoff.setMonth(now.getMonth() - 1);
    else if (filter === '3m') cutoff.setMonth(now.getMonth() - 3);
    else if (filter === '1y') cutoff.setFullYear(now.getFullYear() - 1);

    query.date = { $gte: cutoff };
  }

  const transactions = await Transaction.find(query).sort({ date: -1 });
  res.json(transactions.map(t => ({
    id: t._id,
    userId: t.userId,
    username: t.username,
    title: t.title,
    amount: t.amount,
    type: t.type,
    category: t.category,
    date: t.date
  })));
});

app.post('/api/transactions', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

  const { targetUserId, title, amount, type, category } = req.body;
  if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Invalid amount' });

  let assignedUser = req.session.user;

  if (req.session.user.role === 'admin' && targetUserId) {
    const foundUser = await User.findById(targetUserId);
    if (foundUser) assignedUser = { id: foundUser._id.toString(), username: foundUser.username };
  }

  const newTx = await Transaction.create({
    userId: assignedUser.id,
    username: assignedUser.username,
    title: title !== '' ? title : category.split(' ')[0],
    amount: parseFloat(amount),
    type,
    category
  });

  res.json({ success: true, transaction: newTx });
});

app.listen(PORT, () => console.log(`🚀 Giftoo App live on port ${PORT}`));
