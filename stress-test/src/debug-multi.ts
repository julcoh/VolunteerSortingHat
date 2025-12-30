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
  console.log('=== Multi-Run Debug ===');

  for (let run = 0; run < 10; run++) {
    const seed = run * 1000 + 42;
    console.log(`\n--- Run ${run + 1}/10 (seed=${seed}) ---`);

    const { shifts, volunteers, settings } = generateTestData(BASELINE, seed);

    try {
      const result = await solveShiftAssignment({
        shifts,
        volunteers,
        settings
      });

      console.log(`  Status: ${result.status}, Time: ${result.solveTimeMs}ms, Assignments: ${result.assignments.length}`);
    } catch (error) {
      console.error(`  ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log('\n=== Complete ===');
}

debug().catch(console.error);
