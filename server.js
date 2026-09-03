require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

require('./db/connection'); // applies schema on boot

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth', require('./routes/auth'));
app.use('/classes', require('./routes/classes'));
app.use('/learners', require('./routes/learners'));
app.use('/attendance', require('./routes/attendance'));
app.use('/social-records', require('./routes/socialRecords'));
app.use('/remedial', require('./routes/remedial'));
app.use('/extension', require('./routes/extension'));
app.use('/inventory', require('./routes/inventory'));
app.use('/reading-record', require('./routes/readingRecord'));
app.use('/anecdotal', require('./routes/anecdotal'));
app.use('/health-checklist', require('./routes/healthChecklist'));
app.use('/progress-record', require('./routes/progressRecord'));
app.use('/exams', require('./routes/exams'));
app.use('/finances', require('./routes/finances'));
app.use('/employees', require('./routes/employees'));
app.use('/projects', require('./routes/projects'));
app.use('/enrolment', require('./routes/enrolment'));
app.use('/sync', require('./routes/sync'));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`School Manager API running on port ${PORT}`));
