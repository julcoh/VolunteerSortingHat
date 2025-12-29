// Core data types for the Shift Sorting Hat

export interface Shift {
  id: string;
  date: string;
  role: string;
  startTime: Date;
  endTime: Date;
  capacity: number;
  points: number;
  jotformLabel?: string;
}

export interface Volunteer {
  name: string;
  preAssignedPoints: number;  // Points already assigned outside this optimizer (default: 0)
  preferences: Map<string, number>;  // shiftId -> rank (1-5, lower is better)
}

export interface SettingsRange {
  min: number;
  max: number;
  recommended: number;
}

export interface Settings {
  // Core settings (now in Advanced panel, auto-detected)
  minPoints: number;      // Minimum points each volunteer must work
  maxOver: number;        // Maximum points above minimum allowed
  maxShifts: number;      // Maximum number of shifts per volunteer
  forbidBackToBack: boolean;  // If true, back-to-back shifts are forbidden; if false, just penalized

  // Advanced settings (shown in collapsible section)
  backToBackGap: number;  // Hours between shifts to consider them "back-to-back" (default: 2)
  guaranteeLevel: number; // Everyone gets at least one shift from their top N preferences (0 = no guarantee)
  allowRelaxation: boolean; // If true, solver can relax constraints to fill all shifts; if false, fail instead

  // Auto-detected values (set by system, shown to user)
  detectedGuarantee: number;  // Best achievable guarantee level based on data
  detectedMinPoints: SettingsRange;
  detectedMaxOver: SettingsRange;
  detectedMaxShifts: SettingsRange;

  // Internal (not shown to user)
  seed: number;           // Random seed for tie-breaking
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

  // Relaxation info (only present if constraints were relaxed in Phase 2)
  relaxation?: {
    level: 'relaxed-points' | 'minimal';
    minPointsMultiplier: number;  // 0.5 for relaxed-points, 0 for minimal
    maxShiftsMultiplier: number;  // 1.5 for relaxed-points, 2.0 for minimal
    originalMinPoints: number;    // The original target
    originalMaxShifts: number;    // The original limit
  };
}

// For displaying results
export interface ShiftAssignment {
  shiftId: string;
  role: string;
  capacity: number;
  points: number;
  volunteers: string[];
}

export interface VolunteerRoster {
  name: string;
  shifts: string[];
  totalPoints: number;
  rankHits: number[];  // count of shifts at each rank 1-5
}

export interface AuditData {
  volunteer: string;
  totalPoints: number;
  numShifts: number;
  rankHits: { [rank: number]: number };
  assignedShifts: string[];
}

// Input data parsed from files
export interface ParsedData {
  shifts: Shift[];
  volunteers: Volunteer[];
  settings: Settings;
  errors: string[];
  warnings: string[];
}

// App state
export type AppStep = 'upload' | 'review' | 'solving' | 'results';
