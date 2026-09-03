const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('./connection');
const { authRequired, requireRole, subscriptionActive } = require('./auth');

const router = express.Router();
router.use(authRequired, subscriptionActive);

function isProjectTeacher(projectId, userId) {
  return db.prepare('SELECT 1 FROM project_teachers WHERE project_id = ? AND teacher_id = ?').get(projectId, userId);
}
function canEditProject(req, projectId) {
  return req.user.role === 'admin' ? false /* admin is view-only per spec */ : !!isProjectTeacher(projectId, req.user.id);
}

// POST /projects (admin creates, e.g. "Poultry", "Goat Farming")
router.post('/', requireRole('admin'), (req, res) => {
  const { name, description } = req.body;
  const id = uuid();
  db.prepare('INSERT INTO projects (id, school_id, name, description, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.user.school_id, name, description, req.user.id);
  res.status(201).json({ id });
});

// POST /projects/:id/assign-teacher (admin)
router.post('/:id/assign-teacher', requireRole('admin'), (req, res) => {
  const { teacher_id } = req.body;
  db.prepare('INSERT INTO project_teachers (id, project_id, teacher_id) VALUES (?, ?, ?)')
    .run(uuid(), req.params.id, teacher_id);
  res.status(201).json({ ok: true });
});

// GET /projects - admin sees all (view-only), teacher sees only assigned projects
router.get('/', (req, res) => {
  if (req.user.role === 'admin') return res.json(db.prepare('SELECT * FROM projects WHERE school_id = ?').all(req.user.school_id));
  if (req.user.role === 'teacher') {
    return res.json(db.prepare(`
      SELECT p.* FROM projects p JOIN project_teachers pt ON pt.project_id = p.id WHERE pt.teacher_id = ?
    `).all(req.user.id));
  }
  return res.status(403).json({ error: 'Not permitted' });
});

// ---- Finances / Stock / Assets: editable ONLY by assigned teachers; admin gets read-only via GET above + these GETs ----
router.post('/:id/finances', (req, res) => {
  if (!canEditProject(req, req.params.id)) return res.status(403).json({ error: 'Only assigned project teachers can edit' });
  const { record_date, description, type, amount } = req.body;
  const id = uuid();
  db.prepare('INSERT INTO project_finances (id, project_id, record_date, description, type, amount, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.params.id, record_date, description, type, amount, req.user.id);
  res.status(201).json({ id });
});
router.get('/:id/finances', (req, res) => {
  res.json(db.prepare('SELECT * FROM project_finances WHERE project_id = ? ORDER BY record_date DESC').all(req.params.id));
});

router.post('/:id/stock', (req, res) => {
  if (!canEditProject(req, req.params.id)) return res.status(403).json({ error: 'Only assigned project teachers can edit' });
  const { item_name, quantity, unit, notes } = req.body;
  const id = uuid();
  db.prepare('INSERT INTO project_stock (id, project_id, item_name, quantity, unit, notes, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.params.id, item_name, quantity, unit, notes, req.user.id);
  res.status(201).json({ id });
});
router.get('/:id/stock', (req, res) => {
  res.json(db.prepare('SELECT * FROM project_stock WHERE project_id = ?').all(req.params.id));
});

router.post('/:id/assets', (req, res) => {
  if (!canEditProject(req, req.params.id)) return res.status(403).json({ error: 'Only assigned project teachers can edit' });
  const { asset_name, description, condition, quantity } = req.body;
  const id = uuid();
  db.prepare('INSERT INTO project_assets (id, project_id, asset_name, description, condition, quantity, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.params.id, asset_name, description, condition, quantity || 1, req.user.id);
  res.status(201).json({ id });
});
router.get('/:id/assets', (req, res) => {
  res.json(db.prepare('SELECT * FROM project_assets WHERE project_id = ?').all(req.params.id));
});

module.exports = router;
