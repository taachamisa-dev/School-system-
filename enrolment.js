const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('./connection');
const { authRequired, requireRole } = require('./auth');

const router = express.Router();

// GET /enrolment/vacancies/:schoolId  - PUBLIC. Shows which grades still have space.
// "Vacancy" here = classes with fewer than MAX_CLASS_SIZE learners. Adjust the cap as needed.
const MAX_CLASS_SIZE = 40;
router.get('/vacancies/:schoolId', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id AS class_id, c.grade_level, c.stream_name, COUNT(l.id) AS enrolled,
      (? - COUNT(l.id)) AS vacancies
    FROM classes c LEFT JOIN learners l ON l.class_id = c.id AND l.enrollment_status = 'active'
    WHERE c.school_id = ? AND c.approved_by_admin = 1
    GROUP BY c.id
    HAVING vacancies > 0
  `).all(MAX_CLASS_SIZE, req.params.schoolId);
  res.json(rows);
});

// POST /enrolment/apply  - PUBLIC. Only succeeds if the requested grade currently has a vacancy.
router.post('/apply', (req, res) => {
  const b = req.body;
  const vacancy = db.prepare(`
    SELECT COUNT(l.id) AS enrolled FROM classes c
    LEFT JOIN learners l ON l.class_id = c.id AND l.enrollment_status = 'active'
    WHERE c.school_id = ? AND c.grade_level = ? AND c.approved_by_admin = 1
    GROUP BY c.id HAVING enrolled < ?
  `).get(b.school_id, b.grade_applied_for, MAX_CLASS_SIZE);

  if (!vacancy) {
    return res.status(409).json({ error: 'No vacancy currently available for that grade' });
  }

  const id = uuid();
  db.prepare(`
    INSERT INTO enrolment_applications (id, school_id, applicant_surname, applicant_first_name, date_of_birth,
      grade_applied_for, guardian_name, guardian_phone, guardian_email, guardian_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, b.school_id, b.applicant_surname, b.applicant_first_name, b.date_of_birth, b.grade_applied_for,
    b.guardian_name, b.guardian_phone, b.guardian_email, b.guardian_address);

  res.status(201).json({ id, message: 'Application submitted. You may proceed to pay the application fee if required.' });
  // NB: wire a real payment gateway (e.g. Paynow, Flutterwave, Stripe) here, then call
  // PATCH /enrolment/:id/payment once the gateway confirms payment.
});

// PATCH /enrolment/:id/payment  - mark application fee paid (called by payment gateway webhook/admin)
router.patch('/:id/payment', (req, res) => {
  db.prepare('UPDATE enrolment_applications SET application_fee_paid = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- ADMIN REVIEW ----
router.get('/applications', authRequired, requireRole('admin'), (req, res) => {
  res.json(db.prepare('SELECT * FROM enrolment_applications WHERE school_id = ? ORDER BY submitted_at DESC').all(req.user.school_id));
});

// PATCH /enrolment/:id/decision (admin) { status: 'approved'|'rejected'|'waitlisted', class_id (if approved) }
router.patch('/:id/decision', authRequired, requireRole('admin'), (req, res) => {
  const { status, class_id } = req.body;
  const app = db.prepare('SELECT * FROM enrolment_applications WHERE id = ? AND school_id = ?').get(req.params.id, req.user.school_id);
  if (!app) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE enrolment_applications SET status = ?, reviewed_by = ? WHERE id = ?').run(status, req.user.id, req.params.id);

  if (status === 'approved') {
    const learnerId = uuid();
    db.prepare(`
      INSERT INTO learners (id, school_id, class_id, surname, first_name, date_of_birth, enrollment_status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(learnerId, req.user.school_id, class_id, app.applicant_surname, app.applicant_first_name, app.date_of_birth);
    return res.json({ ok: true, learner_id: learnerId });
  }

  res.json({ ok: true });
});

module.exports = router;
