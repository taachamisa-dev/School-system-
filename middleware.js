const jwt = require('jsonwebtoken');

function authRequired(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role!== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  }
}

function generateToken(user) {
  return jwt.sign({ id: user.id, role: user.role, school_id: user.school_id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { authRequired, requireRole, generateToken };
