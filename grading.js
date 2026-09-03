// Converts a percentage into the 9-unit grading scale you specified.
function percentageToUnits(pct) {
  if (pct >= 85) return 1;
  if (pct >= 77) return 2;
  if (pct >= 70) return 3;
  if (pct >= 60) return 4;
  if (pct >= 50) return 5;
  if (pct >= 40) return 6;
  if (pct >= 30) return 7;
  if (pct >= 20) return 8;
  return 9;
}

// Given all exam_results rows (mark + possible_mark already known per subject)
// for one exam_term_id, compute per-learner totals and rank them.
// results: [{ learner_id, subject, mark, possible_mark }]
// Returns: [{ learner_id, total_units, total_percentage, subjects_written, position }]
function computeClassPositions(resultsBySubject) {
  const byLearner = {};

  for (const r of resultsBySubject) {
    const pct = (r.mark / r.possible_mark) * 100;
    const units = percentageToUnits(pct);

    if (!byLearner[r.learner_id]) {
      byLearner[r.learner_id] = { learner_id: r.learner_id, total_units: 0, total_percentage: 0, subjects_written: 0 };
    }
    byLearner[r.learner_id].total_units += units;
    byLearner[r.learner_id].total_percentage += pct;
    byLearner[r.learner_id].subjects_written += 1;
  }

  let learners = Object.values(byLearner);

  // Lower total units = better. Tie-break: higher total percentage wins.
  learners.sort((a, b) => {
    if (a.total_units !== b.total_units) return a.total_units - b.total_units;
    return b.total_percentage - a.total_percentage;
  });

  // Assign positions (ties in BOTH units and percentage share the same position)
  let position = 0;
  let prev = null;
  learners.forEach((l, idx) => {
    if (!prev || l.total_units !== prev.total_units || l.total_percentage !== prev.total_percentage) {
      position = idx + 1;
    }
    l.position = position;
    prev = l;
  });

  return learners;
}

module.exports = { percentageToUnits, computeClassPositions };
