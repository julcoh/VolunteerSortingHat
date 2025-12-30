import { generateTestData } from './dataGenerator';
import { solveShiftAssignment } from './solver';
import { ScenarioConfig } from './types';

const BASELINE: ScenarioConfig = {
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
};

async function debug() {
  console.log('=== Debug Run ===');
  console.log('Generating test data...');

  const seed = 42;
  const { shifts, volunteers, settings } = generateTestData(BASELINE, seed);

  console.log(`Generated ${shifts.length} shifts, ${volunteers.length} volunteers`);
  console.log(`Settings: minPoints=${settings.minPoints}, maxOver=${settings.maxOver}, maxShifts=${settings.maxShifts}`);
  console.log(`ForbidBackToBack: ${settings.forbidBackToBack}`);

  // Calculate total capacity
  const totalCapacity = shifts.reduce((sum, s) => sum + s.capacity, 0);
  const totalPoints = shifts.reduce((sum, s) => sum + s.capacity * s.points, 0);
  console.log(`Total capacity: ${totalCapacity}, Total points available: ${totalPoints}`);

  // Calculate points needed
  const effectiveMins = volunteers.map(v => Math.max(0, settings.minPoints - v.preAssignedPoints));
  const totalNeeded = effectiveMins.reduce((a, b) => a + b, 0);
  console.log(`Total points needed: ${totalNeeded}`);

  console.log('\nRunning solver...');

  try {
    const result = await solveShiftAssignment({
      shifts,
      volunteers,
      settings,
      onProgress: (msg) => console.log(`  [Solver] ${msg}`)
    });

    console.log('\n=== Result ===');
    console.log(`Status: ${result.status}`);
    console.log(`Phase: ${result.phase}`);
    console.log(`Message: ${result.message}`);
    console.log(`Solve time: ${result.solveTimeMs}ms`);
    console.log(`Binary search iterations: ${result.binarySearchIterations}`);
    console.log(`Assignments: ${result.assignments.length}`);

    if (result.usedRelaxedConstraints) {
      console.log(`Used relaxed constraints: ${result.usedRelaxedConstraints}`);
    }
  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error(error);
  }
}

debug().catch(console.error);
