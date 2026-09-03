const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('./connection');
const { authRequired, requireRole, subscriptionActive } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, subscriptionActive);

// GET /employees (admin) - list teachers + ancillary staff
router.get('/', requireRole('admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, email, phone, role FROM users
    WHERE school_id = ? AND role IN ('teacher','ancillary')
  `).all(req.user.school_id);
  res.json(rows);
});

// PATCH /employees/:id  (admin) - edit basic employee info
router.patch('/:id', requireRole('admin'), (req, res) => {
  const fields = ['name','phone'];
  const updates = fields.filter(f => f in req.body);
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });
  const setClause = updates.map(f => `${f} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${setClause} WHERE id = ? AND school_id = ?`)
    .run(...updates.map(f => req.body[f]), req.params.id, req.user.school_id);
  res.json({ ok: true });
});

// POST /employees/:id/duties  (admin assigns ancillary staff duties)
router.post('/:id/duties', requireRole('admin'), (req, res) => {
  const { duty } = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO staff_duties (id, user_id, duty, assigned_by) VALUES (?, ?, ?, ?)`)
    .run(id, req.params.id, duty, req.user.id);
  res.status(201).json({ id });
});

router.get('/:id/duties', requireRole('admin'), (req, res) => {
  res.json(db.prepare('SELECT * FROM staff_duties WHERE user_id = ?').all(req.params.id));
});

module.exports = router;
