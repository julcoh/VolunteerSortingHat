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
  minPoints?: number;  // Override global minimum if set
  preferences: Map<string, number>;  // shiftId -> rank (1-5, lower is better)
}

export interface Settings {
  minPoints: number;
  maxOver: number;
  seed: number;
  maxShifts: number;
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
