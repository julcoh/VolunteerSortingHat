import { SCENARIOS, runAllScenarios } from './testRunner';
import { TestResult, FailedRun, ScenarioSummary } from './types';
import * as fs from 'fs';
import * as path from 'path';

const RUNS_PER_SCENARIO = parseInt(process.env.RUNS || '100', 10);

function analyzeResults(results: TestResult[]): Map<string, ScenarioSummary> {
  const summaries = new Map<string, ScenarioSummary>();

  // Group results by scenario
  const byScenario = new Map<string, TestResult[]>();
  for (const r of results) {
    const list = byScenario.get(r.scenario) || [];
    list.push(r);
    byScenario.set(r.scenario, list);
  }

  for (const [scenario, scenarioResults] of byScenario) {
    const successful = scenarioResults.filter(r => r.success);
    const failed = scenarioResults.filter(r => !r.success);

    // Failure analysis
    const failuresByType: Record<string, number> = {};
    for (const f of failed) {
      const type = f.errorType || 'unknown';
      failuresByType[type] = (failuresByType[type] || 0) + 1;
    }

    // Common patterns in failure messages
    const commonFailurePatterns: string[] = [];
    if (failed.length > 0) {
      const messages = failed.map(f => f.errorMessage || '').filter(m => m.length > 0);
      const messageCounts = new Map<string, number>();
      for (const m of messages) {
        messageCounts.set(m, (messageCounts.get(m) || 0) + 1);
      }
      const sorted = [...messageCounts.entries()].sort((a, b) => b[1] - a[1]);
      for (const [msg, count] of sorted.slice(0, 3)) {
        commonFailurePatterns.push(`${msg} (${count}x)`);
      }
    }

    // Success metrics
    const avgSolveTime = scenarioResults.reduce((sum, r) => sum + r.solveTimeMs, 0) / scenarioResults.length;
    const maxSolveTime = Math.max(...scenarioResults.map(r => r.solveTimeMs));

    let avgMinSat: number | undefined;
    let avgPctTop1: number | undefined;
    let avgPctTop3: number | undefined;

    if (successful.length > 0) {
      const minSats = successful.filter(r => r.minSatisfactionPerShift !== undefined).map(r => r.minSatisfactionPerShift!);
      const pctTop1s = successful.filter(r => r.pctGotTop1 !== undefined).map(r => r.pctGotTop1!);
      const pctTop3s = successful.filter(r => r.pctGotTop3 !== undefined).map(r => r.pctGotTop3!);

      if (minSats.length > 0) avgMinSat = minSats.reduce((a, b) => a + b, 0) / minSats.length;
      if (pctTop1s.length > 0) avgPctTop1 = pctTop1s.reduce((a, b) => a + b, 0) / pctTop1s.length;
      if (pctTop3s.length > 0) avgPctTop3 = pctTop3s.reduce((a, b) => a + b, 0) / pctTop3s.length;
    }

    summaries.set(scenario, {
      scenario,
      totalRuns: scenarioResults.length,
      successCount: successful.length,
      successRate: (successful.length / scenarioResults.length) * 100,
      avgSolveTimeMs: avgSolveTime,
      maxSolveTimeMs: maxSolveTime,
      avgMinSatisfaction: avgMinSat,
      avgPctGotTop1: avgPctTop1,
      avgPctGotTop3: avgPctTop3,
      failuresByType,
      commonFailurePatterns
    });
  }

  return summaries;
}

function generateReport(summaries: Map<string, ScenarioSummary>, failures: FailedRun[]): string {
  const lines: string[] = [];

  lines.push('# Shift Sorting Hat - Stress Test Report');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total scenarios: ${summaries.size}`);
  lines.push(`Runs per scenario: ${RUNS_PER_SCENARIO}`);
  lines.push('');

  // Overall summary
  let totalRuns = 0;
  let totalSuccess = 0;
  for (const s of summaries.values()) {
    totalRuns += s.totalRuns;
    totalSuccess += s.successCount;
  }
  lines.push(`## Overall Summary`);
  lines.push(`- **Total runs:** ${totalRuns}`);
  lines.push(`- **Total successful:** ${totalSuccess}`);
  lines.push(`- **Overall success rate:** ${((totalSuccess / totalRuns) * 100).toFixed(1)}%`);
  lines.push('');

  // Per-scenario table
  lines.push('## Scenario Results');
  lines.push('');
  lines.push('| Scenario | Success Rate | Avg Time (ms) | Max Time (ms) | Avg Min Sat | % Got Top 1 | % Got Top 3 |');
  lines.push('|----------|-------------|---------------|---------------|-------------|-------------|-------------|');

  for (const config of SCENARIOS) {
    const s = summaries.get(config.name);
    if (!s) continue;

    const successRate = s.successRate.toFixed(1) + '%';
    const avgTime = s.avgSolveTimeMs.toFixed(0);
    const maxTime = s.maxSolveTimeMs.toFixed(0);
    const minSat = s.avgMinSatisfaction !== undefined ? s.avgMinSatisfaction.toFixed(2) : 'N/A';
    const top1 = s.avgPctGotTop1 !== undefined ? s.avgPctGotTop1.toFixed(1) + '%' : 'N/A';
    const top3 = s.avgPctGotTop3 !== undefined ? s.avgPctGotTop3.toFixed(1) + '%' : 'N/A';

    lines.push(`| ${s.scenario} | ${successRate} | ${avgTime} | ${maxTime} | ${minSat} | ${top1} | ${top3} |`);
  }
  lines.push('');

  // Scenario details
  lines.push('## Scenario Details');
  lines.push('');

  for (const config of SCENARIOS) {
    const s = summaries.get(config.name);
    if (!s) continue;

    lines.push(`### ${config.name}`);
    lines.push(`*${config.description}*`);
    lines.push('');
    lines.push(`- Days: ${config.days}, Volunteers: ${config.volunteers}`);
    lines.push(`- Event shifts/day: ${config.eventShiftsPerDay}, Capacity ratio: ${config.capacityRatio}`);
    lines.push(`- Preferences/volunteer: ${config.prefsPerVolunteer}`);
    lines.push(`- Pre-assigned %: ${config.preAssignedPercent}%`);
    lines.push(`- Preference correlation: ${config.preferenceCorrelation}`);
    lines.push(`- Forbid back-to-back: ${config.forbidBackToBack}`);
    lines.push('');
    lines.push(`**Results:**`);
    lines.push(`- Success: ${s.successCount}/${s.totalRuns} (${s.successRate.toFixed(1)}%)`);
    lines.push(`- Solve time: avg ${s.avgSolveTimeMs.toFixed(0)}ms, max ${s.maxSolveTimeMs.toFixed(0)}ms`);

    if (s.avgMinSatisfaction !== undefined) {
      lines.push(`- Avg min satisfaction: ${s.avgMinSatisfaction.toFixed(2)}/shift`);
    }
    if (s.avgPctGotTop1 !== undefined) {
      lines.push(`- Volunteers getting top choice: ${s.avgPctGotTop1.toFixed(1)}%`);
    }
    if (s.avgPctGotTop3 !== undefined) {
      lines.push(`- Volunteers getting top 3: ${s.avgPctGotTop3.toFixed(1)}%`);
    }

    if (Object.keys(s.failuresByType).length > 0) {
      lines.push('');
      lines.push('**Failures by type:**');
      for (const [type, count] of Object.entries(s.failuresByType)) {
        lines.push(`- ${type}: ${count}`);
      }
    }

    if (s.commonFailurePatterns.length > 0) {
      lines.push('');
      lines.push('**Common failure patterns:**');
      for (const p of s.commonFailurePatterns) {
        lines.push(`- ${p}`);
      }
    }
    lines.push('');
  }

  // Recommendations
  lines.push('## Analysis & Recommendations');
  lines.push('');

  // Find problematic scenarios
  const lowSuccess = [...summaries.values()].filter(s => s.successRate < 90 && s.scenario !== 'impossible');
  const slowScenarios = [...summaries.values()].filter(s => s.avgSolveTimeMs > 5000);
  const lowSatisfaction = [...summaries.values()].filter(s => s.avgMinSatisfaction !== undefined && s.avgMinSatisfaction < 1.5);

  if (lowSuccess.length > 0) {
    lines.push('### Low Success Rate Scenarios');
    for (const s of lowSuccess) {
      lines.push(`- **${s.scenario}**: ${s.successRate.toFixed(1)}% success`);
      if (Object.keys(s.failuresByType).length > 0) {
        const topFailure = Object.entries(s.failuresByType).sort((a, b) => b[1] - a[1])[0];
        lines.push(`  - Primary failure mode: ${topFailure[0]} (${topFailure[1]} occurrences)`);
      }
    }
    lines.push('');
  }

  if (slowScenarios.length > 0) {
    lines.push('### Performance Concerns');
    for (const s of slowScenarios) {
      lines.push(`- **${s.scenario}**: avg ${s.avgSolveTimeMs.toFixed(0)}ms, max ${s.maxSolveTimeMs.toFixed(0)}ms`);
    }
    lines.push('');
  }

  if (lowSatisfaction.length > 0) {
    lines.push('### Quality Concerns');
    for (const s of lowSatisfaction) {
      lines.push(`- **${s.scenario}**: avg min satisfaction ${s.avgMinSatisfaction!.toFixed(2)}`);
    }
    lines.push('');
  }

  // Check "impossible" scenario
  const impossible = summaries.get('impossible');
  if (impossible) {
    lines.push('### "Impossible" Scenario Validation');
    if (impossible.successRate < 5) {
      lines.push('✅ Correctly identified as infeasible in most cases');
    } else {
      lines.push(`⚠️ Unexpectedly succeeded in ${impossible.successRate.toFixed(1)}% of cases - may need investigation`);
    }
    lines.push('');
  }

  // Summary recommendations
  lines.push('### Summary');
  const overallSuccess = (totalSuccess / totalRuns) * 100;
  if (overallSuccess >= 95) {
    lines.push('✅ Solver performs well across most scenarios');
  } else if (overallSuccess >= 80) {
    lines.push('⚠️ Solver has moderate issues - review failing scenarios');
  } else {
    lines.push('❌ Solver has significant issues - needs investigation');
  }

  return lines.join('\n');
}

async function main() {
  console.log('='.repeat(60));
  console.log('SHIFT SORTING HAT - STRESS TEST');
  console.log('='.repeat(60));
  console.log(`Scenarios: ${SCENARIOS.length}`);
  console.log(`Runs per scenario: ${RUNS_PER_SCENARIO}`);
  console.log(`Total runs: ${SCENARIOS.length * RUNS_PER_SCENARIO}`);
  console.log('='.repeat(60));

  const startTime = Date.now();

  const { allResults, allFailures } = await runAllScenarios(RUNS_PER_SCENARIO);

  const elapsed = (Date.now() - startTime) / 1000;
  console.log('\n' + '='.repeat(60));
  console.log(`COMPLETED in ${elapsed.toFixed(1)} seconds`);
  console.log('='.repeat(60));

  // Analyze results
  const summaries = analyzeResults(allResults);

  // Generate and save report
  const report = generateReport(summaries, allFailures);
  const reportPath = path.join(__dirname, '..', 'stress-test-report.md');
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport saved to: ${reportPath}`);

  // Save raw data as JSON
  const rawDataPath = path.join(__dirname, '..', 'stress-test-results.json');
  fs.writeFileSync(rawDataPath, JSON.stringify({
    runDate: new Date().toISOString(),
    runsPerScenario: RUNS_PER_SCENARIO,
    results: allResults,
    failures: allFailures,
    summaries: Object.fromEntries([...summaries.entries()].map(([k, v]) => [k, v]))
  }, null, 2));
  console.log(`Raw data saved to: ${rawDataPath}`);

  // Print quick summary
  console.log('\n' + '='.repeat(60));
  console.log('QUICK SUMMARY');
  console.log('='.repeat(60));

  for (const config of SCENARIOS) {
    const s = summaries.get(config.name);
    if (!s) continue;
    const status = s.successRate >= 95 ? '✅' : s.successRate >= 80 ? '⚠️' : '❌';
    console.log(`${status} ${s.scenario.padEnd(20)} ${s.successRate.toFixed(1).padStart(6)}% success, avg ${s.avgSolveTimeMs.toFixed(0).padStart(5)}ms`);
  }

  let totalSuccess = 0;
  let totalRuns = 0;
  for (const s of summaries.values()) {
    totalSuccess += s.successCount;
    totalRuns += s.totalRuns;
  }
  console.log('='.repeat(60));
  console.log(`OVERALL: ${((totalSuccess / totalRuns) * 100).toFixed(1)}% success rate`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
