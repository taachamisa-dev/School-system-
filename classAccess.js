const db = require('./connection');

// Ensures a teacher can only touch records belonging to a class they teach.
// Admins pass through freely. Expects req.params.classId or req.body.class_id.
function classAccessRequired(req, res, next) {
  const classId = req.params.classId || req.body.class_id || req.query.class_id;
  if (!classId) return res.status(400).json({ error: 'class_id required' });

  if (req.user.role === 'admin') return next();

  if (req.user.role === 'teacher') {
    const cls = db.prepare('SELECT * FROM classes WHERE id = ? AND school_id = ?').get(classId, req.user.school_id);
    if (!cls || cls.teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not teach this class' });
    }
    return next();
  }

  return res.status(403).json({ error: 'Not permitted' });
}

module.exports = { classAccessRequired };
