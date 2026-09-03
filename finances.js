const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('./connection');
const { authRequired, requireRole, subscriptionActive } = require('./auth');

const router = express.Router();
router.use(authRequired, subscriptionActive);

// ---- FEE INVOICES (admin manages; teachers get a filtered read if admin allows) ----

// POST /finances/invoices (admin) { learner_id, term, year, amount_due }
router.post('/invoices', requireRole('admin'), (req, res) => {
  const { learner_id, term, year, amount_due } = req.body;
  const id = uuid();
  db.prepare(`
    INSERT INTO fee_invoices (id, school_id, learner_id, term, year, amount_due, amount_paid, balance)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, req.user.school_id, learner_id, term, year, amount_due, amount_due);
  res.status(201).json({ id });
});

// GET /finances/invoices  (admin: all with balances; parent: only own children; teacher: only shows balance flag if admin allowed it)
router.get('/invoices', (req, res) => {
  if (req.user.role === 'admin') {
    return res.json(db.prepare('SELECT * FROM fee_invoices WHERE school_id = ?').all(req.user.school_id));
  }
  if (req.user.role === 'parent') {
    const guardian = db.prepare('SELECT id FROM guardians WHERE user_id = ?').get(req.user.id);
    if (!guardian) return res.json([]);
    return res.json(db.prepare(`
      SELECT fi.* FROM fee_invoices fi JOIN learners l ON l.id = fi.learner_id
      WHERE l.guardian1_id = ? OR l.guardian2_id = ?
    `).all(guardian.id, guardian.id));
  }
  if (req.user.role === 'teacher') {
    const { class_id } = req.query;
    if (!class_id) return res.status(400).json({ error: 'class_id required' });
    const cls = db.prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').get(class_id, req.user.id);
    if (!cls) return res.status(403).json({ error: 'Not your class' });
    // Only expose whether each learner HAS a balance, per admin's show_teacher_balance toggle
    const rows = db.prepare(`
      SELECT l.id AS learner_id, l.surname, l.first_name,
        CASE WHEN fi.balance > 0 AND fi.show_teacher_balance = 1 THEN 1 ELSE 0 END AS has_balance
      FROM learners l LEFT JOIN fee_invoices fi ON fi.learner_id = l.id
      WHERE l.class_id = ?
    `).all(class_id);
    return res.json(rows);
  }
  return res.status(403).json({ error: 'Not permitted' });
});

// PATCH /finances/invoices/:id/visibility (admin) { show_teacher_balance, release_results_if_balance }
router.patch('/invoices/:id/visibility', requireRole('admin'), (req, res) => {
  const { show_teacher_balance, release_results_if_balance } = req.body;
  db.prepare(`UPDATE fee_invoices SET show_teacher_balance = ?, release_results_if_balance = ? WHERE id = ? AND school_id = ?`)
    .run(+!!show_teacher_balance, +!!release_results_if_balance, req.params.id, req.user.school_id);
  res.json({ ok: true });
});

// POST /finances/payments  { invoice_id, amount, method, paid_by }  - online payments would call this from a payment gateway webhook
router.post('/payments', (req, res) => {
  const { invoice_id, amount, method, paid_by } = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO fee_payments (id, invoice_id, amount, method, paid_by, recorded_by) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, invoice_id, amount, method, paid_by, req.user.id);

  db.prepare(`
    UPDATE fee_invoices SET amount_paid = amount_paid + ?, balance = amount_due - (amount_paid + ?)
    WHERE id = ?
  `).run(amount, amount, invoice_id);

  res.status(201).json({ id });
});

// ---- PAYROLL (private schools) ----
router.post('/payroll', requireRole('admin'), (req, res) => {
  const { employee_id, amount, period } = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO employee_payments (id, school_id, employee_id, amount, period, recorded_by) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.school_id, employee_id, amount, period, req.user.id);
  res.status(201).json({ id });
});

router.get('/payroll', requireRole('admin'), (req, res) => {
  res.json(db.prepare('SELECT * FROM employee_payments WHERE school_id = ?').all(req.user.school_id));
});

// ---- SUBSCRIPTION / SYSTEM BILLING (the $50/year fee to use School Manager itself) ----
router.get('/subscription', (req, res) => {
  const school = db.prepare('SELECT id, name, plan, trial_start, trial_end, subscription_paid_until, annual_fee_usd FROM schools WHERE id = ?')
    .get(req.user.school_id);
  res.json(school);
});

// POST /finances/subscription/renew (admin) { paid_until }  - call after a successful payment gateway transaction
router.post('/subscription/renew', requireRole('admin'), (req, res) => {
  const { paid_until } = req.body;
  db.prepare(`UPDATE schools SET subscription_paid_until = ?, plan = 'active' WHERE id = ?`).run(paid_until, req.user.school_id);
  res.json({ ok: true });
});

module.exports = router;
