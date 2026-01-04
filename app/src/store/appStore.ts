import { create } from 'zustand';
import type {
  Shift,
  Volunteer,
  Settings,
  SolverResult,
  AppStep,
  ShiftAssignment,
  VolunteerRoster,
  AuditData
} from '../types';
import { detectOptimalSettings } from '../lib/solver/feasibilityChecker';

interface AppState {
  // Dark mode
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;

  // Current step in the workflow
  step: AppStep;
  setStep: (step: AppStep) => void;

  // Parsed input data
  shifts: Shift[];
  volunteers: Volunteer[];
  settings: Settings;
  parseErrors: string[];
  parseWarnings: string[];

  // Set parsed data
  setData: (data: {
    shifts: Shift[];
    volunteers: Volunteer[];
    settings: Settings;
    errors: string[];
    warnings: string[];
  }) => void;

  // Update settings (for user adjustments on Review page)
  updateSettings: (updates: Partial<Settings>) => void;

  // Update individual volunteers (for editable table)
  updateVolunteer: (name: string, updates: Partial<Pick<Volunteer, 'preAssignedPoints'>>) => void;

  // Update individual shifts (for editable table)
  updateShift: (id: string, updates: Partial<Pick<Shift, 'capacity' | 'points'>>) => void;

  // Clear data
  clearData: () => void;

  // Solver state
  solverStatus: 'idle' | 'running' | 'complete' | 'error';
  solverProgress: (string | { message: string; phase?: number; phaseLabel?: string; progress?: number })[];
  solverResult: SolverResult | null;

  setSolverStatus: (status: 'idle' | 'running' | 'complete' | 'error') => void;
  addSolverProgress: (message: string | { message: string; phase?: number; phaseLabel?: string; progress?: number }) => void;
  clearSolverProgress: () => void;
  setSolverResult: (result: SolverResult | null) => void;

  // Computed results
  getShiftAssignments: () => ShiftAssignment[];
  getVolunteerRosters: () => VolunteerRoster[];
  getAuditData: () => AuditData[];
}

const defaultSettings: Settings = {
  minPoints: 6,
  maxOver: 2,
  maxShifts: 10,
  forbidBackToBack: false,
  backToBackGap: 2,
  guaranteeLevel: 0,
  allowRelaxation: false,
  detectedGuarantee: 0,
  detectedMinPoints: { min: 0, max: 10, recommended: 6 },
  detectedMaxOver: { min: 0, max: 5, recommended: 2 },
  detectedMaxShifts: { min: 1, max: 20, recommended: 10 },
  seed: Math.floor(Math.random() * 1000000)
};

// Initialize dark mode from localStorage (default: light mode)
const getInitialDarkMode = (): boolean => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('darkMode');
    if (stored !== null) {
      return stored === 'true';
    }
  }
  return false; // Default to light mode
};

export const useAppStore = create<AppState>((set, get) => ({
  darkMode: getInitialDarkMode(),
  setDarkMode: (dark) => {
    localStorage.setItem('darkMode', String(dark));
    set({ darkMode: dark });
  },
  toggleDarkMode: () => {
    const newValue = !get().darkMode;
    localStorage.setItem('darkMode', String(newValue));
    set({ darkMode: newValue });
  },

  step: 'upload',
  setStep: (step) => set({ step }),

  shifts: [],
  volunteers: [],
  settings: defaultSettings,
  parseErrors: [],
  parseWarnings: [],

  setData: (data) => {
    // Auto-detect optimal settings based on the data
    let settings = { ...data.settings };

    if (data.shifts.length > 0 && data.volunteers.length > 0) {
      const detected = detectOptimalSettings(data.volunteers, data.shifts);

      settings = {
        ...settings,
        // Apply detected values as defaults
        minPoints: detected.minPoints,
        maxOver: detected.maxOver,
        maxShifts: detected.maxShifts,
        guaranteeLevel: detected.guaranteeLevel,
        // Store detected ranges for UI
        detectedGuarantee: detected.guaranteeLevel,
        detectedMinPoints: detected.minPointsRange,
        detectedMaxOver: detected.maxOverRange,
        detectedMaxShifts: detected.maxShiftsRange
      };
    }

    set({
      shifts: data.shifts,
      volunteers: data.volunteers,
      settings,
      parseErrors: data.errors,
      parseWarnings: data.warnings,
      step: data.errors.length === 0 ? 'review' : 'upload'
    });
  },

  updateSettings: (updates) => set((state) => ({
    settings: { ...state.settings, ...updates }
  })),

  updateVolunteer: (name, updates) => set((state) => ({
    volunteers: state.volunteers.map(v =>
      v.name === name ? { ...v, ...updates } : v
    )
  })),

  updateShift: (id, updates) => set((state) => ({
    shifts: state.shifts.map(s =>
      s.id === id ? { ...s, ...updates } : s
    )
  })),

  clearData: () => set({
    shifts: [],
    volunteers: [],
    settings: defaultSettings,
    parseErrors: [],
    parseWarnings: [],
    solverResult: null,
    solverStatus: 'idle',
    solverProgress: [],
    step: 'upload'
  }),

  solverStatus: 'idle',
  solverProgress: [],
  solverResult: null,

  setSolverStatus: (status) => set({ solverStatus: status }),
  addSolverProgress: (message) => set((state) => ({
    solverProgress: [...state.solverProgress, message]
  })),
  clearSolverProgress: () => set({ solverProgress: [] }),
  setSolverResult: (result) => set({
    solverResult: result,
    solverStatus: result ? 'complete' : 'idle',
    step: result && result.status !== 'error' && result.status !== 'infeasible' ? 'results' : get().step
  }),

  getShiftAssignments: () => {
    const { shifts, solverResult } = get();
    if (!solverResult || solverResult.assignments.length === 0) return [];

    const assignmentMap = new Map<string, string[]>();
    for (const a of solverResult.assignments) {
      const vols = assignmentMap.get(a.shiftId) || [];
      vols.push(a.volunteerName);
      assignmentMap.set(a.shiftId, vols);
    }

    return shifts.map(s => ({
      shiftId: s.id,
      role: s.role,
      capacity: s.capacity,
      points: s.points,
      volunteers: assignmentMap.get(s.id) || []
    }));
  },

  getVolunteerRosters: () => {
    const { shifts, volunteers, solverResult } = get();
    if (!solverResult || solverResult.assignments.length === 0) return [];

    const shiftById = new Map(shifts.map(s => [s.id, s]));
    const rosterMap = new Map<string, string[]>();

    for (const a of solverResult.assignments) {
      const shifts = rosterMap.get(a.volunteerName) || [];
      shifts.push(a.shiftId);
      rosterMap.set(a.volunteerName, shifts);
    }

    return volunteers.map(v => {
      const assignedShifts = rosterMap.get(v.name) || [];
      const totalPoints = assignedShifts.reduce((sum, sId) => {
        const shift = shiftById.get(sId);
        return sum + (shift?.points ?? 0);
      }, 0);

      const rankHits = [0, 0, 0, 0, 0];  // ranks 1-5
      for (const sId of assignedShifts) {
        const rank = v.preferences.get(sId);
        if (rank && rank >= 1 && rank <= 5) {
          rankHits[rank - 1]++;
        }
      }

      return {
        name: v.name,
        shifts: assignedShifts,
        totalPoints,
        rankHits
      };
    });
  },

  getAuditData: () => {
    const { shifts, volunteers, solverResult } = get();
    if (!solverResult || solverResult.assignments.length === 0) return [];

    const shiftById = new Map(shifts.map(s => [s.id, s]));
    const rosterMap = new Map<string, string[]>();

    for (const a of solverResult.assignments) {
      const shifts = rosterMap.get(a.volunteerName) || [];
      shifts.push(a.shiftId);
      rosterMap.set(a.volunteerName, shifts);
    }

    return volunteers.map(v => {
      const assignedShifts = rosterMap.get(v.name) || [];
      const totalPoints = assignedShifts.reduce((sum, sId) => {
        const shift = shiftById.get(sId);
        return sum + (shift?.points ?? 0);
      }, 0);

      const rankHits: { [rank: number]: number } = {};
      for (const sId of assignedShifts) {
        const rank = v.preferences.get(sId);
        if (rank) {
          rankHits[rank] = (rankHits[rank] || 0) + 1;
        }
      }

      return {
        volunteer: v.name,
        totalPoints,
        numShifts: assignedShifts.length,
        rankHits,
        assignedShifts
      };
    });
  }
}));
