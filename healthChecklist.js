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
    res.status(400).json({ error: 'Health checklist only applies to ECD A, ECD B, Grade 1, Grade 2' });
    return false;
  }
  return true;
}

// PUT /health-checklist/immunisation/:learnerId  { bcg, rotavirus, polio, dpt, rubella }  (booleans)
router.put('/immunisation/:learnerId', (req, res) => {
  const b = req.body;
  const exists = db.prepare('SELECT 1 FROM health_immunisation WHERE learner_id = ?').get(req.params.learnerId);
  if (exists) {
    db.prepare(`
      UPDATE health_immunisation SET bcg=?, rotavirus=?, polio=?, dpt=?, rubella=?, updated_by=?, updated_at=datetime('now')
      WHERE learner_id = ?
    `).run(+!!b.bcg, +!!b.rotavirus, +!!b.polio, +!!b.dpt, +!!b.rubella, req.user.id, req.params.learnerId);
  } else {
    db.prepare(`
      INSERT INTO health_immunisation (learner_id, bcg, rotavirus, polio, dpt, rubella, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.learnerId, +!!b.bcg, +!!b.rotavirus, +!!b.polio, +!!b.dpt, +!!b.rubella, req.user.id);
  }
  res.json({ ok: true });
});

router.get('/immunisation/:learnerId', (req, res) => {
  res.json(db.prepare('SELECT * FROM health_immunisation WHERE learner_id = ?').get(req.params.learnerId) || {});
});

// POST /health-checklist/daily  { class_id, marks: [{learner_id, status: 'W'|'S'|'A'}], record_date }
router.post('/daily', classAccessRequired, (req, res) => {
  const { class_id, record_date, marks } = req.body;
  if (!checkGrade(class_id, res)) return;

  const upsert = db.prepare(`
    INSERT INTO health_daily (id, learner_id, record_date, status, marked_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(learner_id, record_date) DO UPDATE SET status = excluded.status, marked_by = excluded.marked_by
  `);
  const tx = db.transaction((rows) => {
    for (const m of rows) upsert.run(uuid(), m.learner_id, record_date, m.status, req.user.id);
  });
  tx(marks);
  res.json({ ok: true });
});

router.get('/daily', classAccessRequired, (req, res) => {
  const { class_id, record_date } = req.query;
  const learners = db.prepare('SELECT id, surname, first_name FROM learners WHERE class_id = ?').all(class_id);
  const marks = db.prepare(`
    SELECT hd.learner_id, hd.status FROM health_daily hd
    JOIN learners l ON l.id = hd.learner_id WHERE l.class_id = ? AND hd.record_date = ?
  `).all(class_id, record_date);
  const map = Object.fromEntries(marks.map(m => [m.learner_id, m.status]));
  res.json(learners.map(l => ({ ...l, status: map[l.id] || null })));
});

module.exports = router;
