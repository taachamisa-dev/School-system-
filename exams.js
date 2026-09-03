const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('./connection');
const { authRequired, requireRole, subscriptionActive } = require('../middleware/auth');
const { classAccessRequired } = require('../middleware/classAccess');
const { percentageToUnits, computeClassPositions } = require('../utils/grading');

const router = express.Router();
router.use(authRequired, subscriptionActive);

const SUBJECTS = ['ChiShona','English Language','Mathematics','Physical Education and Arts','Science and Technology','Social Science'];

// POST /exams/terms  (admin) { term_name, year }
router.post('/terms', requireRole('admin'), (req, res) => {
  const { term_name, year } = req.body;
  const id = uuid();
  db.prepare('INSERT INTO exam_terms (id, school_id, term_name, year) VALUES (?, ?, ?, ?)')
    .run(id, req.user.school_id, term_name, year);
  res.status(201).json({ id });
});

// POST /exams/possible-mark  (teacher, sets ONCE per subject for the whole class)
// { exam_term_id, class_id, subject, possible_mark }
router.post('/possible-mark', classAccessRequired, (req, res) => {
  const { exam_term_id, class_id, subject, possible_mark } = req.body;
  if (!SUBJECTS.includes(subject)) return res.status(400).json({ error: 'Invalid subject' });
  db.prepare(`
    INSERT INTO exam_possible_marks (id, exam_term_id, class_id, subject, possible_mark)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(exam_term_id, class_id, subject) DO UPDATE SET possible_mark = excluded.possible_mark
  `).run(uuid(), exam_term_id, class_id, subject, possible_mark);
  res.json({ ok: true });
});

// POST /exams/results  (teacher) { exam_term_id, class_id, subject, results: [{learner_id, mark}] }
router.post('/results', classAccessRequired, (req, res) => {
  const { exam_term_id, class_id, subject, results } = req.body;
  const possible = db.prepare('SELECT possible_mark FROM exam_possible_marks WHERE exam_term_id=? AND class_id=? AND subject=?')
    .get(exam_term_id, class_id, subject);
  if (!possible) return res.status(400).json({ error: 'Set the possible mark for this subject first' });

  const upsert = db.prepare(`
    INSERT INTO exam_results (id, exam_term_id, class_id, learner_id, subject, mark, percentage, units, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(exam_term_id, learner_id, subject) DO UPDATE SET
      mark = excluded.mark, percentage = excluded.percentage, units = excluded.units, recorded_by = excluded.recorded_by
  `);

  const tx = db.transaction((rows) => {
    for (const r of rows) {
      const pct = (r.mark / possible.possible_mark) * 100;
      const units = percentageToUnits(pct);
      upsert.run(uuid(), exam_term_id, class_id, r.learner_id, subject, r.mark, pct, units, req.user.id);
    }
  });
  tx(results);

  res.json({ ok: true, count: results.length });
});

// GET /exams/class-positions?exam_term_id=&class_id=  (admin + teacher of that class)
router.get('/class-positions', classAccessRequired, (req, res) => {
  const { exam_term_id, class_id } = req.query;
  const rows = db.prepare(`
    SELECT learner_id, subject, mark,
      (SELECT possible_mark FROM exam_possible_marks epm
        WHERE epm.exam_term_id = er.exam_term_id AND epm.class_id = ? AND epm.subject = er.subject) AS possible_mark
    FROM exam_results er WHERE exam_term_id = ? AND class_id = ?
  `).all(class_id, exam_term_id, class_id);

  const ranked = computeClassPositions(rows);

  const withNames = ranked.map(r => {
    const learner = db.prepare('SELECT surname, first_name FROM learners WHERE id = ?').get(r.learner_id);
    return { ...r, name: learner ? `${learner.first_name} ${learner.surname}` : r.learner_id };
  });

  res.json(withNames);
});

// PATCH /exams/release  (admin) { exam_term_id, learner_id, released: true/false }
router.patch('/release', requireRole('admin'), (req, res) => {
  const { exam_term_id, learner_id, released } = req.body;
  const exists = db.prepare('SELECT 1 FROM exam_result_release WHERE exam_term_id=? AND learner_id=?').get(exam_term_id, learner_id);
  if (exists) {
    db.prepare(`UPDATE exam_result_release SET released_to_guardians=?, released_by=?, released_at=datetime('now')
      WHERE exam_term_id=? AND learner_id=?`).run(+!!released, req.user.id, exam_term_id, learner_id);
  } else {
    db.prepare(`INSERT INTO exam_result_release (id, exam_term_id, learner_id, released_to_guardians, released_by, released_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))`).run(uuid(), exam_term_id, learner_id, +!!released, req.user.id);
  }
  res.json({ ok: true });
});

// GET /exams/guardian-view?exam_term_id=&learner_id=  (parent role - checks release + fee balance rule)
router.get('/guardian-view', (req, res) => {
  if (req.user.role !== 'parent' && req.user.role !== 'admin') return res.status(403).json({ error: 'Not permitted' });
  const { exam_term_id, learner_id } = req.query;

  if (req.user.role === 'parent') {
    const guardian = db.prepare('SELECT id FROM guardians WHERE user_id = ?').get(req.user.id);
    const learner = db.prepare('SELECT * FROM learners WHERE id = ? AND (guardian1_id = ? OR guardian2_id = ?)')
      .get(learner_id, guardian?.id, guardian?.id);
    if (!learner) return res.status(403).json({ error: 'Not your child' });
  }

  const release = db.prepare('SELECT * FROM exam_result_release WHERE exam_term_id=? AND learner_id=?').get(exam_term_id, learner_id);
  if (!release || !release.released_to_guardians) {
    return res.status(403).json({ error: 'Results not yet released by the school' });
  }

  // Respect the admin's per-invoice toggle for releasing results while a balance is outstanding
  const invoice = db.prepare('SELECT * FROM fee_invoices WHERE learner_id = ? ORDER BY created_at DESC LIMIT 1').get(learner_id);
  if (invoice && invoice.balance > 0 && !invoice.release_results_if_balance) {
    return res.status(402).json({ error: 'Results withheld due to outstanding fee balance' });
  }

  const results = db.prepare('SELECT subject, mark, percentage, units FROM exam_results WHERE exam_term_id=? AND learner_id=?').all(exam_term_id, learner_id);
  res.json({ results });
});

module.exports = router;
