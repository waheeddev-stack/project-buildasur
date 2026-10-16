// GET /api/jobs/:id — generation job progress/result.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/:id', (req, res) => {
  const job = db.findById('jobs', req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.', fix: 'Start a new generation.' });
  res.json({
    status: job.status, progress: job.progress,
    resultTimetableId: job.resultTimetableId || null,
    error: job.error || null, infeasibilityReport: job.infeasibilityReport || null,
  });
});

module.exports = router;
