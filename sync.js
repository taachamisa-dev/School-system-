const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('./connection');
const { authRequired, subscriptionActive } = require('./auth');

const router = express.Router();
router.use(authRequired, subscriptionActive);

// Whitelist of tables the offline client is allowed to sync into.
// (Keeps a rogue/buggy client from writing into schools/users directly.)
const SYNCABLE_TABLES = new Set([
  'attendance', 'social_records', 'remedial_records', 'extension_records',
  'inventory_items', 'reading_records', 'anecdotal_records', 'health_daily',
  'health_immunisation', 'progress_records', 'exam_results', 'fee_payments',
  'project_finances', 'project_stock', 'project_assets'
]);

// POST /sync/push  { device_id, changes: [{table_name, record_id, operation, payload, created_locally_at}] }
// This is a simple last-write-wins log. For production, add per-table upsert logic
// (like the ON CONFLICT clauses already used in attendance/exams) keyed on record_id.
router.post('/push', (req, res) => {
  const { device_id, changes } = req.body;
  if (!Array.isArray(changes)) return res.status(400).json({ error: 'changes[] required' });

  const insertLog = db.prepare(`
    INSERT INTO sync_log (id, school_id, device_id, table_name, record_id, operation, payload, created_locally_at, synced_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((rows) => {
    for (const c of rows) {
      if (!SYNCABLE_TABLES.has(c.table_name)) continue; // silently skip disallowed tables
      insertLog.run(uuid(), req.user.school_id, device_id, c.table_name, c.record_id, c.operation,
        JSON.stringify(c.payload), c.created_locally_at, req.user.id);
      // TODO for each table: parse c.payload and run the matching INSERT ... ON CONFLICT UPDATE,
      // mirroring the upsert logic already used in routes/attendance.js and routes/exams.js.
    }
  });
  tx(changes);

  res.json({ ok: true, received: changes.length });
});

// GET /sync/pull?since=ISO_TIMESTAMP  -> lightweight approach: client re-fetches normal GET endpoints.
// For a true delta sync, add an updated_at column + index to each table and filter by it here.
router.get('/pull', (req, res) => {
  res.json({ message: 'Use the regular module GET endpoints (attendance, exams, etc.) to refresh local data after connecting.' });
});

module.exports = router;
