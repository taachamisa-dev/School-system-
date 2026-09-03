// Run with: npm run seed
// Creates the first school (on a 14-day free trial) and its admin login.
const { v4: uuid } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('./connection');
require('dotenv').config();

const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS || '14', 10);
const ANNUAL_FEE = parseFloat(process.env.ANNUAL_FEE_USD || '50');

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

const SCHOOL_NAME = process.argv[2] || 'Demo Primary School';
const ADMIN_EMAIL = process.argv[3] || 'admin@school.test';
const ADMIN_PASSWORD = process.argv[4] || 'ChangeMe123!';

const schoolId = uuid();
db.prepare(`
  INSERT INTO schools (id, name, plan, trial_start, trial_end, annual_fee_usd)
  VALUES (?, ?, 'trial', datetime('now'), ?, ?)
`).run(schoolId, SCHOOL_NAME, daysFromNow(TRIAL_DAYS), ANNUAL_FEE);

const adminId = uuid();
const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
db.prepare(`
  INSERT INTO users (id, school_id, name, email, password_hash, role)
  VALUES (?, ?, 'School Admin', ?, ?, 'admin')
`).run(adminId, schoolId, ADMIN_EMAIL, hash);

console.log('Seed complete.');
console.log('School ID:', schoolId);
console.log('Admin login:', ADMIN_EMAIL, '/', ADMIN_PASSWORD);
console.log(`Trial ends in ${TRIAL_DAYS} days. After that, plan status becomes "expired" until payment is recorded.`);
