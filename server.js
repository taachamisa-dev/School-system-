require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

require('./connection'); // applies schema on boot

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth', require('./auth'));
app.use('/classes', require('./classes'));
app.use('/learners', require('./learners'));
app.use('/attendance', require('./attendance'));
app.use('/social-records', require('./socialRecords'));
app.use('/remedial', require('./remedial'));
app.use('/extension', require('./extension'));
app.use('/inventory', require('./inventory'));
app.use('/reading-record', require('./readingRecord'));
app.use('/anecdotal', require('./anecdotal'));
app.use('/health-checklist', require('./healthChecklist'));
app.use('/progress-record', require('./progressRecord'));
app.use('/exams', require('./exams'));
app.use('/finances', require('./finances'));
app.use('/employees', require('./employees'));
app.use('/projects', require('./projects'));
app.use('/enrolment', require('./enrolment'));
app.use('/sync', require('./sync'));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`School Manager API running on port ${PORT}`));
