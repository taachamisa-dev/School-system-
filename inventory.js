const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('./connection');
const { authRequired, requireRole, subscriptionActive } = require('./auth');

const router = express.Router();
router.use(authRequired, subscriptionActive);

// GET /inventory?class_id=  (omit class_id for school-level inventory) - admin sees all, teacher sees own class
router.get('/', (req, res) => {
  const { class_id } = req.query;
  if (req.user.role === 'admin') {
    const rows = class_id
      ? db.prepare('SELECT * FROM inventory_items WHERE school_id = ? AND class_id = ?').all(req.user.school_id, class_id)
      : db.prepare('SELECT * FROM inventory_items WHERE school_id = ?').all(req.user.school_id);
    return res.json(rows);
  }
  if (req.user.role === 'teacher' && class_id) {
    const cls = db.prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').get(class_id, req.user.id);
    if (!cls) return res.status(403).json({ error: 'Not your class' });
    return res.json(db.prepare('SELECT * FROM inventory_items WHERE class_id = ?').all(class_id));
  }
  return res.status(403).json({ error: 'Not permitted' });
});

// POST /inventory - admin only edits inventory (per your spec)
router.post('/', requireRole('admin'), (req, res) => {
  const b = req.body;
  if (!['Furniture','Textbooks','Other Tools'].includes(b.category)) {
    return res.status(400).json({ error: 'category must be Furniture, Textbooks, or Other Tools' });
  }
  const id = uuid();
  db.prepare(`
    INSERT INTO inventory_items (id, school_id, class_id, category, item_name, description, condition, quantity, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.school_id, b.class_id || null, b.category, b.item_name, b.description, b.condition, b.quantity || 0, req.user.id);
  res.status(201).json({ id });
});

router.patch('/:id', requireRole('admin'), (req, res) => {
  const fields = ['item_name','description','condition','quantity','class_id'];
  const updates = fields.filter(f => f in req.body);
  const setClause = updates.map(f => `${f} = ?`).join(', ');
  db.prepare(`UPDATE inventory_items SET ${setClause}, updated_by = ?, updated_at = datetime('now') WHERE id = ? AND school_id = ?`)
    .run(...updates.map(f => req.body[f]), req.user.id, req.params.id, req.user.school_id);
  res.json({ ok: true });
});

module.exports = router;
