import { Shift, Volunteer, ScenarioConfig, Settings } from './types';

// Seeded random number generator for reproducibility
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

  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }

  pickWeighted<T>(array: T[], weights: number[]): T {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * totalWeight;
    for (let i = 0; i < array.length; i++) {
      r -= weights[i];
      if (r <= 0) return array[i];
    }
    return array[array.length - 1];
  }
}

// Event shift types for variety
const EVENT_TYPES = [
  'Gate Duty',
  'Bar Service',
  'Art Car',
  'Setup',
  'Teardown',
  'MOOP Sweep',
  'Theme Event',
  'Sound Check',
  'Greeter'
];

export function generateTestData(
  config: ScenarioConfig,
  seed: number
): { shifts: Shift[]; volunteers: Volunteer[]; settings: Settings } {
  const rand = new SeededRandom(seed);
  const shifts: Shift[] = [];

  // Base date for the event
  const baseDate = new Date('2025-08-25');  // Burning Man week

  // Generate shifts for each day
  for (let day = 0; day < config.days; day++) {
    const currentDate = new Date(baseDate);
    currentDate.setDate(baseDate.getDate() + day);
    const dateStr = currentDate.toISOString().split('T')[0];

    // Breakfast shift: 7-10 AM, 3 people, 3 points
    const breakfastStart = new Date(currentDate);
    breakfastStart.setHours(7, 0, 0, 0);
    const breakfastEnd = new Date(currentDate);
    breakfastEnd.setHours(10, 0, 0, 0);

    shifts.push({
      id: `D${day + 1}_Breakfast`,
      date: dateStr,
      role: 'Breakfast',
      startTime: breakfastStart,
      endTime: breakfastEnd,
      capacity: 3,
      points: 3  // 3 hours = 3 points
    });

    // Dinner shift: 5-8 PM, 4 people, 3 points
    const dinnerStart = new Date(currentDate);
    dinnerStart.setHours(17, 0, 0, 0);
    const dinnerEnd = new Date(currentDate);
    dinnerEnd.setHours(20, 0, 0, 0);

    shifts.push({
      id: `D${day + 1}_Dinner`,
      date: dateStr,
      role: 'Dinner',
      startTime: dinnerStart,
      endTime: dinnerEnd,
      capacity: 4,
      points: 3  // 3 hours = 3 points
    });

    // Event shifts throughout the day
    const eventSlots = [
      { start: 10, end: 12 },  // Late morning
      { start: 12, end: 14 },  // Midday
      { start: 14, end: 16 },  // Afternoon
      { start: 20, end: 22 },  // Evening
      { start: 22, end: 24 },  // Late night
    ];

    // Pick random event slots for this day
    const numEvents = Math.min(config.eventShiftsPerDay, eventSlots.length);
    const selectedSlots = rand.shuffle(eventSlots).slice(0, numEvents);

    for (let e = 0; e < selectedSlots.length; e++) {
      const slot = selectedSlots[e];
      const eventType = rand.pick(EVENT_TYPES);
      const duration = rand.randInt(1, 3);  // 1-3 hours
      const actualEnd = Math.min(slot.start + duration, slot.end);

      const eventStart = new Date(currentDate);
      eventStart.setHours(slot.start, 0, 0, 0);
      const eventEnd = new Date(currentDate);
      eventEnd.setHours(actualEnd, 0, 0, 0);

      // Capacity varies: 2-4 people
      const capacity = rand.randInt(2, 4);

      shifts.push({
        id: `D${day + 1}_E${e + 1}_${eventType.replace(/\s+/g, '')}`,
        date: dateStr,
        role: eventType,
        startTime: eventStart,
        endTime: eventEnd,
        capacity,
        points: actualEnd - slot.start  // 1 point per hour
      });
    }
  }

  // Calculate total capacity and points
  const totalCapacity = shifts.reduce((sum, s) => sum + s.capacity, 0);
  const totalPoints = shifts.reduce((sum, s) => sum + s.capacity * s.points, 0);

  // Calculate minPoints based on capacity ratio
  // If capacityRatio = 1.0, total capacity exactly matches needs
  // Total needed = volunteers * minPoints
  // So minPoints = totalPoints / (volunteers * capacityRatio)
  const targetMinPoints = totalPoints / (config.volunteers * config.capacityRatio);
  const minPoints = Math.max(1, Math.round(targetMinPoints * 2) / 2);  // Round to nearest 0.5

  // Generate volunteers
  const volunteers: Volunteer[] = [];

  // Determine popularity weights for shifts based on config
  let shiftPopularity: Map<string, number>;

  if (config.preferenceCorrelation === 'popular_shifts') {
    // Some shifts are much more popular (random selection)
    shiftPopularity = new Map();
    const popularCount = Math.ceil(shifts.length * 0.2);  // 20% are "hot"
    const popularShifts = new Set(rand.shuffle([...shifts]).slice(0, popularCount).map(s => s.id));

    for (const shift of shifts) {
      shiftPopularity.set(shift.id, popularShifts.has(shift.id) ? 5 : 1);
    }
  } else if (config.preferenceCorrelation === 'avoid_morning') {
    // People avoid early morning shifts
    shiftPopularity = new Map();
    for (const shift of shifts) {
      const hour = shift.startTime.getHours();
      if (hour < 9) {
        shiftPopularity.set(shift.id, 0.3);  // Less popular
      } else if (hour >= 20) {
        shiftPopularity.set(shift.id, 2);    // More popular (evening)
      } else {
        shiftPopularity.set(shift.id, 1);    // Normal
      }
    }
  } else {
    // Random - equal popularity
    shiftPopularity = new Map();
    for (const shift of shifts) {
      shiftPopularity.set(shift.id, 1);
    }
  }

  // Number of volunteers with pre-assigned points
  const preAssignedCount = Math.floor(config.volunteers * config.preAssignedPercent / 100);

  for (let v = 0; v < config.volunteers; v++) {
    const name = `Volunteer_${String(v + 1).padStart(3, '0')}`;

    // Pre-assigned points (for leads / early setup folks)
    let preAssignedPoints = 0;
    if (v < preAssignedCount) {
      preAssignedPoints = rand.randInt(1, 3);  // 1-3 points pre-assigned
    }

    // Generate preferences
    const preferences = new Map<string, number>();

    // Weight shifts by popularity and pick top N
    const shiftIds = shifts.map(s => s.id);
    const weights = shiftIds.map(id => shiftPopularity.get(id) || 1);

    // Add some individual randomness
    const personalizedWeights = weights.map(w => w * (0.5 + rand.next()));

    // Sort shifts by personalized weight and pick top preferences
    const rankedShifts = shiftIds
      .map((id, i) => ({ id, weight: personalizedWeights[i] }))
      .sort((a, b) => b.weight - a.weight);

    // Assign ranks 1-N to top preferences
    const numPrefs = Math.min(config.prefsPerVolunteer, shifts.length);
    for (let rank = 1; rank <= numPrefs; rank++) {
      preferences.set(rankedShifts[rank - 1].id, rank);
    }

    volunteers.push({
      name,
      preAssignedPoints,
      preferences
    });
  }

  // Build settings
  const settings: Settings = {
    minPoints,
    maxOver: Math.max(2, Math.ceil(minPoints * 0.3)),  // ~30% flexibility
    maxShifts: Math.ceil(minPoints / 1) + 3,  // Enough to hit points + buffer
    forbidBackToBack: config.forbidBackToBack,
    backToBackGap: 2,
    guaranteeLevel: Math.min(5, config.prefsPerVolunteer),  // Top 5 or fewer
    seed
  };

  return { shifts, volunteers, settings };
}

export function summarizeInput(
  shifts: Shift[],
  volunteers: Volunteer[],
  settings: Settings
): {
  numShifts: number;
  numVolunteers: number;
  totalCapacity: number;
  totalPointsNeeded: number;
  avgPrefsPerVolunteer: number;
} {
  const totalCapacity = shifts.reduce((sum, s) => sum + s.capacity, 0);
  const totalPoints = shifts.reduce((sum, s) => sum + s.capacity * s.points, 0);
  const effectiveMinPoints = volunteers.map(v =>
    Math.max(0, settings.minPoints - v.preAssignedPoints)
  );
  const totalPointsNeeded = effectiveMinPoints.reduce((a, b) => a + b, 0);
  const avgPrefs = volunteers.reduce((sum, v) => sum + v.preferences.size, 0) / volunteers.length;

  return {
    numShifts: shifts.length,
    numVolunteers: volunteers.length,
    totalCapacity,
    totalPointsNeeded,
    avgPrefsPerVolunteer: avgPrefs
  };
}
