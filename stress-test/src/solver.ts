import highsLoader from 'highs';
import { Shift, Volunteer, Settings, SolverResult, Assignment } from './types';

// Load a fresh HiGHS instance each time to avoid memory accumulation
async function loadHighs(): Promise<any> {
  return await highsLoader();
}

// Seeded random for tie-breaking
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

// Check if two shifts overlap
function shiftsOverlap(s1: Shift, s2: Shift): boolean {
  if (s1.date !== s2.date) return false;
  return s1.startTime < s2.endTime && s2.startTime < s1.endTime;
}

// Check if two shifts are sequential
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

interface ExtendedSolverResult extends SolverResult {
  solveTimeMs: number;
  binarySearchIterations: number;
  usedRelaxedConstraints?: string;
}

export async function solveShiftAssignment(input: SolverInput): Promise<ExtendedSolverResult> {
  const startTime = Date.now();
  const { shifts, volunteers, settings, onProgress } = input;
  const log = onProgress || (() => {});

  const rand = new SeededRandom(settings.seed);
  const shiftIds = shifts.map(s => s.id);
  const volunteerNames = volunteers.map(v => v.name);

  // Build lookup maps
  const shiftById = new Map(shifts.map(s => [s.id, s]));
  const volByName = new Map(volunteers.map(v => [v.name, v]));

  // Compute volunteer min/max points
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

  function getRank(volName: string, shiftId: string): number {
    const vol = volByName.get(volName);
    if (!vol) return Infinity;
    return vol.preferences.get(shiftId) ?? Infinity;
  }

  function getSatisfactionWeight(rank: number): number {
    if (rank >= 1 && rank <= 5) return 6 - rank;
    return 0;
  }

  const highs = await loadHighs();
  let binarySearchIterations = 0;

  // Egalitarian solver with average satisfaction
  async function runEgalitarianSolver(): Promise<ExtendedSolverResult> {
    log('Using average satisfaction optimization...');

    let low = 0;
    let high = 5;
    let bestResult: ExtendedSolverResult | null = null;
    let bestAvg = 0;
    const tolerance = 0.1;

    while (high - low > tolerance) {
      binarySearchIterations++;
      const targetAvg = (low + high) / 2;

      const result = await tryWithTargetAverage(targetAvg);

      if (result.status === 'optimal' || result.status === 'feasible') {
        bestResult = result;
        bestAvg = targetAvg;
        low = targetAvg;
      } else {
        high = targetAvg;
      }
    }

    if (bestResult) {
      bestResult.message = `Min avg satisfaction: ${bestAvg.toFixed(2)}/shift`;
      bestResult.binarySearchIterations = binarySearchIterations;
      return bestResult;
    }

    return {
      status: 'infeasible',
      phase: 1,
      assignments: [],
      message: 'No feasible solution found',
      solveTimeMs: Date.now() - startTime,
      binarySearchIterations
    };
  }

  async function tryWithTargetAverage(targetAvg: number): Promise<ExtendedSolverResult> {
    const SCALE = 10;
    const guaranteeLevel = settings.guaranteeLevel || 5;

    const varIndex = new Map<string, number>();
    let varCount = 0;
    for (const vName of volunteerNames) {
      for (const sId of shiftIds) {
        varIndex.set(`${vName}|${sId}`, varCount++);
      }
    }

    const seqVarIndex = new Map<string, number>();
    if (!settings.forbidBackToBack) {
      for (const vName of volunteerNames) {
        for (const [s1, s2] of sequentialPairs) {
          seqVarIndex.set(`seq|${vName}|${s1}|${s2}`, varCount++);
        }
      }
    }

    const numVars = varCount;
    const colCost: number[] = new Array(numVars).fill(0);

    for (const vName of volunteerNames) {
      for (const sId of shiftIds) {
        const idx = varIndex.get(`${vName}|${sId}`)!;
        const weight = getSatisfactionWeight(getRank(vName, sId));
        colCost[idx] = -weight;
      }
    }

    const penaltyWeight = 100000;
    if (!settings.forbidBackToBack) {
      for (const vName of volunteerNames) {
        for (const [s1, s2] of sequentialPairs) {
          const idx = seqVarIndex.get(`seq|${vName}|${s1}|${s2}`)!;
          colCost[idx] = penaltyWeight;
        }
      }
    }

    const constraints: { row: number[], val: number[], lower: number, upper: number }[] = [];

    // Shift capacity constraints
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

    // Volunteer constraints
    for (const vName of volunteerNames) {
      const minPtsScaled = Math.floor(volMinPoints.get(vName)! * SCALE);
      const maxPtsScaled = Math.ceil(volMaxPoints.get(vName)! * SCALE);

      const minRow: number[] = [];
      const minVal: number[] = [];
      for (const sId of shiftIds) {
        const idx = varIndex.get(`${vName}|${sId}`)!;
        const pts = Math.round(shiftById.get(sId)!.points * SCALE);
        minRow.push(idx);
        minVal.push(pts);
      }
      constraints.push({ row: minRow, val: minVal, lower: minPtsScaled, upper: Infinity });
      constraints.push({ row: [...minRow], val: [...minVal], lower: -Infinity, upper: maxPtsScaled });

      const maxShiftRow: number[] = [];
      const maxShiftVal: number[] = [];
      for (const sId of shiftIds) {
        maxShiftRow.push(varIndex.get(`${vName}|${sId}`)!);
        maxShiftVal.push(1);
      }
      constraints.push({ row: maxShiftRow, val: maxShiftVal, lower: 0, upper: settings.maxShifts });

      // Guarantee constraint
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
          constraints.push({ row: eligibleRow, val: eligibleVal, lower: 1, upper: Infinity });
        }
      } else {
        constraints.push({ row: [...maxShiftRow], val: [...maxShiftVal], lower: 1, upper: Infinity });
      }

      // No overlapping
      for (const [s1, s2] of overlappingPairs) {
        const idx1 = varIndex.get(`${vName}|${s1}`)!;
        const idx2 = varIndex.get(`${vName}|${s2}`)!;
        constraints.push({ row: [idx1, idx2], val: [1, 1], lower: 0, upper: 1 });
      }

      // Back-to-back
      if (settings.forbidBackToBack) {
        for (const [s1, s2] of sequentialPairs) {
          const idx1 = varIndex.get(`${vName}|${s1}`)!;
          const idx2 = varIndex.get(`${vName}|${s2}`)!;
          constraints.push({ row: [idx1, idx2], val: [1, 1], lower: 0, upper: 1 });
        }
      }

      // Average satisfaction constraint
      const avgRow: number[] = [];
      const avgVal: number[] = [];
      for (const sId of shiftIds) {
        const idx = varIndex.get(`${vName}|${sId}`)!;
        const weight = getSatisfactionWeight(getRank(vName, sId));
        avgRow.push(idx);
        avgVal.push(weight - targetAvg);
      }
      constraints.push({ row: avgRow, val: avgVal, lower: 0, upper: Infinity });
    }

    // Sequential penalty constraints
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

    // Build LP problem string
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

    const binaryVars: string[] = [];
    for (const vName of volunteerNames) {
      for (const sId of shiftIds) {
        const idx = varIndex.get(`${vName}|${sId}`)!;
        binaryVars.push(`x${idx}`);
      }
    }

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
          message: `Target avg ${targetAvg.toFixed(2)}`,
          solveTimeMs: Date.now() - startTime,
          binarySearchIterations
        };
      } else {
        return {
          status: 'infeasible',
          phase: 1,
          assignments: [],
          message: `Status: ${result.Status}`,
          solveTimeMs: Date.now() - startTime,
          binarySearchIterations
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('Aborted')) {
        return {
          status: 'infeasible',
          phase: 1,
          assignments: [],
          message: 'Infeasible (solver aborted)',
          solveTimeMs: Date.now() - startTime,
          binarySearchIterations
        };
      }
      throw error;
    }
  }

  // Hard fill phase with progressive relaxation
  async function runHardFillPhase(existingAssignments: Assignment[]): Promise<ExtendedSolverResult> {
    log('Running hard-fill phase...');

    const relaxationLevels = [
      { name: 'full', minPointsMultiplier: 1.0, maxShiftsMultiplier: 1.0 },
      { name: 'relaxed-points', minPointsMultiplier: 0.5, maxShiftsMultiplier: 1.5 },
      { name: 'minimal', minPointsMultiplier: 0, maxShiftsMultiplier: 2.0 },
    ];

    for (const level of relaxationLevels) {
      const result = await tryHardFill(level.minPointsMultiplier, level.maxShiftsMultiplier);
      if (result.status === 'optimal' || result.status === 'feasible') {
        if (level.name !== 'full') {
          result.usedRelaxedConstraints = level.name;
        }
        return result;
      }
    }

    return {
      status: 'infeasible',
      phase: 2,
      assignments: existingAssignments,
      message: settings.forbidBackToBack
        ? 'Unable to fill all shifts (forbid back-to-back may be too strict)'
        : 'Unable to fill all shifts',
      solveTimeMs: Date.now() - startTime,
      binarySearchIterations
    };
  }

  async function tryHardFill(minPointsMultiplier: number, maxShiftsMultiplier: number): Promise<ExtendedSolverResult> {
    const SCALE = 10;

    const varIndex = new Map<string, number>();
    let varCount = 0;
    for (const vName of volunteerNames) {
      for (const sId of shiftIds) {
        varIndex.set(`${vName}|${sId}`, varCount++);
      }
    }

    const numVars = varCount;
    const colCost: number[] = new Array(numVars).fill(0);

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

    // Exact capacity fill
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

    // Volunteer constraints with relaxation
    for (const vName of volunteerNames) {
      const baseMinPts = volMinPoints.get(vName)! * minPointsMultiplier;
      const minPtsScaled = Math.floor(baseMinPts * SCALE);
      const maxPtsScaled = Math.ceil(volMaxPoints.get(vName)! * SCALE * 1.5);

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
      constraints.push({ row: [...maxShiftRow], val: [...maxShiftVal], lower: 1, upper: Infinity });

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
          message: `Hard-fill succeeded`,
          solveTimeMs: Date.now() - startTime,
          binarySearchIterations
        };
      } else {
        return {
          status: 'infeasible',
          phase: 2,
          assignments: [],
          message: `Status: ${result.Status}`,
          solveTimeMs: Date.now() - startTime,
          binarySearchIterations
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('Aborted')) {
        return {
          status: 'infeasible',
          phase: 2,
          assignments: [],
          message: 'Infeasible',
          solveTimeMs: Date.now() - startTime,
          binarySearchIterations
        };
      }
      throw error;
    }
  }

  // Main optimization flow
  const result = await runEgalitarianSolver();

  if (result.status === 'optimal' || result.status === 'feasible') {
    // Check if all shifts are filled
    const assignmentCounts = new Map<string, number>();
    for (const a of result.assignments) {
      assignmentCounts.set(a.shiftId, (assignmentCounts.get(a.shiftId) ?? 0) + 1);
    }

    let allFilled = true;
    for (const shift of shifts) {
      const assigned = assignmentCounts.get(shift.id) ?? 0;
      if (assigned < shift.capacity) {
        allFilled = false;
        break;
      }
    }

    if (allFilled) {
      return result;
    } else {
      log('Some shifts underfilled, running hard-fill phase...');
      return await runHardFillPhase(result.assignments);
    }
  } else {
    log('Egalitarian failed, trying hard-fill...');
    return await runHardFillPhase([]);
  }
}
