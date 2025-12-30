import type { Shift, Volunteer, Settings } from '../../types';

/**
 * Bipartite matching to check if every volunteer can get at least one
 * shift from their top N preferences, respecting shift capacities.
 *
 * Uses augmenting path algorithm (simplified Ford-Fulkerson for bipartite graphs).
 */

interface MatchingResult {
  feasible: boolean;
  matching: Map<string, string>;  // volunteer -> shiftId
  unmatchedVolunteers: string[];
}

/**
 * Check if a matching exists where every volunteer gets at least one
 * shift from their top N preferences.
 */
function checkMatchingFeasibility(
  volunteers: Volunteer[],
  shifts: Shift[],
  maxRank: number
): MatchingResult {
  // Build adjacency: which shifts can each volunteer be matched to?
  const volunteerToShifts = new Map<string, string[]>();
  for (const vol of volunteers) {
    const eligibleShifts: string[] = [];
    for (const [shiftId, rank] of vol.preferences.entries()) {
      if (rank <= maxRank) {
        eligibleShifts.push(shiftId);
      }
    }
    volunteerToShifts.set(vol.name, eligibleShifts);
  }

  // Track remaining capacity for each shift
  const shiftCapacity = new Map<string, number>();
  for (const shift of shifts) {
    shiftCapacity.set(shift.id, shift.capacity);
  }

  // Current matching: volunteer -> shift
  const matching = new Map<string, string>();
  // Reverse matching: shift -> list of volunteers (for capacity > 1)
  const reverseMatching = new Map<string, string[]>();

  // Try to find augmenting path for each volunteer
  for (const vol of volunteers) {
    const visited = new Set<string>();
    if (!findAugmentingPath(vol.name, volunteerToShifts, shiftCapacity, matching, reverseMatching, visited)) {
      // No augmenting path found - this volunteer cannot be matched
    }
  }

  // Check which volunteers are unmatched
  const unmatchedVolunteers: string[] = [];
  for (const vol of volunteers) {
    if (!matching.has(vol.name)) {
      unmatchedVolunteers.push(vol.name);
    }
  }

  return {
    feasible: unmatchedVolunteers.length === 0,
    matching,
    unmatchedVolunteers
  };
}

/**
 * Find an augmenting path using DFS.
 * Returns true if volunteer can be matched (possibly by reassigning others).
 */
function findAugmentingPath(
  volunteer: string,
  volunteerToShifts: Map<string, string[]>,
  shiftCapacity: Map<string, number>,
  matching: Map<string, string>,
  reverseMatching: Map<string, string[]>,
  visited: Set<string>
): boolean {
  const eligibleShifts = volunteerToShifts.get(volunteer) || [];

  for (const shiftId of eligibleShifts) {
    if (visited.has(shiftId)) continue;
    visited.add(shiftId);

    const capacity = shiftCapacity.get(shiftId) || 0;
    const currentlyMatched = reverseMatching.get(shiftId) || [];

    // If shift has remaining capacity, match directly
    if (currentlyMatched.length < capacity) {
      matching.set(volunteer, shiftId);
      reverseMatching.set(shiftId, [...currentlyMatched, volunteer]);
      return true;
    }

    // Try to find augmenting path through currently matched volunteers
    for (const matchedVol of currentlyMatched) {
      if (findAugmentingPath(matchedVol, volunteerToShifts, shiftCapacity, matching, reverseMatching, visited)) {
        // matchedVol found another shift, so we can take this one
        const newMatched = currentlyMatched.filter(v => v !== matchedVol);
        newMatched.push(volunteer);
        matching.set(volunteer, shiftId);
        reverseMatching.set(shiftId, newMatched);
        return true;
      }
    }
  }

  return false;
}

/**
 * Find the minimum guarantee level (smallest N) where everyone can get
 * at least one shift from their top N preferences.
 *
 * Returns 0 if even considering all preferences doesn't work.
 */
export function detectMinimumGuarantee(
  volunteers: Volunteer[],
  shifts: Shift[]
): { level: number; unmatchedAt: Map<number, string[]> } {
  const unmatchedAt = new Map<number, string[]>();

  // Find the maximum rank anyone has in their preferences
  let maxPrefRank = 0;
  for (const vol of volunteers) {
    for (const rank of vol.preferences.values()) {
      if (rank > maxPrefRank) maxPrefRank = rank;
    }
  }

  // Try each level from 1 up to maxPrefRank
  for (let level = 1; level <= Math.max(maxPrefRank, 10); level++) {
    const result = checkMatchingFeasibility(volunteers, shifts, level);
    unmatchedAt.set(level, result.unmatchedVolunteers);

    if (result.feasible) {
      return { level, unmatchedAt };
    }
  }

  // Even all preferences don't work - return 0 (no guarantee possible)
  return { level: 0, unmatchedAt };
}

/**
 * Get a human-readable explanation of why a certain guarantee level is needed.
 */
export function explainGuaranteeLevel(
  level: number,
  unmatchedAt: Map<number, string[]>
): string {
  if (level === 0) {
    return "No guarantee level is achievable - some volunteers cannot be matched even with all their preferences.";
  }

  if (level === 1) {
    return "Everyone can receive their #1 preference!";
  }

  const prevUnmatched = unmatchedAt.get(level - 1) || [];
  if (prevUnmatched.length <= 3) {
    return `Top ${level} is required because ${prevUnmatched.join(', ')} ${prevUnmatched.length === 1 ? "can't" : "can't"} be matched with only top ${level - 1} preferences.`;
  }

  return `Top ${level} is the minimum achievable. ${prevUnmatched.length} volunteers couldn't be matched at top ${level - 1}.`;
}

/**
 * Auto-detect sensible default settings based on the data.
 */
export interface DetectedSettings {
  minPoints: number;
  maxOver: number;
  maxShifts: number;
  guaranteeLevel: number;

  // Computed bounds for UI
  minPointsRange: { min: number; max: number; recommended: number };
  maxOverRange: { min: number; max: number; recommended: number };
  maxShiftsRange: { min: number; max: number; recommended: number };
}

export function detectOptimalSettings(
  volunteers: Volunteer[],
  shifts: Shift[]
): DetectedSettings {
  if (volunteers.length === 0 || shifts.length === 0) {
    return {
      minPoints: 6,
      maxOver: 2,
      maxShifts: 10,
      guaranteeLevel: 0,
      minPointsRange: { min: 0, max: 10, recommended: 6 },
      maxOverRange: { min: 0, max: 5, recommended: 2 },
      maxShiftsRange: { min: 1, max: 20, recommended: 10 }
    };
  }

  // Calculate total available points
  const totalAvailablePoints = shifts.reduce((sum, s) => sum + s.points * s.capacity, 0);
  const numVolunteers = volunteers.length;

  // Fair share per volunteer
  const fairShare = totalAvailablePoints / numVolunteers;

  // Find min and max shift points for granularity
  const shiftPoints = shifts.map(s => s.points);
  const minShiftPoints = Math.min(...shiftPoints);
  const maxShiftPoints = Math.max(...shiftPoints);

  // Total capacity
  const totalCapacity = shifts.reduce((sum, s) => sum + s.capacity, 0);
  const avgShiftsPerPerson = totalCapacity / numVolunteers;

  // ===== MIN POINTS =====
  // Use 85% of fair share - balances fairness with constraint flexibility.
  const conservativeFairShare = fairShare * 0.85;
  const recommendedMinPoints = Math.floor(conservativeFairShare * 2) / 2;  // Round down to nearest 0.5
  const minPointsMin = 0;
  const minPointsMax = Math.floor(fairShare);  // Theoretical max

  // ===== MAX OVER =====
  // Default to 1.5 points over minimum - keeps workloads tight and fair.
  const recommendedMaxOver = 1.5;
  const slack = totalAvailablePoints - (numVolunteers * recommendedMinPoints);
  const slackPerPerson = slack / numVolunteers;
  const maxOverMin = 0;
  const maxOverMax = Math.max(Math.ceil(slackPerPerson * 3), maxShiftPoints * 3);

  // ===== MAX SHIFTS =====
  // How many shifts would someone need to reach their max points?
  const maxPointsPerPerson = recommendedMinPoints + recommendedMaxOver;
  const shiftsNeededForMax = Math.ceil(maxPointsPerPerson / minShiftPoints);

  // Be generous - allow more shifts than strictly needed
  const recommendedMaxShifts = Math.max(
    Math.ceil(avgShiftsPerPerson) + 3,  // Average + generous buffer
    shiftsNeededForMax + 2,  // Extra buffer for flexibility
    Math.ceil(shifts.length / numVolunteers) + 3  // Another perspective
  );
  const maxShiftsMin = Math.ceil(recommendedMinPoints / maxShiftPoints);  // Min needed to meet points
  const maxShiftsMax = Math.min(shifts.length, Math.max(recommendedMaxShifts + 5, Math.ceil(avgShiftsPerPerson * 3)));

  // ===== GUARANTEE LEVEL =====
  // FAIRNESS PRIORITY: Use a higher guarantee level (like 5) to ensure everyone
  // gets a shift they actually want. Only fall back to minimum if 5 isn't feasible.
  const { level: minimumFeasible } = detectMinimumGuarantee(volunteers, shifts);

  // Prefer top 5 for maximum choice, but use the minimum feasible if that's higher
  // (e.g., if minimum feasible is 7, we need at least 7)
  const guaranteeLevel = minimumFeasible === 0 ? 0 : Math.max(minimumFeasible, 5);

  return {
    minPoints: recommendedMinPoints,
    maxOver: recommendedMaxOver,
    maxShifts: recommendedMaxShifts,
    guaranteeLevel,
    minPointsRange: {
      min: minPointsMin,
      max: minPointsMax,
      recommended: recommendedMinPoints
    },
    maxOverRange: {
      min: maxOverMin,
      max: maxOverMax,
      recommended: recommendedMaxOver
    },
    maxShiftsRange: {
      min: maxShiftsMin,
      max: maxShiftsMax,
      recommended: recommendedMaxShifts
    }
  };
}

/**
 * Check if a given settings configuration is feasible.
 * Returns true if there exists a valid assignment with these settings.
 */
export function checkSettingsFeasibility(
  volunteers: Volunteer[],
  shifts: Shift[],
  settings: Partial<Settings>
): { feasible: boolean; reason?: string } {
  const minPoints = settings.minPoints ?? 6;
  const maxShifts = settings.maxShifts ?? 10;

  const totalRequired = volunteers.length * minPoints;
  const totalAvailable = shifts.reduce((sum, s) => sum + s.points * s.capacity, 0);

  if (totalRequired > totalAvailable) {
    return {
      feasible: false,
      reason: `Not enough total points: ${totalAvailable.toFixed(1)} available, ${totalRequired.toFixed(1)} required`
    };
  }

  // Check if max shifts is sufficient for anyone to reach min points
  const maxPointsFromMaxShifts = maxShifts * Math.max(...shifts.map(s => s.points));

  if (maxPointsFromMaxShifts < minPoints) {
    return {
      feasible: false,
      reason: `Max shifts (${maxShifts}) too low to reach min points (${minPoints})`
    };
  }

  return { feasible: true };
}
