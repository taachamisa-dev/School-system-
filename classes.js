const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('./connection');
const { authRequired, requireRole, subscriptionActive } = require('./middleware');

const router = express.Router();
router.use(authRequired, subscriptionActive);

// GET /classes - everyone in the school can list classes
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM classes WHERE school_id = ?').all(req.user.school_id);
  res.json(rows);
});

// POST /classes - admin OR teacher can create (teacher-created classes are unapproved until admin reviews)
router.post('/', requireRole('admin', 'teacher'), (req, res) => {
  const { grade_level, stream_name, teacher_id } = req.body;
  const id = uuid();
  const approved = req.user.role === 'admin' ? 1 : 0;
  db.prepare(`
    INSERT INTO classes (id, school_id, grade_level, stream_name, teacher_id, created_by, approved_by_admin)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.school_id, grade_level, stream_name, teacher_id || (req.user.role === 'teacher' ? req.user.id : null), req.user.id, approved);
  res.status(201).json({ id, approved: !!approved });
});

// PATCH /classes/:id/approve - admin approves a teacher-created class
router.patch('/:id/approve', requireRole('admin'), (req, res) => {
  db.prepare('UPDATE classes SET approved_by_admin = 1 WHERE id = ? AND school_id = ?')
    .run(req.params.id, req.user.school_id);
  res.json({ ok: true });
});

// DELETE /classes/:id - admin removes a class (e.g. one a teacher created in error)
router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM classes WHERE id = ? AND school_id = ?').run(req.params.id, req.user.school_id);
  res.json({ ok: true });
});

// PATCH /classes/:id/assign-teacher - admin assigns/reassigns a teacher
router.patch('/:id/assign-teacher', requireRole('admin'), (req, res) => {
  const { teacher_id } = req.body;
  db.prepare('UPDATE classes SET teacher_id = ? WHERE id = ? AND school_id = ?')
    .run(teacher_id, req.params.id, req.user.school_id);
  res.json({ ok: true });
});

module.exports = router;
