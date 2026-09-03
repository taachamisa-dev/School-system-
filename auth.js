const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('./connection');
const { authRequired, requireRole, generateToken } = require('./middleware');

const router = express.Router();

// POST /auth/login  { email, password }
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const school = db.prepare('SELECT id, name, plan, trial_end, subscription_paid_until FROM schools WHERE id = ?').get(user.school_id);
  const token = generateToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, role: user.role, email: user.email },
    school
  });
});

// POST /auth/users  (admin only) - create teacher / ancillary / parent accounts
router.post('/users', authRequired, requireRole('admin'), (req, res) => {
  const { name, email, phone, password, role, duty } = req.body;
  if (!['teacher', 'ancillary', 'parent'].includes(role)) {
    return res.status(400).json({ error: 'role must be teacher, ancillary, or parent' });
  }
  const id = uuid();
  const hash = bcrypt.hashSync(password || 'Welcome123!', 10);
  db.prepare(`
    INSERT INTO users (id, school_id, name, email, phone, password_hash, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.school_id, name, email, phone || null, hash, role);

  if (role === 'ancillary' && duty) {
    db.prepare(`INSERT INTO staff_duties (id, user_id, duty, assigned_by) VALUES (?, ?, ?, ?)`)
      .run(uuid(), id, duty, req.user.id);
  }

  res.status(201).json({ id, name, email, role });
});

// GET /auth/me
router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

module.exports = router;
