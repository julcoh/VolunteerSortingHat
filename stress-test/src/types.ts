// Types matching the app types

export interface Shift {
  id: string;
  date: string;
  role: string;
  startTime: Date;
  endTime: Date;
  capacity: number;
  points: number;
}

export interface Volunteer {
  name: string;
  preAssignedPoints: number;
  preferences: Map<string, number>;
}

export interface Settings {
  minPoints: number;
  maxOver: number;
  maxShifts: number;
  forbidBackToBack: boolean;
  backToBackGap: number;
  guaranteeLevel: number;
  seed: number;
}

export interface Assignment {
  volunteerName: string;
  shiftId: string;
}

export interface SolverResult {
  status: 'optimal' | 'feasible' | 'infeasible' | 'error';
  phase: 1 | 2;
  assignments: Assignment[];
  message?: string;
}

// Test-specific types

export interface ScenarioConfig {
  name: string;
  days: number;
  volunteers: number;
  eventShiftsPerDay: number;  // Beyond breakfast/dinner
  capacityRatio: number;  // Relative to volunteer needs
  prefsPerVolunteer: number;
  preAssignedPercent: number;  // % of volunteers with pre-assigned points
  preferenceCorrelation: 'random' | 'popular_shifts' | 'avoid_morning';
  forbidBackToBack: boolean;
  description: string;
}

export interface TestResult {
  scenario: string;
  runNumber: number;
  seed: number;
  success: boolean;
  errorType?: string;
  errorMessage?: string;
  solveTimeMs: number;
  binarySearchIterations?: number;
  usedRelaxedConstraints?: string;

  // Quality metrics (only if successful)
  minSatisfactionPerShift?: number;
  maxSatisfactionPerShift?: number;
  avgSatisfactionPerShift?: number;
  stdDevSatisfaction?: number;
  pctGotTop1?: number;
  pctGotTop3?: number;
  shiftsFilledPct?: number;
  minPointsAssigned?: number;
  maxPointsAssigned?: number;
  avgPointsAssigned?: number;

  // Input characteristics
  numShifts: number;
  numVolunteers: number;
  totalCapacity: number;
  totalPointsNeeded: number;
}

export interface ScenarioSummary {
  scenario: string;
  totalRuns: number;
  successCount: number;
  successRate: number;
  avgSolveTimeMs: number;
  maxSolveTimeMs: number;

  // Success metrics (averaged over successful runs)
  avgMinSatisfaction?: number;
  avgPctGotTop1?: number;
  avgPctGotTop3?: number;

  // Failure analysis
  failuresByType: Record<string, number>;
  commonFailurePatterns: string[];
}

export interface FailedRun {
  scenario: string;
  runNumber: number;
  seed: number;
  errorType: string;
  errorMessage: string;
  inputSummary: {
    numShifts: number;
    numVolunteers: number;
    totalCapacity: number;
    totalPointsNeeded: number;
    avgPrefsPerVolunteer: number;
  };
}
