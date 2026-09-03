const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { authRequired, subscriptionActive } = require('../middleware/auth');
const { classAccessRequired } = require('../middleware/classAccess');

const router = express.Router();
router.use(authRequired, subscriptionActive);

const ALLOWED_GRADES = ['ECD A','ECD B','Grade 1','Grade 2'];

function checkGrade(classId, res) {
  const cls = db.prepare('SELECT grade_level FROM classes WHERE id = ?').get(classId);
  if (!cls || !ALLOWED_GRADES.includes(cls.grade_level)) {
    res.status(400).json({ error: 'Anecdotal records only apply to ECD A, ECD B, Grade 1, Grade 2' });
    return false;
  }
  return true;
}

router.get('/', classAccessRequired, (req, res) => {
  const { class_id } = req.query;
  if (!checkGrade(class_id, res)) return;
  res.json(db.prepare('SELECT * FROM anecdotal_records WHERE class_id = ? ORDER BY record_date DESC').all(class_id));
});

router.post('/', classAccessRequired, (req, res) => {
  const b = req.body;
  if (!checkGrade(b.class_id, res)) return;
  const id = uuid();
  db.prepare(`
    INSERT INTO anecdotal_records (id, class_id, learner_id, record_date, behaviour_observed, evaluation, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, b.class_id, b.learner_id, b.record_date, b.behaviour_observed, b.evaluation, req.user.id);
  res.status(201).json({ id });
});

module.exports = router;
