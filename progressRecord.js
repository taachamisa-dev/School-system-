const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('./connection');
const { authRequired, subscriptionActive } = require('../middleware/auth');
const { classAccessRequired } = require('../middleware/classAccess');

const router = express.Router();
router.use(authRequired, subscriptionActive);

const SUBJECTS = ['ChiShona','English Language','Mathematics','Physical Education and Arts','Science and Technology','Social Science'];

// POST /progress-record  { class_id, learner_id, subject, record_date, concept_tested, mark, possible_mark }
router.post('/', classAccessRequired, (req, res) => {
  const b = req.body;
  if (!SUBJECTS.includes(b.subject)) return res.status(400).json({ error: 'Invalid subject' });
  const id = uuid();
  db.prepare(`
    INSERT INTO progress_records (id, class_id, learner_id, subject, record_date, concept_tested, mark, possible_mark, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, b.class_id, b.learner_id, b.subject, b.record_date, b.concept_tested, b.mark, b.possible_mark, req.user.id);
  res.status(201).json({ id });
});

// GET /progress-record?class_id=&subject=  -> each row flagged below_half for red-highlight in the UI
router.get('/', classAccessRequired, (req, res) => {
  const { class_id, subject } = req.query;
  const rows = db.prepare(`
    SELECT pr.*, l.surname, l.first_name FROM progress_records pr
    JOIN learners l ON l.id = pr.learner_id
    WHERE pr.class_id = ? AND pr.subject = ? ORDER BY pr.record_date DESC
  `).all(class_id, subject);
  res.json(rows.map(r => ({ ...r, below_half: r.possible_mark > 0 && (r.mark / r.possible_mark) < 0.5 })));
});

module.exports = router;
