const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { authRequired, subscriptionActive } = require('../middleware/auth');
const { classAccessRequired } = require('../middleware/classAccess');

const router = express.Router();
router.use(authRequired, subscriptionActive);

// POST /reading-record/skills  { class_id, subject, skill_name, sequence_no } - teacher defines skills up front
router.post('/skills', classAccessRequired, (req, res) => {
  const { class_id, subject, skill_name, sequence_no } = req.body;
  if (!['English','ChiShona'].includes(subject)) return res.status(400).json({ error: 'subject must be English or ChiShona' });
  const id = uuid();
  db.prepare(`INSERT INTO reading_skills (id, class_id, subject, skill_name, sequence_no) VALUES (?, ?, ?, ?, ?)`)
    .run(id, class_id, subject, skill_name, sequence_no || 0);
  res.status(201).json({ id });
});

// GET /reading-record/skills?class_id=&subject=
router.get('/skills', classAccessRequired, (req, res) => {
  const { class_id, subject } = req.query;
  res.json(db.prepare('SELECT * FROM reading_skills WHERE class_id = ? AND subject = ? ORDER BY sequence_no').all(class_id, subject));
});

// POST /reading-record  { class_id, learner_id, subject, record_date, source_of_matter, skill_id, mastery: 'M'|'X' }
router.post('/', classAccessRequired, (req, res) => {
  const b = req.body;
  if (!['M','X'].includes(b.mastery)) return res.status(400).json({ error: "mastery must be 'M' or 'X'" });
  const id = uuid();
  db.prepare(`
    INSERT INTO reading_records (id, class_id, learner_id, subject, record_date, source_of_matter, skill_id, mastery, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, b.class_id, b.learner_id, b.subject, b.record_date, b.source_of_matter, b.skill_id, b.mastery, req.user.id);
  res.status(201).json({ id });
});

// GET /reading-record?class_id=&subject=&learner_id=(optional)
router.get('/', classAccessRequired, (req, res) => {
  const { class_id, subject, learner_id } = req.query;
  const rows = learner_id
    ? db.prepare('SELECT * FROM reading_records WHERE class_id = ? AND subject = ? AND learner_id = ? ORDER BY record_date').all(class_id, subject, learner_id)
    : db.prepare('SELECT * FROM reading_records WHERE class_id = ? AND subject = ? ORDER BY record_date').all(class_id, subject);
  res.json(rows);
});

module.exports = router;
