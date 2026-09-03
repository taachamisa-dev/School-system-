const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('./connection');
const { authRequired, subscriptionActive } = require('./auth');
const { classAccessRequired } = require('./classAccess');

const router = express.Router();
router.use(authRequired, subscriptionActive);

// POST /attendance/mark  { class_id, attendance_date, term, marks: [{learner_id, status}] }
// Teacher marks the whole register in one call (front-end handles the row-by-row UI/auto-scroll).
router.post('/mark', classAccessRequired, (req, res) => {
  const { class_id, attendance_date, term, marks } = req.body;
  if (!Array.isArray(marks)) return res.status(400).json({ error: 'marks[] required' });

  const upsert = db.prepare(`
    INSERT INTO attendance (id, school_id, class_id, learner_id, attendance_date, status, term, marked_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(learner_id, attendance_date) DO UPDATE SET status = excluded.status, marked_by = excluded.marked_by
  `);

  const tx = db.transaction((rows) => {
    for (const m of rows) {
      upsert.run(uuid(), req.user.school_id, class_id, m.learner_id, attendance_date, m.status, term, req.user.id);
    }
  });
  tx(marks);

  res.json({ ok: true, count: marks.length });
});

// GET /attendance/day?class_id=&date=  -> register view for one day
router.get('/day', classAccessRequired, (req, res) => {
  const { class_id, date } = req.query;
  const learners = db.prepare('SELECT id, surname, first_name, gender FROM learners WHERE class_id = ? ORDER BY surname').all(class_id);
  const marks = db.prepare('SELECT learner_id, status FROM attendance WHERE class_id = ? AND attendance_date = ?').all(class_id, date);
  const markMap = Object.fromEntries(marks.map(m => [m.learner_id, m.status]));
  res.json(learners.map(l => ({ ...l, status: markMap[l.id] || null })));
});

// GET /attendance/analysis?class_id=&from=&to=  -> per-day, per-learner, and gender totals
router.get('/analysis', classAccessRequired, (req, res) => {
  const { class_id, from, to } = req.query;

  const perDay = db.prepare(`
    SELECT attendance_date,
      SUM(CASE WHEN status='P' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN status='A' THEN 1 ELSE 0 END) AS absent,
      SUM(CASE WHEN status='S' THEN 1 ELSE 0 END) AS sick
    FROM attendance
    WHERE class_id = ? AND attendance_date BETWEEN ? AND ?
    GROUP BY attendance_date ORDER BY attendance_date
  `).all(class_id, from, to);

  const perLearner = db.prepare(`
    SELECT l.id AS learner_id, l.surname, l.first_name, l.gender,
      SUM(CASE WHEN a.status='P' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN a.status='A' THEN 1 ELSE 0 END) AS absent,
      SUM(CASE WHEN a.status='S' THEN 1 ELSE 0 END) AS sick
    FROM learners l
    LEFT JOIN attendance a ON a.learner_id = l.id AND a.attendance_date BETWEEN ? AND ?
    WHERE l.class_id = ?
    GROUP BY l.id ORDER BY l.surname
  `).all(from, to, class_id);

  const genderTotals = db.prepare(`
    SELECT l.gender,
      SUM(CASE WHEN a.status='P' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN a.status='A' THEN 1 ELSE 0 END) AS absent,
      SUM(CASE WHEN a.status='S' THEN 1 ELSE 0 END) AS sick
    FROM learners l
    LEFT JOIN attendance a ON a.learner_id = l.id AND a.attendance_date BETWEEN ? AND ?
    WHERE l.class_id = ?
    GROUP BY l.gender
  `).all(from, to, class_id);

  res.json({ per_day: perDay, per_learner: perLearner, gender_totals: genderTotals });
  // NB: for "per term" / "per year" totals, call this endpoint with the term's or year's full date range.
});

module.exports = router;
