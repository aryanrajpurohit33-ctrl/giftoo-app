const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static manifest
app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

// Serve Icon
app.get('/icon.png', (req, res) => {
  const iconPath = path.join(__dirname, 'icon.png');
  if (fs.existsSync(iconPath)) {
    res.sendFile(iconPath);
  } else {
    // Fallback pixel if icon file missing
    const img = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': img.length });
    res.end(img);
  }
});

// Persistent Session Configuration (30 Days Expiry)
app.use(session({
  secret: 'giftoo_secret_key_2026',
  resave: true,
  saveUninitialized: true,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

// In-Memory Database
const users = [
  { id: 1, username: 'Aryan', password: '12345678', role: 'admin' },
  { id: 2, username: 'user1', password: 'user123', role: 'user' }
];

let transactions = [
  { id: 1, userId: 2, username: 'user1', title: 'Auto Ride', amount: 120, type: 'expense', category: 'Auto 🛺', date: new Date().toISOString() },
  { id: 2, userId: 2, username: 'user1', title: 'Dinner', amount: 450, type: 'expense', category: 'Food 🍔', date: new Date().toISOString() }
];

// Serve Pages
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

app.get('/profile', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'profile.html'));
});

// Authentication
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);

  if (user) {
    req.session.user = { id: user.id, username: user.username, role: user.role };
    return res.json({ success: true, role: user.role });
  }

  res.status(401).json({ success: false, message: 'Invalid Username or Password' });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Session Info
app.get('/api/session', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(req.session.user);
});

// Get User Profile Info by ID
app.get('/api/users/:id', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const userId = parseInt(req.params.id);
  const user = users.find(u => u.id === userId);

  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, username: user.username, role: user.role });
});

// Admin API: Get Users List
app.get('/api/admin/users', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const safeUsers = users.map(u => ({ id: u.id, username: u.username, role: u.role }));
  res.json(safeUsers);
});

// Admin API: Create User Credentials
app.post('/api/admin/users', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Required fields missing' });
  if (users.some(u => u.username === username)) return res.status(400).json({ error: 'Username exists' });

  const newUser = { id: Date.now(), username, password, role: 'user' };
  users.push(newUser);
  res.json({ success: true, user: { id: newUser.id, username: newUser.username, role: newUser.role } });
});

// Get Transactions
app.get('/api/transactions', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

  const { userId, filter } = req.query;
  let filteredTx = [...transactions];

  if (req.session.user.role !== 'admin') {
    filteredTx = filteredTx.filter(t => t.userId === req.session.user.id);
  } else if (userId) {
    filteredTx = filteredTx.filter(t => t.userId === parseInt(userId));
  }

  if (filter && filter !== 'all') {
    const now = new Date();
    let cutoff = new Date();

    if (filter === '1w') cutoff.setDate(now.getDate() - 7);
    else if (filter === '1m') cutoff.setMonth(now.getMonth() - 1);
    else if (filter === '3m') cutoff.setMonth(now.getMonth() - 3);
    else if (filter === '1y') cutoff.setFullYear(now.getFullYear() - 1);

    filteredTx = filteredTx.filter(t => new Date(t.date) >= cutoff);
  }

  res.json(filteredTx);
});

// Add Transaction
app.post('/api/transactions', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

  const { targetUserId, title, amount, type, category } = req.body;
  if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Invalid amount' });

  let assignedUser = req.session.user;

  if (req.session.user.role === 'admin' && targetUserId) {
    const foundUser = users.find(u => u.id === parseInt(targetUserId));
    if (foundUser) assignedUser = foundUser;
  }

  const newTx = {
    id: Date.now(),
    userId: assignedUser.id,
    username: assignedUser.username,
    title: title !== '' ? title : category.split(' ')[0],
    amount: parseFloat(amount),
    type,
    category,
    date: new Date().toISOString()
  };

  transactions.unshift(newTx);
  res.json({ success: true, transaction: newTx });
});

app.listen(PORT, () => {
  console.log(`🚀 Giftoo App live on port ${PORT}`);
});
