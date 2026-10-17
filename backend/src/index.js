// SlotSync backend entrypoint.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const db = require('./db');
const { requireAuth } = require('./auth');
const { seedDatabase } = require('./seed');

const authRoutes = require('./routes/auth');
const mastersRoutes = require('./routes/masters');
const gridRoutes = require('./routes/grid');
const timetablesRoutes = require('./routes/timetables');
const jobsRoutes = require('./routes/jobs');
const aiRoutes = require('./routes/ai');
const miscRoutes = require('./routes/misc');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('dev'));

app.get('/api/health', async (req, res) => {
  try {
    const h = await db.health();
    res.json({ ok: h.ok, service: 'slotsync-backend', db: h });
  } catch (e) {
    res.json({ ok: true, service: 'slotsync-backend', db: { dialect: db.dialect, ok: false, error: e.message } });
  }
});

// Auto-seed on first run if db empty.
try {
  const d = db.read();
  if (d.users.length === 0 && d.teachers.length === 0) {
    seedDatabase({});
    console.log('Seeded demo data.');
  }
} catch (e) {
  console.error('Auto-seed failed:', e.message);
}

app.use('/api/auth', authRoutes);
app.use('/api/time-grid', gridRoutes);
app.use('/api', timetablesRoutes);       // /api/timetables* (public read), /api/sessions/:id
app.use('/api/jobs', jobsRoutes);
app.use('/api/ai', aiRoutes);
// misc before masters so /api/rooms/free wins over /api/rooms/:id
app.use('/api', miscRoutes);             // /api/rooms/free, /api/audit-log, /api/seed
app.use('/api', mastersRoutes);          // /api/teachers|rooms|subjects|batches|assignments

app.get('/api/me', requireAuth, (req, res) => {
  const { password_hash, ...safe } = req.user;
  res.json({ user: safe });
});

// 404
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.', fix: 'Check the endpoint URL.' }));

// Global error handler: {error, fix}, never stack in prod.
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== 'production') console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Something went wrong.', fix: 'Try again; if it keeps failing, contact your admin.' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`SlotSync backend on http://localhost:${PORT}`));
}

module.exports = app;
