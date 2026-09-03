const express = require('express');
const db = require('./connection');
const { authRequired, subscriptionActive } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, subscriptionActive);

// GET /social-records/:learnerId - merges learner + guardian + social_records into one view
router.get('/:learnerId', (req, res) => {
  const learner = db.prepare('SELECT * FROM learners WHERE id = ?').get(req.params.learnerId);
  if (!learner) return res.status(404).json({ error: 'Learner not found' });

  const guardian = learner.guardian1_id
    ? db.prepare('SELECT * FROM guardians WHERE id = ?').get(learner.guardian1_id)
    : null;

  let record = db.prepare('SELECT * FROM social_records WHERE learner_id = ?').get(req.params.learnerId);

  res.json({
    name: `${learner.first_name} ${learner.surname}`,
    date_of_birth: learner.date_of_birth,          // auto-pulled
    religion: learner.religion,                     // auto-pulled
    hobby: record?.hobby || null,
    parent_guardian_name: guardian?.name || null,    // auto-pulled
    parent_guardian_occupation: record?.parent_guardian_occupation || guardian?.occupation || null,
    phone_number: guardian?.phone || learner.phone_number,
    address: guardian?.address || learner.address,
    birth_entry_number: record?.birth_entry_number || null,
    birth_rank: record ? `${record.birth_rank_numerator} of ${record.birth_rank_denominator}` : null,
    health_status: record?.health_status || null,
    distance_from_home: record?.distance_from_home || null,
    family_type: record?.family_type || null,
    aspiration: record?.aspiration || null
  });
});

// PUT /social-records/:learnerId - create/update the editable portion (teacher of that class, or admin)
router.put('/:learnerId', (req, res) => {
  const b = req.body;
  const exists = db.prepare('SELECT 1 FROM social_records WHERE learner_id = ?').get(req.params.learnerId);

  if (exists) {
    db.prepare(`
      UPDATE social_records SET birth_entry_number=?, birth_rank_numerator=?, birth_rank_denominator=?,
        health_status=?, hobby=?, parent_guardian_occupation=?, distance_from_home=?, family_type=?, aspiration=?,
        updated_at = datetime('now')
      WHERE learner_id = ?
    `).run(b.birth_entry_number, b.birth_rank_numerator, b.birth_rank_denominator, b.health_status, b.hobby,
      b.parent_guardian_occupation, b.distance_from_home, b.family_type, b.aspiration, req.params.learnerId);
  } else {
    db.prepare(`
      INSERT INTO social_records (id, learner_id, birth_entry_number, birth_rank_numerator, birth_rank_denominator,
        health_status, hobby, parent_guardian_occupation, distance_from_home, family_type, aspiration)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.learnerId, b.birth_entry_number, b.birth_rank_numerator, b.birth_rank_denominator,
      b.health_status, b.hobby, b.parent_guardian_occupation, b.distance_from_home, b.family_type, b.aspiration);
  }
  res.json({ ok: true });
});

module.exports = router;
