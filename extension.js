const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('./connection');
const { authRequired, subscriptionActive } = require('./auth');
const { classAccessRequired } = require('./classAccess');

const router = express.Router();
router.use(authRequired, subscriptionActive);

const SUBJECTS = ['ChiShona','English Language','Mathematics','Physical Education and Arts','Science and Technology','Social Science'];

router.get('/', classAccessRequired, (req, res) => {
  const { class_id, subject } = req.query;
  const rows = subject
    ? db.prepare('SELECT * FROM extension_records WHERE class_id = ? AND subject = ? ORDER BY record_date DESC').all(class_id, subject)
    : db.prepare('SELECT * FROM extension_records WHERE class_id = ? ORDER BY record_date DESC').all(class_id);
  res.json(rows);
});

// POST /extension { class_id, learner_id, subject, record_date, topic, mastered_concept, objectives, extension_work, evaluation }
router.post('/', classAccessRequired, (req, res) => {
  const b = req.body;
  if (!SUBJECTS.includes(b.subject)) return res.status(400).json({ error: 'Invalid subject' });
  const id = uuid();
  db.prepare(`
    INSERT INTO extension_records (id, class_id, learner_id, subject, record_date, topic, mastered_concept, objectives, extension_work, evaluation, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, b.class_id, b.learner_id, b.subject, b.record_date, b.topic, b.mastered_concept, b.objectives, b.extension_work, b.evaluation, req.user.id);
  res.status(201).json({ id });
});

module.exports = router;
