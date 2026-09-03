const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('./connection');
const { authRequired, requireRole, subscriptionActive } = require('./auth');

const router = express.Router();
router.use(authRequired, subscriptionActive);

// GET /learners?class_id=... - admin sees all, teacher sees only their class, parent sees only their children
router.get('/', (req, res) => {
  const { class_id } = req.query;

  if (req.user.role === 'admin') {
    const rows = class_id
      ? db.prepare('SELECT * FROM learners WHERE school_id = ? AND class_id = ?').all(req.user.school_id, class_id)
      : db.prepare('SELECT * FROM learners WHERE school_id = ?').all(req.user.school_id);
    return res.json(rows);
  }

  if (req.user.role === 'teacher') {
    const cls = class_id && db.prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').get(class_id, req.user.id);
    if (!class_id || !cls) return res.status(403).json({ error: 'Specify a class you teach' });
    const rows = db.prepare('SELECT * FROM learners WHERE class_id = ?').all(class_id);
    return res.json(rows);
  }

  if (req.user.role === 'parent') {
    const guardian = db.prepare('SELECT * FROM guardians WHERE user_id = ?').get(req.user.id);
    if (!guardian) return res.json([]);
    const rows = db.prepare('SELECT * FROM learners WHERE guardian1_id = ? OR guardian2_id = ?')
      .all(guardian.id, guardian.id);
    return res.json(rows);
  }

  return res.status(403).json({ error: 'Not permitted' });
});

// POST /learners - admin only (normal enrolment path is via /enrolment for the public)
router.post('/', requireRole('admin'), (req, res) => {
  const b = req.body;
  const id = uuid();
  db.prepare(`
    INSERT INTO learners (id, school_id, class_id, surname, first_name, gender, date_of_birth,
      religion, boarder_or_day, games, address, phone_number, guardian1_id, guardian2_id, enrollment_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(id, req.user.school_id, b.class_id, b.surname, b.first_name, b.gender, b.date_of_birth,
    b.religion, b.boarder_or_day, b.games, b.address, b.phone_number, b.guardian1_id || null, b.guardian2_id || null);
  res.status(201).json({ id });
});

// PATCH /learners/:id - admin only
router.patch('/:id', requireRole('admin'), (req, res) => {
  const fields = ['class_id','surname','first_name','gender','date_of_birth','religion',
    'boarder_or_day','games','address','phone_number','guardian1_id','guardian2_id','enrollment_status'];
  const updates = fields.filter(f => f in req.body);
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const setClause = updates.map(f => `${f} = ?`).join(', ');
  const values = updates.map(f => req.body[f]);
  db.prepare(`UPDATE learners SET ${setClause} WHERE id = ? AND school_id = ?`)
    .run(...values, req.params.id, req.user.school_id);
  res.json({ ok: true });
});

module.exports = router;
