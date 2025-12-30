import type { Shift, Volunteer, Settings, SolverResult, Assignment } from '../../types';

// HiGHS solver interface
interface HighsSolver {
  solve: (problem: string) => {
    Status: string;
    Columns: Record<string, { Primal?: number }>;
  };
}

const CDN_BASE = 'https://lovasoa.github.io/highs-js';
let cachedHighs: HighsSolver | null = null;
let loadingPromise: Promise<HighsSolver> | null = null;

// Load HiGHS from CDN - cache the instance
async function loadHighs(): Promise<HighsSolver> {
  if (cachedHighs) return cachedHighs;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    // Load the script
    await new Promise<void>((resolve, reject) => {
      if ((window as unknown as Record<string, unknown>).Module) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = `${CDN_BASE}/highs.js`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load HiGHS from CDN'));
      document.head.appendChild(script);
    });

    // Initialize the solver
    const Module = (window as unknown as Record<string, unknown>).Module as
      (opts: { locateFile: (f: string) => string }) => Promise<HighsSolver>;

    if (typeof Module !== 'function') {
      throw new Error('HiGHS Module not found');
    }

    const solver = await Module({
      locateFile: (file: string) => `${CDN_BASE}/${file}`
    });

    cachedHighs = solver;
    return solver;
  })();

  return loadingPromise;
}

// Random number generator with seed
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  randInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

// Check if two shifts overlap in time
function shiftsOverlap(s1: Shift, s2: Shift): boolean {
  // Must be same day (compare date strings)
  if (s1.date !== s2.date) return false;
  // Overlap if s1 starts before s2 ends AND s2 starts before s1 ends
  return s1.startTime < s2.endTime && s2.startTime < s1.endTime;
}

// Check if two shifts are sequential (s2 starts within gapHours after s1 ends)
function shiftsSequential(s1: Shift, s2: Shift, gapHours: number): boolean {
  if (s1.date !== s2.date) return false;
  const gapMs = gapHours * 60 * 60 * 1000;
  const gap = s2.startTime.getTime() - s1.endTime.getTime();
  return gap >= 0 && gap <= gapMs;
}

interface SolverInput {
  shifts: Shift[];
  volunteers: Volunteer[];
  settings: Settings;
  onProgress?: (message: string) => void;
}

export async function solveShiftAssignment(input: SolverInput): Promise<SolverResult> {
  const { shifts, volunteers, settings, onProgress } = input;
  const log = onProgress || console.log;

  const rand = new SeededRandom(settings.seed);
  const shiftIds = shifts.map(s => s.id);
  const volunteerNames = volunteers.map(v => v.name);

  // Build lookup maps
  const shiftById = new Map(shifts.map(s => [s.id, s]));
  const volByName = new Map(volunteers.map(v => [v.name, v]));

  // Compute volunteer min/max points
  // Effective minPoints = global minPoints - preAssignedPoints (but not below 0)
  const volMinPoints = new Map<string, number>();
  const volMaxPoints = new Map<string, number>();
  for (const v of volunteers) {
    const effectiveMin = Math.max(0, settings.minPoints - v.preAssignedPoints);
    volMinPoints.set(v.name, effectiveMin);
    volMaxPoints.set(v.name, effectiveMin + settings.maxOver);
  }

  // Find overlapping and sequential shift pairs
  const overlappingPairs: [string, string][] = [];
  const sequentialPairs: [string, string][] = [];

  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      if (shiftsOverlap(shifts[i], shifts[j])) {
        overlappingPairs.push([shifts[i].id, shifts[j].id]);
      }
    }
    for (let j = 0; j < shifts.length; j++) {
      if (i !== j && shiftsSequential(shifts[i], shifts[j], settings.backToBackGap)) {
        sequentialPairs.push([shifts[i].id, shifts[j].id]);
      }
    }
  }

  log(`Found ${overlappingPairs.length} overlapping shift pairs`);
  log(`Found ${sequentialPairs.length} sequential shift pairs`);
  log(`Guarantee level: ${settings.guaranteeLevel > 0 ? `Top ${settings.guaranteeLevel}` : 'None (at least 1 shift)'}`);

  // Get preference rank (infinity if not ranked)
  function getRank(volName: string, shiftId: string): number {
    const vol = volByName.get(volName);
    if (!vol) return Infinity;
    return vol.preferences.get(shiftId) ?? Infinity;
  }

  // Satisfaction score for a volunteer: sum of (6 - rank) for each assigned shift
  // Rank 1 = 5 points, Rank 2 = 4 points, ..., Rank 5 = 1 point, unranked = 0
  function getSatisfactionWeight(rank: number): number {
    if (rank >= 1 && rank <= 5) return 6 - rank;
    return 0;
  }

  // Initialize HiGHS solver
  const highs = await loadHighs();

  // ========== MAIN OPTIMIZATION ==========
  log('Running egalitarian optimization with guarantee constraints...');

  const result = await runEgalitarianSolver();

  if (result.status === 'optimal' || result.status === 'feasible') {
    // Check if all shifts are fully staffed
    const assignmentCounts = new Map<string, number>();
    for (const a of result.assignments) {
      assignmentCounts.set(a.shiftId, (assignmentCounts.get(a.shiftId) ?? 0) + 1);
    }

    let allFilled = true;
    for (const shift of shifts) {
      const assigned = assignmentCounts.get(shift.id) ?? 0;
      if (assigned < shift.capacity) {
        allFilled = false;
        log(`Shift ${shift.id} underfilled: ${assigned}/${shift.capacity}`);
      }
    }

    if (allFilled) {
      log('All shifts fully staffed!');
      return result;
    } else {
      log('Some shifts underfilled, running hard-fill phase...');
      return await runHardFillPhase(result.assignments);
    }
  } else {
    log('Egalitarian optimization failed, trying hard-fill approach...');
    return await runHardFillPhase([]);
  }

  // ========== Egalitarian Solver with Average Satisfaction ==========
  // Uses binary search to find the maximum achievable minimum AVERAGE satisfaction per shift
  // This ensures proportional fairness: volunteers with fewer shifts get similar quality
  async function runEgalitarianSolver(): Promise<SolverResult> {
    log('Using average satisfaction optimization for proportional fairness...');

    // Binary search for maximum achievable minimum average satisfaction
    // Range: 0 to 5 (max possible avg if all rank 1)
    let low = 0;
    let high = 5;
    let bestResult: SolverResult | null = null;
    let bestAvg = 0;
    const tolerance = 0.1;

    while (high - low > tolerance) {
      const targetAvg = (low + high) / 2;
      log(`Trying target average satisfaction: ${targetAvg.toFixed(2)}`);

      const result = await tryWithTargetAverage(targetAvg);

      if (result.status === 'optimal' || result.status === 'feasible') {
        // Feasible at this target, try higher
        bestResult = result;
        bestAvg = targetAvg;
        low = targetAvg;
      } else {
        // Infeasible, try lower
        high = targetAvg;
      }
    }

    if (bestResult) {
      log(`Achieved minimum average satisfaction: ${bestAvg.toFixed(2)} per shift`);
      bestResult.message = `Optimization succeeded. Min avg satisfaction: ${bestAvg.toFixed(2)}/shift`;
      return bestResult;
    }

    // No feasible solution found even at avg=0, return error
    return {
      status: 'infeasible',
      phase: 1,
      assignments: [],
      message: 'Unable to find any feasible solution with the given constraints.'
    };
  }

  // Try to solve with a target minimum average satisfaction
  async function tryWithTargetAverage(targetAvg: number): Promise<SolverResult> {
    const SCALE = 10;
    // Use the actual guarantee level - 0 means "no guarantee" (just require at least 1 shift)
    const guaranteeLevel = settings.guaranteeLevel;

    // Build variable indices: x[v,s] = 1 if volunteer v assigned to shift s
    const varIndex = new Map<string, number>();
    let varCount = 0;
    for (const vName of volunteerNames) {
      for (const sId of shiftIds) {
        varIndex.set(`${vName}|${sId}`, varCount++);
      }
    }

    // Sequential penalty variables (for soft constraints when not forbidden)
    const seqVarIndex = new Map<string, number>();
    if (!settings.forbidBackToBack) {
      for (const vName of volunteerNames) {
        for (const [s1, s2] of sequentialPairs) {
          seqVarIndex.set(`seq|${vName}|${s1}|${s2}`, varCount++);
        }
      }
    }

    const numVars = varCount;

    // Build LP - objective is to maximize total satisfaction (as tiebreaker)
    const colCost: number[] = new Array(numVars).fill(0);

    // Maximize total satisfaction
    for (const vName of volunteerNames) {
      for (const sId of shiftIds) {
        const idx = varIndex.get(`${vName}|${sId}`)!;
        const weight = getSatisfactionWeight(getRank(vName, sId));
        colCost[idx] = -weight;  // Negative because HiGHS minimizes
      }
    }

    // Penalty for sequential shifts (if not forbidden)
    const penaltyWeight = 100000;
    if (!settings.forbidBackToBack) {
      for (const vName of volunteerNames) {
        for (const [s1, s2] of sequentialPairs) {
          const idx = seqVarIndex.get(`seq|${vName}|${s1}|${s2}`)!;
          colCost[idx] = penaltyWeight;
        }
      }
    }

    // Build constraints
    const constraints: { row: number[], val: number[], lower: number, upper: number }[] = [];

    // 1. Shift capacity constraints (soft - <= capacity)
    for (const shift of shifts) {
      const row: number[] = [];
      const val: number[] = [];
      for (const vName of volunteerNames) {
        const idx = varIndex.get(`${vName}|${shift.id}`)!;
        row.push(idx);
        val.push(1);
      }
      constraints.push({ row, val, lower: 0, upper: shift.capacity });
    }

    // 2. Volunteer constraints
    for (const vName of volunteerNames) {
      const minPtsScaled = Math.floor(volMinPoints.get(vName)! * SCALE);
      const maxPtsScaled = Math.ceil(volMaxPoints.get(vName)! * SCALE);

      // 2a. Min points constraint
      const minRow: number[] = [];
      const minVal: number[] = [];
      for (const sId of shiftIds) {
        const idx = varIndex.get(`${vName}|${sId}`)!;
        const pts = Math.round(shiftById.get(sId)!.points * SCALE);
        minRow.push(idx);
        minVal.push(pts);
      }
      constraints.push({ row: minRow, val: minVal, lower: minPtsScaled, upper: Infinity });

      // 2b. Max points constraint
      constraints.push({ row: [...minRow], val: [...minVal], lower: -Infinity, upper: maxPtsScaled });

      // 2c. Max shifts constraint
      const maxShiftRow: number[] = [];
      const maxShiftVal: number[] = [];
      for (const sId of shiftIds) {
        maxShiftRow.push(varIndex.get(`${vName}|${sId}`)!);
        maxShiftVal.push(1);
      }
      constraints.push({ row: maxShiftRow, val: maxShiftVal, lower: 0, upper: settings.maxShifts });

      // 2d. GUARANTEE: At least one from top-N preferences
      if (guaranteeLevel > 0) {
        const eligibleRow: number[] = [];
        const eligibleVal: number[] = [];
        for (const sId of shiftIds) {
          if (getRank(vName, sId) <= guaranteeLevel) {
            eligibleRow.push(varIndex.get(`${vName}|${sId}`)!);
            eligibleVal.push(1);
          }
        }
        if (eligibleRow.length > 0) {
          // Must get at least 1 shift from top-N preferences
          constraints.push({ row: eligibleRow, val: eligibleVal, lower: 1, upper: Infinity });
        } else {
          // Volunteer has no top-N preferences - still require at least 1 shift
          constraints.push({ row: [...maxShiftRow], val: [...maxShiftVal], lower: 1, upper: Infinity });
        }
      } else {
        // No guarantee level - just ensure at least one shift
        constraints.push({ row: [...maxShiftRow], val: [...maxShiftVal], lower: 1, upper: Infinity });
      }

      // 2e. No overlapping shifts
      for (const [s1, s2] of overlappingPairs) {
        const idx1 = varIndex.get(`${vName}|${s1}`)!;
        const idx2 = varIndex.get(`${vName}|${s2}`)!;
        constraints.push({ row: [idx1, idx2], val: [1, 1], lower: 0, upper: 1 });
      }

      // 2f. Sequential shift constraints
      if (settings.forbidBackToBack) {
        for (const [s1, s2] of sequentialPairs) {
          const idx1 = varIndex.get(`${vName}|${s1}`)!;
          const idx2 = varIndex.get(`${vName}|${s2}`)!;
          constraints.push({ row: [idx1, idx2], val: [1, 1], lower: 0, upper: 1 });
        }
      }

      // 2g. AVERAGE SATISFACTION CONSTRAINT
      // For avg satisfaction >= targetAvg:
      // sum(weight * x) >= targetAvg * sum(x)
      // sum(weight * x) - targetAvg * sum(x) >= 0
      // sum((weight - targetAvg) * x) >= 0
      const avgRow: number[] = [];
      const avgVal: number[] = [];
      for (const sId of shiftIds) {
        const idx = varIndex.get(`${vName}|${sId}`)!;
        const weight = getSatisfactionWeight(getRank(vName, sId));
        const adjustedWeight = weight - targetAvg;
        avgRow.push(idx);
        avgVal.push(adjustedWeight);
      }
      constraints.push({ row: avgRow, val: avgVal, lower: 0, upper: Infinity });
    }

    // 3. Sequential shift penalty constraints (only when using soft penalties)
    if (!settings.forbidBackToBack) {
      for (const vName of volunteerNames) {
        for (const [s1, s2] of sequentialPairs) {
          const xIdx1 = varIndex.get(`${vName}|${s1}`)!;
          const xIdx2 = varIndex.get(`${vName}|${s2}`)!;
          const seqIdx = seqVarIndex.get(`seq|${vName}|${s1}|${s2}`)!;
          constraints.push({
            row: [xIdx1, xIdx2, seqIdx],
            val: [1, 1, -1],
            lower: -Infinity,
            upper: 1
          });
        }
      }
    }

    // Convert to LP format
    const lpConstraints: string[] = [];
    let constraintNum = 0;

    for (const c of constraints) {
      const terms = c.row.map((idx, j) => `${c.val[j] >= 0 ? '+' : ''}${c.val[j]} x${idx}`).join(' ');

      if (c.lower !== -Infinity && c.upper !== Infinity && c.lower === c.upper) {
        lpConstraints.push(`c${constraintNum++}: ${terms} = ${c.lower}`);
      } else {
        if (c.lower !== -Infinity) {
          lpConstraints.push(`c${constraintNum++}: ${terms} >= ${c.lower}`);
        }
        if (c.upper !== Infinity) {
          lpConstraints.push(`c${constraintNum++}: ${terms} <= ${c.upper}`);
        }
      }
    }

    // All assignment variables are binary
    const binaryVars: string[] = [];
    for (const vName of volunteerNames) {
      for (const sId of shiftIds) {
        const idx = varIndex.get(`${vName}|${sId}`)!;
        binaryVars.push(`x${idx}`);
      }
    }

    // Sequential penalty variables are binary
    if (!settings.forbidBackToBack) {
      for (const vName of volunteerNames) {
        for (const [s1, s2] of sequentialPairs) {
          const idx = seqVarIndex.get(`seq|${vName}|${s1}|${s2}`)!;
          binaryVars.push(`x${idx}`);
        }
      }
    }

    const problem = `
Minimize
obj: ${colCost.map((c, i) => `${c >= 0 ? '+' : ''}${c} x${i}`).join(' ')}
Subject To
${lpConstraints.join('\n')}
Binary
${binaryVars.join(' ')}
End
`;

    try {
      const result = highs.solve(problem);
      console.log(`HiGHS result status: ${result.Status}`);

      if (result.Status === 'Optimal' || result.Status === 'Time limit reached') {
        const assignments: Assignment[] = [];

        for (const vName of volunteerNames) {
          for (const sId of shiftIds) {
            const idx = varIndex.get(`${vName}|${sId}`)!;
            const varName = `x${idx}`;
            const value = result.Columns[varName]?.Primal ?? 0;
            if (value > 0.5) {
              assignments.push({ volunteerName: vName, shiftId: sId });
            }
          }
        }

        return {
          status: result.Status === 'Optimal' ? 'optimal' : 'feasible',
          phase: 1,
          assignments,
          message: `Found solution with target avg ${targetAvg.toFixed(2)}`
        };
      } else {
        return {
          status: 'infeasible',
          phase: 1,
          assignments: [],
          message: `Infeasible at target avg ${targetAvg.toFixed(2)}`
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // HiGHS WASM can crash with various errors when problem is infeasible or solver fails
      console.error('HiGHS solve error:', errorMsg);
      if (errorMsg.includes('Aborted') || errorMsg.includes('table index') || errorMsg.includes('out of bounds')) {
        return {
          status: 'infeasible',
          phase: 1,
          assignments: [],
          message: `Infeasible at target avg ${targetAvg.toFixed(2)}`
        };
      }
      // Don't silently swallow signature mismatch - let it throw so we can debug
      if (errorMsg.includes('signature mismatch')) {
        throw new Error(`HiGHS WASM error: ${errorMsg}. This may be a browser compatibility issue.`);
      }

      // Re-throw unexpected errors
      throw error;
    }
  }

  // ========== Hard Fill Phase (for unfilled shifts) ==========
  async function runHardFillPhase(existingAssignments: Assignment[]): Promise<SolverResult> {
    log('Running hard-fill phase to ensure all shifts are staffed...');

    // Define relaxation levels - only used if allowRelaxation is true
    const relaxationLevels: Array<{
      name: 'full' | 'relaxed-points' | 'minimal';
      minPointsMultiplier: number;
      maxShiftsMultiplier: number;
      maxPointsMultiplier: number;  // Added to control max points too
    }> = settings.allowRelaxation ? [
      { name: 'full', minPointsMultiplier: 1.0, maxShiftsMultiplier: 1.0, maxPointsMultiplier: 1.0 },
      { name: 'relaxed-points', minPointsMultiplier: 0.5, maxShiftsMultiplier: 1.5, maxPointsMultiplier: 1.5 },
      { name: 'minimal', minPointsMultiplier: 0, maxShiftsMultiplier: 2.0, maxPointsMultiplier: 2.0 },
    ] : [
      // Only try full constraints if relaxation is disabled
      { name: 'full', minPointsMultiplier: 1.0, maxShiftsMultiplier: 1.0, maxPointsMultiplier: 1.0 },
    ];

    for (const level of relaxationLevels) {
      const result = await tryHardFill(level.minPointsMultiplier, level.maxShiftsMultiplier, level.maxPointsMultiplier);
      if (result.status === 'optimal' || result.status === 'feasible') {
        if (level.name !== 'full') {
          result.message += ` (used ${level.name} constraints)`;
          // Add relaxation details so the UI can show warnings
          result.relaxation = {
            level: level.name,
            minPointsMultiplier: level.minPointsMultiplier,
            maxShiftsMultiplier: level.maxShiftsMultiplier,
            originalMinPoints: settings.minPoints,
            originalMaxShifts: settings.maxShifts
          };
        }
        return result;
      }
      log(`Hard-fill with ${level.name} constraints failed, trying next level...`);
    }

    // All attempts failed
    if (settings.forbidBackToBack) {
      return {
        status: 'infeasible',
        phase: 2,
        assignments: existingAssignments,
        message: `Unable to fill all shifts with "Forbid back-to-back" enabled. The shift schedule may require some volunteers to work consecutive shifts. Try using "Minimize" instead.`
      };
    }
    return {
      status: 'infeasible',
      phase: 2,
      assignments: existingAssignments,
      message: `Unable to fill all shifts. There may not be enough volunteers to cover all shift capacity, or too many overlapping shifts create scheduling conflicts.`
    };
  }

  async function tryHardFill(minPointsMultiplier: number, maxShiftsMultiplier: number, maxPointsMultiplier: number): Promise<SolverResult> {
    const SCALE = 10;

    // Build variable indices
    const varIndex = new Map<string, number>();
    let varCount = 0;
    for (const vName of volunteerNames) {
      for (const sId of shiftIds) {
        varIndex.set(`${vName}|${sId}`, varCount++);
      }
    }

    const numVars = varCount;
    const colCost: number[] = new Array(numVars).fill(0);

    // Objective: maximize preference satisfaction
    for (const vName of volunteerNames) {
      for (const sId of shiftIds) {
        const idx = varIndex.get(`${vName}|${sId}`)!;
        const rank = getRank(vName, sId);
        let weight = 1;
        if (rank === 1) weight = 500;
        else if (rank === 2) weight = 300;
        else if (rank === 3) weight = 200;
        else if (rank === 4) weight = 100;
        else if (rank === 5) weight = 50;
        weight += rand.randInt(0, 9);
        colCost[idx] = -weight;
      }
    }

    const constraints: { row: number[], val: number[], lower: number, upper: number }[] = [];

    // 1. Shift capacity constraints - HARD (== capacity)
    for (const shift of shifts) {
      const row: number[] = [];
      const val: number[] = [];
      for (const vName of volunteerNames) {
        const idx = varIndex.get(`${vName}|${shift.id}`)!;
        row.push(idx);
        val.push(1);
      }
      constraints.push({ row, val, lower: shift.capacity, upper: shift.capacity });
    }

    // 2. Volunteer constraints
    for (const vName of volunteerNames) {
      // Apply relaxation multipliers
      const baseMinPts = volMinPoints.get(vName)! * minPointsMultiplier;
      const minPtsScaled = Math.floor(baseMinPts * SCALE);
      // Max points now respects the multiplier instead of always being 1.5x
      const maxPtsScaled = Math.ceil(volMaxPoints.get(vName)! * SCALE * maxPointsMultiplier);

      const minRow: number[] = [];
      const minVal: number[] = [];
      for (const sId of shiftIds) {
        const idx = varIndex.get(`${vName}|${sId}`)!;
        const pts = Math.round(shiftById.get(sId)!.points * SCALE);
        minRow.push(idx);
        minVal.push(pts);
      }
      if (minPtsScaled > 0) {
        constraints.push({ row: minRow, val: minVal, lower: minPtsScaled, upper: Infinity });
      }
      constraints.push({ row: [...minRow], val: [...minVal], lower: -Infinity, upper: maxPtsScaled });

      const maxShiftRow: number[] = [];
      const maxShiftVal: number[] = [];
      for (const sId of shiftIds) {
        maxShiftRow.push(varIndex.get(`${vName}|${sId}`)!);
        maxShiftVal.push(1);
      }
      const adjustedMaxShifts = Math.ceil(settings.maxShifts * maxShiftsMultiplier);
      constraints.push({ row: maxShiftRow, val: maxShiftVal, lower: 0, upper: adjustedMaxShifts });

      // GUARANTEE: At least one from top-N preferences (or at least 1 shift if no guarantee)
      const guaranteeLevel = settings.guaranteeLevel || 0;
      if (guaranteeLevel > 0) {
        const eligibleRow: number[] = [];
        const eligibleVal: number[] = [];
        for (const sId of shiftIds) {
          if (getRank(vName, sId) <= guaranteeLevel) {
            eligibleRow.push(varIndex.get(`${vName}|${sId}`)!);
            eligibleVal.push(1);
          }
        }
        if (eligibleRow.length > 0) {
          // Must get at least 1 shift from top-N preferences
          constraints.push({ row: eligibleRow, val: eligibleVal, lower: 1, upper: Infinity });
        } else {
          // Volunteer has no top-N preferences, just require at least 1 shift
          constraints.push({ row: [...maxShiftRow], val: [...maxShiftVal], lower: 1, upper: Infinity });
        }
      } else {
        // No guarantee level - just ensure at least one shift
        constraints.push({ row: [...maxShiftRow], val: [...maxShiftVal], lower: 1, upper: Infinity });
      }

      // These are always hard constraints (physical impossibility)
      for (const [s1, s2] of overlappingPairs) {
        const idx1 = varIndex.get(`${vName}|${s1}`)!;
        const idx2 = varIndex.get(`${vName}|${s2}`)!;
        constraints.push({ row: [idx1, idx2], val: [1, 1], lower: 0, upper: 1 });
      }

      if (settings.forbidBackToBack) {
        for (const [s1, s2] of sequentialPairs) {
          const idx1 = varIndex.get(`${vName}|${s1}`)!;
          const idx2 = varIndex.get(`${vName}|${s2}`)!;
          constraints.push({ row: [idx1, idx2], val: [1, 1], lower: 0, upper: 1 });
        }
      }
    }

    const lpConstraints: string[] = [];
    let constraintNum = 0;

    for (const c of constraints) {
      const terms = c.row.map((idx, j) => `${c.val[j] >= 0 ? '+' : ''}${c.val[j]} x${idx}`).join(' ');

      if (c.lower !== -Infinity && c.upper !== Infinity && c.lower === c.upper) {
        lpConstraints.push(`c${constraintNum++}: ${terms} = ${c.lower}`);
      } else {
        if (c.lower !== -Infinity) {
          lpConstraints.push(`c${constraintNum++}: ${terms} >= ${c.lower}`);
        }
        if (c.upper !== Infinity) {
          lpConstraints.push(`c${constraintNum++}: ${terms} <= ${c.upper}`);
        }
      }
    }

    const problem = `
Minimize
obj: ${colCost.map((c, i) => `${c >= 0 ? '+' : ''}${c} x${i}`).join(' ')}
Subject To
${lpConstraints.join('\n')}
Binary
${Array.from({ length: numVars }, (_, i) => `x${i}`).join(' ')}
End
`;

    try {
      const result = highs.solve(problem);
      console.log(`HiGHS result status: ${result.Status}`);

      if (result.Status === 'Optimal' || result.Status === 'Time limit reached') {
        const assignments: Assignment[] = [];

        for (const vName of volunteerNames) {
          for (const sId of shiftIds) {
            const idx = varIndex.get(`${vName}|${sId}`)!;
            const varName = `x${idx}`;
            const value = result.Columns[varName]?.Primal ?? 0;
            if (value > 0.5) {
              assignments.push({ volunteerName: vName, shiftId: sId });
            }
          }
        }

        return {
          status: result.Status === 'Optimal' ? 'optimal' : 'feasible',
          phase: 2,
          assignments,
          message: `Hard-fill phase succeeded with ${assignments.length} assignments`
        };
      } else {
        return {
          status: 'infeasible',
          phase: 2,
          assignments: [],
          message: `Hard-fill phase returned status: ${result.Status}`
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // HiGHS WASM can crash with various errors when problem is infeasible or solver fails
      console.error('HiGHS Phase 2 solve error:', errorMsg);
      if (errorMsg.includes('Aborted') || errorMsg.includes('table index') || errorMsg.includes('out of bounds')) {
        return {
          status: 'infeasible',
          phase: 2,
          assignments: [],
          message: 'Infeasible at this relaxation level'
        };
      }
      if (errorMsg.includes('signature mismatch')) {
        throw new Error(`HiGHS WASM error: ${errorMsg}. This may be a browser compatibility issue.`);
      }
      throw error;  // Re-throw unexpected errors
    }
  }
}
