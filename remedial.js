const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('./connection');
const { authRequired, subscriptionActive } = require('./auth');
const { classAccessRequired } = require('./classAccess');

const router = express.Router();
router.use(authRequired, subscriptionActive);

const SUBJECTS = ['ChiShona','English Language','Mathematics','Physical Education and Arts','Science and Technology','Social Science'];

router.get('/subjects', (req, res) => res.json(SUBJECTS));

// GET /remedial?class_id=&subject=
router.get('/', classAccessRequired, (req, res) => {
  const { class_id, subject } = req.query;
  const rows = subject
    ? db.prepare('SELECT * FROM remedial_records WHERE class_id = ? AND subject = ? ORDER BY record_date DESC').all(class_id, subject)
    : db.prepare('SELECT * FROM remedial_records WHERE class_id = ? ORDER BY record_date DESC').all(class_id);
  res.json(rows);
});

// POST /remedial  { class_id, learner_id, subject, record_date, topic, area_of_difficulty, methods_and_activities, evaluation }
router.post('/', classAccessRequired, (req, res) => {
  const b = req.body;
  if (!SUBJECTS.includes(b.subject)) return res.status(400).json({ error: 'Invalid subject' });
  const id = uuid();
  db.prepare(`
    INSERT INTO remedial_records (id, class_id, learner_id, subject, record_date, topic, area_of_difficulty, methods_and_activities, evaluation, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, b.class_id, b.learner_id, b.subject, b.record_date, b.topic, b.area_of_difficulty, b.methods_and_activities, b.evaluation, req.user.id);
  res.status(201).json({ id });
});

module.exports = router;
