import type { Shift, Volunteer, Settings, SolverResult, Assignment } from '../../types';

// HiGHS solver interface
interface HighsSolver {
  solve: (problem: string) => {
    Status: string;
    Columns: Record<string, { Primal?: number }>;
  };
}

// Cache the loaded solver
let cachedHighs: HighsSolver | null = null;
let loadingPromise: Promise<HighsSolver> | null = null;

// Load HiGHS from CDN (browser-compatible approach)
async function loadHighs(): Promise<HighsSolver> {
  if (cachedHighs) return cachedHighs;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const CDN_BASE = 'https://lovasoa.github.io/highs-js';

    // Load the HiGHS script from CDN
    await new Promise<void>((resolve, reject) => {
      // Check if already loaded
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

    // The CDN script exports 'Module' (Emscripten pattern)
    const Module = (window as unknown as Record<string, unknown>).Module;
    if (typeof Module !== 'function') {
      throw new Error('HiGHS Module not found on window after script load');
    }

    // Initialize the solver with WASM location
    const solver = await (Module as (opts: { locateFile: (f: string) => string }) => Promise<HighsSolver>)({
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

// Check if two shifts are sequential (s2 starts within 2 hours after s1 ends)
function shiftsSequential(s1: Shift, s2: Shift): boolean {
  if (s1.date !== s2.date) return false;
  const twoHours = 2 * 60 * 60 * 1000;
  const gap = s2.startTime.getTime() - s1.endTime.getTime();
  return gap >= 0 && gap <= twoHours;
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
  const volMinPoints = new Map<string, number>();
  const volMaxPoints = new Map<string, number>();
  for (const v of volunteers) {
    const minPts = v.minPoints ?? settings.minPoints;
    volMinPoints.set(v.name, minPts);
    volMaxPoints.set(v.name, minPts + settings.maxOver);
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
      if (i !== j && shiftsSequential(shifts[i], shifts[j])) {
        sequentialPairs.push([shifts[i].id, shifts[j].id]);
      }
    }
  }

  log(`Found ${overlappingPairs.length} overlapping shift pairs`);
  log(`Found ${sequentialPairs.length} sequential shift pairs`);

  // Get preference rank (infinity if not ranked)
  function getRank(volName: string, shiftId: string): number {
    const vol = volByName.get(volName);
    if (!vol) return Infinity;
    return vol.preferences.get(shiftId) ?? Infinity;
  }

  // Initialize HiGHS solver
  const highs = await loadHighs();

  // ========== PHASE 1: Flexible Fill ==========
  log('Running Phase 1 (flexible fill, top 5 preferences only)...');

  const phase1Result = await runPhase(1);

  if (phase1Result.status === 'optimal' || phase1Result.status === 'feasible') {
    // Check if all shifts are fully staffed
    const assignmentCounts = new Map<string, number>();
    for (const a of phase1Result.assignments) {
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
      log('Phase 1 succeeded - all shifts fully staffed!');
      return phase1Result;
    } else {
      log('Phase 1 left some shifts underfilled, running Phase 2...');
    }
  } else {
    log('Phase 1 infeasible, running Phase 2...');
  }

  // ========== PHASE 2: Hard Fill ==========
  log('Running Phase 2 (hard fill, all preferences)...');

  const phase2Result = await runPhase(2);
  return phase2Result;

  // ========== Phase Runner ==========
  async function runPhase(phase: 1 | 2): Promise<SolverResult> {
    const SCALE = 10;  // Scale factor for fractional points
    const bestCut = phase === 1 ? 5 : Infinity;

    // Build variable indices: x[v,s] = 1 if volunteer v assigned to shift s
    const varIndex = new Map<string, number>();
    let varCount = 0;
    for (const vName of volunteerNames) {
      for (const sId of shiftIds) {
        varIndex.set(`${vName}|${sId}`, varCount++);
      }
    }

    // Sequential penalty variables (for soft constraints)
    const seqVarIndex = new Map<string, number>();
    for (const vName of volunteerNames) {
      for (const [s1, s2] of sequentialPairs) {
        seqVarIndex.set(`seq|${vName}|${s1}|${s2}`, varCount++);
      }
    }

    const numVars = varCount;

    // Build LP in column-major format for HiGHS
    // HiGHS uses: min c'x, s.t. L <= Ax <= U, l <= x <= u
    const colCost: number[] = new Array(numVars).fill(0);

    // Objective coefficients
    // Phase 1: maximize preferences (higher weight = better)
    // Phase 2: minimize (penalties - preferences)
    const penaltyWeight = phase === 1 ? 100000000 : 10000000;

    for (const vName of volunteerNames) {
      for (const sId of shiftIds) {
        const idx = varIndex.get(`${vName}|${sId}`)!;
        const rank = getRank(vName, sId);

        let weight = 0;
        if (phase === 1) {
          if (rank === 1) weight = 300;
          else if (rank === 2) weight = 200;
          else if (rank === 3) weight = 100;
          else if (rank >= 4 && rank <= bestCut) weight = 50;
          else continue;  // Skip unranked in Phase 1 objective
        } else {
          if (rank === 1) weight = 500;
          else if (rank === 2) weight = 300;
          else if (rank === 3) weight = 200;
          else if (rank === 4) weight = 100;
          else if (rank === 5) weight = 50;
          else weight = 1;
        }

        weight += rand.randInt(0, 9);  // Jitter to break ties
        colCost[idx] = -weight;  // Negative because we're minimizing
      }
    }

    // Sequential penalty variables - add to objective
    for (const vName of volunteerNames) {
      for (const [s1, s2] of sequentialPairs) {
        const idx = seqVarIndex.get(`seq|${vName}|${s1}|${s2}`)!;
        colCost[idx] = penaltyWeight;  // Penalty for sequential shifts
      }
    }

    // Build constraints
    const constraints: { row: number[], val: number[], lower: number, upper: number }[] = [];

    // 1. Shift capacity constraints
    for (const shift of shifts) {
      const row: number[] = [];
      const val: number[] = [];
      for (const vName of volunteerNames) {
        const idx = varIndex.get(`${vName}|${shift.id}`)!;
        row.push(idx);
        val.push(1);
      }
      if (phase === 1) {
        // Phase 1: <= capacity (soft)
        constraints.push({ row, val, lower: 0, upper: shift.capacity });
      } else {
        // Phase 2: == capacity (hard)
        constraints.push({ row, val, lower: shift.capacity, upper: shift.capacity });
      }
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

      // 2d. At least one from top preferences
      if (phase === 1) {
        const eligibleRow: number[] = [];
        const eligibleVal: number[] = [];
        for (const sId of shiftIds) {
          if (getRank(vName, sId) <= bestCut) {
            eligibleRow.push(varIndex.get(`${vName}|${sId}`)!);
            eligibleVal.push(1);
          }
        }
        if (eligibleRow.length > 0) {
          constraints.push({ row: eligibleRow, val: eligibleVal, lower: 1, upper: Infinity });
        }
      } else {
        // Phase 2: at least one shift total
        constraints.push({ row: [...maxShiftRow], val: [...maxShiftVal], lower: 1, upper: Infinity });
      }

      // 2e. No overlapping shifts
      for (const [s1, s2] of overlappingPairs) {
        const idx1 = varIndex.get(`${vName}|${s1}`)!;
        const idx2 = varIndex.get(`${vName}|${s2}`)!;
        constraints.push({ row: [idx1, idx2], val: [1, 1], lower: 0, upper: 1 });
      }
    }

    // 3. Sequential shift penalty constraints
    // seq_var >= x[v,s1] + x[v,s2] - 1  =>  x[v,s1] + x[v,s2] - seq_var <= 1
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

    // Convert constraints to HiGHS sparse matrix format
    const rowLower: number[] = [];
    const rowUpper: number[] = [];
    const aStart: number[] = [0];
    const aIndex: number[] = [];
    const aValue: number[] = [];

    // HiGHS uses column-major format, but we built row-major
    // We need to transpose: build by iterating rows and collecting column entries
    const colEntries: { row: number, val: number }[][] = Array.from({ length: numVars }, () => []);

    for (let r = 0; r < constraints.length; r++) {
      const c = constraints[r];
      rowLower.push(c.lower === -Infinity ? -1e30 : c.lower);
      rowUpper.push(c.upper === Infinity ? 1e30 : c.upper);

      for (let i = 0; i < c.row.length; i++) {
        colEntries[c.row[i]].push({ row: r, val: c.val[i] });
      }
    }

    // Build column-major sparse matrix
    for (let col = 0; col < numVars; col++) {
      for (const entry of colEntries[col]) {
        aIndex.push(entry.row);
        aValue.push(entry.val);
      }
      aStart.push(aIndex.length);
    }

    // Create the problem - convert constraints to LP format
    // LP format doesn't support range constraints like "1 <= expr <= 2"
    // So we split them into separate >= and <= constraints
    const lpConstraints: string[] = [];
    let constraintNum = 0;

    for (const c of constraints) {
      const terms = c.row.map((idx, j) => `${c.val[j] >= 0 ? '+' : ''}${c.val[j]} x${idx}`).join(' ');

      if (c.lower !== -Infinity && c.upper !== Infinity && c.lower === c.upper) {
        // Equality constraint: expr = value
        lpConstraints.push(`c${constraintNum++}: ${terms} = ${c.lower}`);
      } else {
        // Handle lower and upper bounds separately
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

      // HiGHS returns "Optimal" for optimal solutions, "Time limit reached" for partial solutions
      if (result.Status === 'Optimal' || result.Status === 'Time limit reached') {
        const assignments: Assignment[] = [];

        // Extract solution
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
          phase,
          assignments,
          message: `Phase ${phase} succeeded with ${assignments.length} assignments`
        };
      } else {
        return {
          status: 'infeasible',
          phase,
          assignments: [],
          message: `Phase ${phase} returned status: ${result.Status}`
        };
      }
    } catch (error) {
      return {
        status: 'error',
        phase,
        assignments: [],
        message: `Solver error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}
