import { ScenarioConfig, TestResult, FailedRun, Shift, Volunteer, Settings, Assignment } from './types';
import { generateTestData, summarizeInput } from './dataGenerator';
import { solveShiftAssignment } from './solver';

// Define test scenarios
export const SCENARIOS: ScenarioConfig[] = [
  {
    name: 'baseline',
    days: 9,
    volunteers: 50,
    eventShiftsPerDay: 3,
    capacityRatio: 1.2,
    prefsPerVolunteer: 10,
    preAssignedPercent: 10,
    preferenceCorrelation: 'random',
    forbidBackToBack: false,
    description: 'Typical medium camp, balanced capacity'
  },
  {
    name: 'small_easy',
    days: 6,
    volunteers: 20,
    eventShiftsPerDay: 2,
    capacityRatio: 1.5,
    prefsPerVolunteer: 10,
    preAssignedPercent: 5,
    preferenceCorrelation: 'random',
    forbidBackToBack: false,
    description: 'Small camp with ample capacity'
  },
  {
    name: 'large_scale',
    days: 12,
    volunteers: 100,
    eventShiftsPerDay: 4,
    capacityRatio: 1.2,
    prefsPerVolunteer: 15,
    preAssignedPercent: 15,
    preferenceCorrelation: 'random',
    forbidBackToBack: false,
    description: 'Large camp, many shifts'
  },
  {
    name: 'tight_capacity',
    days: 9,
    volunteers: 50,
    eventShiftsPerDay: 3,
    capacityRatio: 0.95,
    prefsPerVolunteer: 10,
    preAssignedPercent: 10,
    preferenceCorrelation: 'random',
    forbidBackToBack: false,
    description: 'Capacity barely meets requirements'
  },
  {
    name: 'sparse_preferences',
    days: 9,
    volunteers: 50,
    eventShiftsPerDay: 3,
    capacityRatio: 1.2,
    prefsPerVolunteer: 5,
    preAssignedPercent: 10,
    preferenceCorrelation: 'random',
    forbidBackToBack: false,
    description: 'Volunteers only rank 5 shifts'
  },
  {
    name: 'heavy_preassigned',
    days: 9,
    volunteers: 50,
    eventShiftsPerDay: 3,
    capacityRatio: 1.2,
    prefsPerVolunteer: 10,
    preAssignedPercent: 50,
    preferenceCorrelation: 'random',
    forbidBackToBack: false,
    description: 'Half of volunteers have pre-assigned points'
  },
  {
    name: 'popular_shifts',
    days: 9,
    volunteers: 50,
    eventShiftsPerDay: 3,
    capacityRatio: 1.2,
    prefsPerVolunteer: 10,
    preAssignedPercent: 10,
    preferenceCorrelation: 'popular_shifts',
    forbidBackToBack: false,
    description: 'Everyone wants the same 20% of shifts'
  },
  {
    name: 'avoid_morning',
    days: 9,
    volunteers: 50,
    eventShiftsPerDay: 3,
    capacityRatio: 1.2,
    prefsPerVolunteer: 10,
    preAssignedPercent: 10,
    preferenceCorrelation: 'avoid_morning',
    forbidBackToBack: false,
    description: 'Breakfast shifts are unpopular'
  },
  {
    name: 'forbid_backtoback',
    days: 9,
    volunteers: 50,
    eventShiftsPerDay: 3,
    capacityRatio: 1.3,
    prefsPerVolunteer: 10,
    preAssignedPercent: 10,
    preferenceCorrelation: 'random',
    forbidBackToBack: true,
    description: 'Back-to-back shifts strictly forbidden'
  },
  {
    name: 'impossible',
    days: 9,
    volunteers: 50,
    eventShiftsPerDay: 3,
    capacityRatio: 0.7,  // Way too little capacity
    prefsPerVolunteer: 10,
    preAssignedPercent: 10,
    preferenceCorrelation: 'random',
    forbidBackToBack: false,
    description: 'Deliberately unsolvable - tests error handling'
  }
];

// Calculate quality metrics from assignments
function calculateMetrics(
  assignments: Assignment[],
  shifts: Shift[],
  volunteers: Volunteer[],
  settings: Settings
): {
  minSat: number;
  maxSat: number;
  avgSat: number;
  stdDevSat: number;
  pctTop1: number;
  pctTop3: number;
  shiftsFilled: number;
  minPts: number;
  maxPts: number;
  avgPts: number;
} {
  const shiftById = new Map(shifts.map(s => [s.id, s]));
  const volByName = new Map(volunteers.map(v => [v.name, v]));

  // Group assignments by volunteer
  const volAssignments = new Map<string, string[]>();
  for (const a of assignments) {
    const list = volAssignments.get(a.volunteerName) || [];
    list.push(a.shiftId);
    volAssignments.set(a.volunteerName, list);
  }

  // Calculate per-volunteer metrics
  const satisfactionScores: number[] = [];
  const pointsAssigned: number[] = [];
  let gotTop1 = 0;
  let gotTop3 = 0;

  for (const vol of volunteers) {
    const assigned = volAssignments.get(vol.name) || [];
    let satisfaction = 0;
    let points = 0;
    let hasTop1 = false;
    let hasTop3 = false;

    for (const shiftId of assigned) {
      const shift = shiftById.get(shiftId);
      if (shift) points += shift.points;

      const rank = vol.preferences.get(shiftId) ?? Infinity;
      if (rank >= 1 && rank <= 5) {
        satisfaction += 6 - rank;
      }
      if (rank === 1) hasTop1 = true;
      if (rank <= 3) hasTop3 = true;
    }

    const avgSat = assigned.length > 0 ? satisfaction / assigned.length : 0;
    satisfactionScores.push(avgSat);
    pointsAssigned.push(points);

    if (hasTop1) gotTop1++;
    if (hasTop3) gotTop3++;
  }

  // Calculate shift fill percentage
  const shiftCounts = new Map<string, number>();
  for (const a of assignments) {
    shiftCounts.set(a.shiftId, (shiftCounts.get(a.shiftId) ?? 0) + 1);
  }
  let filledCount = 0;
  for (const shift of shifts) {
    if ((shiftCounts.get(shift.id) ?? 0) >= shift.capacity) {
      filledCount++;
    }
  }

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const stdDev = (arr: number[]) => {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / arr.length);
  };

  return {
    minSat: Math.min(...satisfactionScores),
    maxSat: Math.max(...satisfactionScores),
    avgSat: mean(satisfactionScores),
    stdDevSat: stdDev(satisfactionScores),
    pctTop1: (gotTop1 / volunteers.length) * 100,
    pctTop3: (gotTop3 / volunteers.length) * 100,
    shiftsFilled: (filledCount / shifts.length) * 100,
    minPts: Math.min(...pointsAssigned),
    maxPts: Math.max(...pointsAssigned),
    avgPts: mean(pointsAssigned)
  };
}

export async function runScenario(
  config: ScenarioConfig,
  runsPerScenario: number,
  onProgress?: (completed: number, total: number) => void
): Promise<{ results: TestResult[]; failures: FailedRun[] }> {
  const results: TestResult[] = [];
  const failures: FailedRun[] = [];

  for (let run = 0; run < runsPerScenario; run++) {
    const seed = run * 1000 + 42;  // Reproducible seeds

    try {
      const { shifts, volunteers, settings } = generateTestData(config, seed);
      const inputSummary = summarizeInput(shifts, volunteers, settings);

      const solverResult = await solveShiftAssignment({
        shifts,
        volunteers,
        settings
      });

      const success = solverResult.status === 'optimal' || solverResult.status === 'feasible';

      let metrics;
      if (success && solverResult.assignments.length > 0) {
        metrics = calculateMetrics(solverResult.assignments, shifts, volunteers, settings);
      }

      const testResult: TestResult = {
        scenario: config.name,
        runNumber: run + 1,
        seed,
        success,
        errorType: success ? undefined : solverResult.status,
        errorMessage: success ? undefined : solverResult.message,
        solveTimeMs: solverResult.solveTimeMs,
        binarySearchIterations: solverResult.binarySearchIterations,
        usedRelaxedConstraints: solverResult.usedRelaxedConstraints,
        numShifts: inputSummary.numShifts,
        numVolunteers: inputSummary.numVolunteers,
        totalCapacity: inputSummary.totalCapacity,
        totalPointsNeeded: inputSummary.totalPointsNeeded,
        ...(metrics && {
          minSatisfactionPerShift: metrics.minSat,
          maxSatisfactionPerShift: metrics.maxSat,
          avgSatisfactionPerShift: metrics.avgSat,
          stdDevSatisfaction: metrics.stdDevSat,
          pctGotTop1: metrics.pctTop1,
          pctGotTop3: metrics.pctTop3,
          shiftsFilledPct: metrics.shiftsFilled,
          minPointsAssigned: metrics.minPts,
          maxPointsAssigned: metrics.maxPts,
          avgPointsAssigned: metrics.avgPts
        })
      };

      results.push(testResult);

      if (!success) {
        failures.push({
          scenario: config.name,
          runNumber: run + 1,
          seed,
          errorType: solverResult.status,
          errorMessage: solverResult.message || 'Unknown error',
          inputSummary
        });
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      results.push({
        scenario: config.name,
        runNumber: run + 1,
        seed,
        success: false,
        errorType: 'exception',
        errorMessage: errorMsg,
        solveTimeMs: 0,
        numShifts: 0,
        numVolunteers: 0,
        totalCapacity: 0,
        totalPointsNeeded: 0
      });

      failures.push({
        scenario: config.name,
        runNumber: run + 1,
        seed,
        errorType: 'exception',
        errorMessage: errorMsg,
        inputSummary: {
          numShifts: 0,
          numVolunteers: 0,
          totalCapacity: 0,
          totalPointsNeeded: 0,
          avgPrefsPerVolunteer: 0
        }
      });
    }

    if (onProgress) {
      onProgress(run + 1, runsPerScenario);
    }
  }

  return { results, failures };
}

export async function runAllScenarios(
  runsPerScenario: number,
  onScenarioComplete?: (scenario: string, completed: number, total: number) => void
): Promise<{ allResults: TestResult[]; allFailures: FailedRun[] }> {
  const allResults: TestResult[] = [];
  const allFailures: FailedRun[] = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const config = SCENARIOS[i];
    console.log(`\nRunning scenario: ${config.name} (${config.description})`);

    const { results, failures } = await runScenario(
      config,
      runsPerScenario,
      (completed, total) => {
        if (completed % 10 === 0 || completed === total) {
          process.stdout.write(`\r  Progress: ${completed}/${total} runs`);
        }
      }
    );

    allResults.push(...results);
    allFailures.push(...failures);

    const successCount = results.filter(r => r.success).length;
    console.log(`\n  Complete: ${successCount}/${results.length} successful`);

    if (onScenarioComplete) {
      onScenarioComplete(config.name, i + 1, SCENARIOS.length);
    }
  }

  return { allResults, allFailures };
}
