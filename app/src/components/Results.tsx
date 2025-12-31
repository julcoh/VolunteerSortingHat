import { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import * as XLSX from 'xlsx';

type Tab = 'shifts' | 'roster' | 'audit' | 'summary';

interface VolunteerWarning {
  name: string;
  totalPoints: number;
  numShifts: number;
  belowMinPoints: boolean;
  aboveMaxShifts: boolean;
  expectedMinPoints: number;
  expectedMaxShifts: number;
}

export function Results() {
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const {
    shifts,
    volunteers,
    settings,
    solverResult,
    getShiftAssignments,
    getVolunteerRosters,
    getAuditData,
    clearData
  } = useAppStore();

  const shiftAssignments = getShiftAssignments();
  const volunteerRosters = getVolunteerRosters();
  const auditData = getAuditData();

  // Calculate summary stats
  const totalAssignments = solverResult?.assignments.length ?? 0;
  const shiftsFullyStaffed = shiftAssignments.filter(s => s.volunteers.length >= s.capacity).length;

  // Calculate volunteer warnings when relaxation was used
  const volunteerWarnings = useMemo((): VolunteerWarning[] => {
    if (!solverResult?.relaxation || !settings) return [];

    const warnings: VolunteerWarning[] = [];
    const volByName = new Map(volunteers.map(v => [v.name, v]));

    for (const roster of volunteerRosters) {
      const vol = volByName.get(roster.name);
      if (!vol) continue;

      // Calculate what this volunteer's effective min was
      const effectiveMin = Math.max(0, settings.minPoints - vol.preAssignedPoints);

      const belowMinPoints = roster.totalPoints < effectiveMin;
      const aboveMaxShifts = roster.shifts.length > settings.maxShifts;

      if (belowMinPoints || aboveMaxShifts) {
        warnings.push({
          name: roster.name,
          totalPoints: roster.totalPoints,
          numShifts: roster.shifts.length,
          belowMinPoints,
          aboveMaxShifts,
          expectedMinPoints: effectiveMin,
          expectedMaxShifts: settings.maxShifts
        });
      }
    }

    return warnings;
  }, [solverResult, settings, volunteers, volunteerRosters]);

  // Helper to get warning details for a volunteer
  const getWarningFor = (name: string): VolunteerWarning | undefined => {
    return volunteerWarnings.find(w => w.name === name);
  };

  // Calculate comprehensive metrics
  const metrics = useMemo(() => {
    if (!solverResult || volunteerRosters.length === 0) return null;

    const volByName = new Map(volunteers.map(v => [v.name, v]));

    // Per-volunteer satisfaction scores
    // Satisfaction = sum of (6 - rank) for each assigned shift where rank is 1-5
    // Unranked shifts contribute 0
    const volunteerMetrics: Map<string, {
      satisfaction: number;
      avgSatisfaction: number;
      shiftsFromPrefs: number;
      shiftsOutsidePrefs: number;
      totalShifts: number;
      pctFromPrefs: number;
    }> = new Map();

    let totalSatisfaction = 0;
    let totalShiftsFromPrefs = 0;
    let totalShiftsOutsidePrefs = 0;
    const satisfactionScores: number[] = [];
    const avgSatisfactionScores: number[] = [];

    for (const audit of auditData) {
      const vol = volByName.get(audit.volunteer);
      if (!vol) continue;

      let satisfaction = 0;
      let shiftsFromPrefs = 0;
      let shiftsOutsidePrefs = 0;

      for (const shiftId of audit.assignedShifts) {
        const rank = vol.preferences.get(shiftId);
        if (rank !== undefined && rank >= 1 && rank <= 5) {
          satisfaction += 6 - rank; // rank 1 = 5 pts, rank 5 = 1 pt
          shiftsFromPrefs++;
        } else {
          shiftsOutsidePrefs++;
        }
      }

      const totalShifts = audit.numShifts;
      const avgSat = totalShifts > 0 ? satisfaction / totalShifts : 0;
      const pctFromPrefs = totalShifts > 0 ? (shiftsFromPrefs / totalShifts) * 100 : 0;

      volunteerMetrics.set(audit.volunteer, {
        satisfaction,
        avgSatisfaction: avgSat,
        shiftsFromPrefs,
        shiftsOutsidePrefs,
        totalShifts,
        pctFromPrefs
      });

      totalSatisfaction += satisfaction;
      totalShiftsFromPrefs += shiftsFromPrefs;
      totalShiftsOutsidePrefs += shiftsOutsidePrefs;
      satisfactionScores.push(satisfaction);
      avgSatisfactionScores.push(avgSat);
    }

    // Calculate overall stats
    const n = satisfactionScores.length;
    const avgSatisfaction = n > 0 ? totalSatisfaction / n : 0;
    const minSatisfaction = n > 0 ? Math.min(...satisfactionScores) : 0;
    const maxSatisfaction = n > 0 ? Math.max(...satisfactionScores) : 0;

    // Standard deviation of satisfaction
    const variance = n > 0
      ? satisfactionScores.reduce((sum, s) => sum + Math.pow(s - avgSatisfaction, 2), 0) / n
      : 0;
    const stdDevSatisfaction = Math.sqrt(variance);

    // Average satisfaction per shift
    const overallAvgSatPerShift = avgSatisfactionScores.length > 0
      ? avgSatisfactionScores.reduce((a, b) => a + b, 0) / avgSatisfactionScores.length
      : 0;
    const minAvgSatPerShift = avgSatisfactionScores.length > 0 ? Math.min(...avgSatisfactionScores) : 0;
    const maxAvgSatPerShift = avgSatisfactionScores.length > 0 ? Math.max(...avgSatisfactionScores) : 0;

    // Fairness index (1 - normalized std dev, higher = more fair)
    // Normalized by max possible std dev (if one person got all, others got none)
    const maxPossibleStdDev = maxSatisfaction > 0 ? maxSatisfaction : 1;
    const fairnessIndex = Math.max(0, 1 - (stdDevSatisfaction / maxPossibleStdDev));

    // Count volunteers with fallback assignments
    const volunteersWithFallback = [...volunteerMetrics.values()].filter(m => m.shiftsOutsidePrefs > 0).length;
    const volunteersAllFromPrefs = [...volunteerMetrics.values()].filter(m => m.shiftsOutsidePrefs === 0).length;

    // Pct of total assignments from preferences
    const totalAssignmentsCount = totalShiftsFromPrefs + totalShiftsOutsidePrefs;
    const pctAssignmentsFromPrefs = totalAssignmentsCount > 0
      ? (totalShiftsFromPrefs / totalAssignmentsCount) * 100
      : 0;

    // Points distribution
    const pointsArray = volunteerRosters.map(r => r.totalPoints);
    const avgPoints = pointsArray.length > 0 ? pointsArray.reduce((a, b) => a + b, 0) / pointsArray.length : 0;
    const minPoints = pointsArray.length > 0 ? Math.min(...pointsArray) : 0;
    const maxPoints = pointsArray.length > 0 ? Math.max(...pointsArray) : 0;

    // Volunteers meeting minimum (considering preAssignedPoints)
    let volunteersMetMinimum = 0;
    if (settings) {
      for (const roster of volunteerRosters) {
        const vol = volByName.get(roster.name);
        if (!vol) continue;
        const effectiveMin = Math.max(0, settings.minPoints - vol.preAssignedPoints);
        if (roster.totalPoints >= effectiveMin) {
          volunteersMetMinimum++;
        }
      }
    }

    return {
      volunteerMetrics,
      // Satisfaction metrics
      totalSatisfaction,
      avgSatisfaction,
      minSatisfaction,
      maxSatisfaction,
      stdDevSatisfaction,
      overallAvgSatPerShift,
      minAvgSatPerShift,
      maxAvgSatPerShift,
      fairnessIndex,
      // Assignment source metrics
      totalShiftsFromPrefs,
      totalShiftsOutsidePrefs,
      pctAssignmentsFromPrefs,
      volunteersWithFallback,
      volunteersAllFromPrefs,
      // Points metrics
      avgPoints,
      minPoints,
      maxPoints,
      volunteersMetMinimum
    };
  }, [solverResult, volunteerRosters, auditData, volunteers, settings]);

  const rankCounts = [0, 0, 0, 0, 0];
  let volunteersWithTop3 = 0;
  for (const roster of volunteerRosters) {
    let gotTop3 = false;
    for (let i = 0; i < 5; i++) {
      if (roster.rankHits[i] > 0) {
        rankCounts[i]++;
        if (i < 3) gotTop3 = true;
      }
    }
    if (gotTop3) volunteersWithTop3++;
  }

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // ShiftVols sheet
    const shiftVolsData = shiftAssignments.map(s => {
      const row: Record<string, unknown> = {
        ShiftID: s.shiftId,
        Role: s.role,
        Capacity: s.capacity,
        Points: s.points
      };
      s.volunteers.forEach((v, i) => {
        row[`Volunteer${i + 1}`] = v;
      });
      return row;
    });
    const shiftVolsSheet = XLSX.utils.json_to_sheet(shiftVolsData);
    XLSX.utils.book_append_sheet(wb, shiftVolsSheet, 'ShiftVols');

    // Roster sheet
    const shiftById = new Map(shifts.map(s => [s.id, s]));
    const rosterData = volunteerRosters.map(r => {
      const row: Record<string, unknown> = {
        Volunteer: r.name,
        TotalPoints: r.totalPoints,
        NumShifts: r.shifts.length
      };
      r.shifts.forEach((sId, i) => {
        row[`Shift${i + 1}`] = sId;
        const shift = shiftById.get(sId);
        row[`ShiftLabel${i + 1}`] = shift?.jotformLabel || shift?.role || '';
      });
      return row;
    });
    const rosterSheet = XLSX.utils.json_to_sheet(rosterData);
    XLSX.utils.book_append_sheet(wb, rosterSheet, 'Roster');

    // Audit sheet
    const auditSheetData = auditData.map(a => ({
      Volunteer: a.volunteer,
      TotalPoints: a.totalPoints,
      NumShifts: a.numShifts,
      '#1 hits': a.rankHits[1] || 0,
      '#2 hits': a.rankHits[2] || 0,
      '#3 hits': a.rankHits[3] || 0,
      '#4 hits': a.rankHits[4] || 0,
      '#5 hits': a.rankHits[5] || 0,
      AssignedShifts: a.assignedShifts.join('; ')
    }));
    const auditSheet = XLSX.utils.json_to_sheet(auditSheetData);
    XLSX.utils.book_append_sheet(wb, auditSheet, 'Audit');

    // Download
    XLSX.writeFile(wb, 'shift_assignments.xlsx');
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'shifts', label: 'Shift Assignments' },
    { id: 'roster', label: 'Volunteer Rosters' },
    { id: 'audit', label: 'Audit' }
  ];

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Results</h2>
        <div className="flex gap-3">
          <button
            onClick={exportToExcel}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg flex items-center gap-2"
          >
            <span>Download Excel</span>
          </button>
          <button
            onClick={clearData}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
          >
            Start Over
          </button>
        </div>
      </div>

      {/* Status Banner */}
      <div className={`mb-6 p-4 rounded-lg ${
        solverResult?.phase === 1 ? 'bg-green-50 border border-green-200' :
        solverResult?.relaxation ? 'bg-orange-50 border border-orange-200' : 'bg-yellow-50 border border-yellow-200'
      }`}>
        <p className={solverResult?.phase === 1 ? 'text-green-800' : solverResult?.relaxation ? 'text-orange-800' : 'text-yellow-800'}>
          <strong>Status:</strong> {solverResult?.message}
          {solverResult?.phase === 2 && !solverResult?.relaxation && ' (Some shifts required fallback assignments outside of preferences)'}
        </p>
      </div>

      {/* Relaxation Warning Banner */}
      {solverResult?.relaxation && (
        <div className="mb-6 p-4 rounded-lg bg-orange-100 border border-orange-300">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-semibold text-orange-800">Constraints Were Relaxed</h3>
              <p className="text-orange-700 mt-1">
                To fill all shifts, the solver had to relax some constraints:
              </p>
              <ul className="text-orange-700 mt-2 list-disc list-inside space-y-1">
                {solverResult.relaxation.minPointsMultiplier < 1 && (
                  <li>
                    Minimum points reduced to {Math.round(solverResult.relaxation.minPointsMultiplier * 100)}% of target
                    {solverResult.relaxation.minPointsMultiplier === 0 && ' (no minimum enforced)'}
                  </li>
                )}
                {solverResult.relaxation.maxShiftsMultiplier > 1 && (
                  <li>
                    Maximum shifts per person increased to {Math.round(solverResult.relaxation.maxShiftsMultiplier * 100)}% of normal limit
                  </li>
                )}
              </ul>
              {volunteerWarnings.length > 0 && (
                <p className="text-orange-700 mt-2">
                  <strong>{volunteerWarnings.length} volunteer{volunteerWarnings.length !== 1 ? 's' : ''}</strong> affected - see Warnings section below.
                </p>
              )}
              <div className="mt-3 text-sm text-orange-600">
                <strong>Suggestions:</strong> Consider adding more volunteers, reducing minimum points, or checking for too many overlapping shifts.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'summary' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Top row - key stats */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <div className="text-3xl font-bold text-blue-600">{totalAssignments}</div>
            <div className="text-gray-500">Total Assignments</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <div className="text-3xl font-bold text-green-600">{shiftsFullyStaffed}/{shifts.length}</div>
            <div className="text-gray-500">Shifts Fully Staffed</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <div className="text-3xl font-bold text-purple-600">{volunteers.length}</div>
            <div className="text-gray-500">Volunteers Assigned</div>
          </div>
          <div className={`border rounded-lg p-5 shadow-sm ${
            solverResult?.phase === 1
              ? 'bg-green-50 border-green-200'
              : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className={`text-xl font-bold ${
              solverResult?.phase === 1 ? 'text-green-700' : 'text-yellow-700'
            }`}>
              {solverResult?.phase === 1 ? 'Optimal' : 'Fallback Used'}
            </div>
            <div className={`text-sm mt-1 ${
              solverResult?.phase === 1 ? 'text-green-600' : 'text-yellow-600'
            }`}>
              {solverResult?.phase === 1
                ? 'All shifts filled from preferences'
                : 'Some shifts needed non-preferred volunteers'}
            </div>
          </div>

          {/* Fairness Metrics */}
          {metrics && (
            <div className="col-span-full bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-indigo-800 mb-4">Fairness Metrics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-600">
                    {(metrics.fairnessIndex * 100).toFixed(0)}%
                  </div>
                  <div className="text-sm text-gray-600">Fairness Index</div>
                  <div className="text-xs text-gray-400 mt-1">Higher = more equal</div>
                </div>
                <div className="bg-white rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-600">
                    {metrics.overallAvgSatPerShift.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-600">Avg Satisfaction/Shift</div>
                  <div className="text-xs text-gray-400 mt-1">Range: {metrics.minAvgSatPerShift.toFixed(1)} - {metrics.maxAvgSatPerShift.toFixed(1)}</div>
                </div>
                <div className="bg-white rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-600">
                    {metrics.avgSatisfaction.toFixed(1)}
                  </div>
                  <div className="text-sm text-gray-600">Avg Total Satisfaction</div>
                  <div className="text-xs text-gray-400 mt-1">Range: {metrics.minSatisfaction} - {metrics.maxSatisfaction}</div>
                </div>
                <div className="bg-white rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-600">
                    {metrics.stdDevSatisfaction.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-600">Std Dev (Satisfaction)</div>
                  <div className="text-xs text-gray-400 mt-1">Lower = more fair</div>
                </div>
              </div>
            </div>
          )}

          {/* Assignment Sources */}
          {metrics && (
            <div className="col-span-full md:col-span-2 bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Assignment Sources</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">From Preferences (Rank 1-5)</span>
                    <span className="font-medium text-green-600">{metrics.totalShiftsFromPrefs} ({metrics.pctAssignmentsFromPrefs.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${metrics.pctAssignmentsFromPrefs}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Fallback (Outside Preferences)</span>
                    <span className="font-medium text-yellow-600">{metrics.totalShiftsOutsidePrefs} ({(100 - metrics.pctAssignmentsFromPrefs).toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-yellow-500 h-2 rounded-full"
                      style={{ width: `${100 - metrics.pctAssignmentsFromPrefs}%` }}
                    />
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Volunteers with all shifts from prefs:</span>
                    <span className="ml-2 font-medium text-green-600">{metrics.volunteersAllFromPrefs}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Volunteers with fallback shifts:</span>
                    <span className="ml-2 font-medium text-yellow-600">{metrics.volunteersWithFallback}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Points Distribution */}
          {metrics && (
            <div className="col-span-full md:col-span-2 bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Points Distribution</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-700">{metrics.minPoints}</div>
                  <div className="text-sm text-gray-500">Min Points</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{metrics.avgPoints.toFixed(1)}</div>
                  <div className="text-sm text-gray-500">Avg Points</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-700">{metrics.maxPoints}</div>
                  <div className="text-sm text-gray-500">Max Points</div>
                </div>
              </div>
              <div className="pt-3 border-t border-gray-100">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Volunteers meeting minimum target:</span>
                  <span className={`font-medium ${metrics.volunteersMetMinimum === volunteers.length ? 'text-green-600' : 'text-yellow-600'}`}>
                    {metrics.volunteersMetMinimum}/{volunteers.length}
                    {metrics.volunteersMetMinimum === volunteers.length && ' ✓'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Overall Satisfaction */}
          {metrics && (
            <div className="col-span-full bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Overall Satisfaction</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Happiness Score */}
                <div className="text-center">
                  <div className="text-4xl font-bold text-green-600">
                    {Math.round((metrics.overallAvgSatPerShift / 5) * 100)}%
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Happiness Score</div>
                  <div className="text-xs text-gray-400 mt-1">
                    100% = everyone got only #1 picks, 0% = no one got any top-5 picks
                  </div>
                </div>

                {/* Top Choice Stats */}
                <div className="text-center border-l border-r border-gray-100 px-4">
                  <div className="text-4xl font-bold text-blue-600">
                    {volunteers.length > 0 ? Math.round((rankCounts[0] / volunteers.length) * 100) : 0}%
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Got Their #1 Choice</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {rankCounts[0]} of {volunteers.length} volunteers
                  </div>
                </div>

                {/* Top 3 Stats */}
                <div className="text-center">
                  <div className="text-4xl font-bold text-purple-600">
                    {volunteers.length > 0 ? Math.round((volunteersWithTop3 / volunteers.length) * 100) : 0}%
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Got a Top-3 Choice</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {volunteersWithTop3} of {volunteers.length} volunteers
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Warnings Section */}
          {volunteerWarnings.length > 0 && (
            <div className="col-span-full bg-orange-50 border border-orange-200 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-orange-800 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Affected Volunteers ({volunteerWarnings.length})
              </h3>
              <p className="text-sm text-orange-700 mb-4">
                These volunteers have assignments outside the normal constraints due to relaxation:
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-orange-200">
                      <th className="px-3 py-2 text-left text-orange-800">Volunteer</th>
                      <th className="px-3 py-2 text-center text-orange-800">Points</th>
                      <th className="px-3 py-2 text-center text-orange-800">Shifts</th>
                      <th className="px-3 py-2 text-left text-orange-800">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {volunteerWarnings.map((w) => (
                      <tr key={w.name} className="border-b border-orange-100">
                        <td className="px-3 py-2 font-medium text-orange-900">{w.name}</td>
                        <td className={`px-3 py-2 text-center ${w.belowMinPoints ? 'text-red-600 font-bold' : 'text-orange-700'}`}>
                          {w.totalPoints}
                          {w.belowMinPoints && <span className="text-xs ml-1">(min: {w.expectedMinPoints})</span>}
                        </td>
                        <td className={`px-3 py-2 text-center ${w.aboveMaxShifts ? 'text-red-600 font-bold' : 'text-orange-700'}`}>
                          {w.numShifts}
                          {w.aboveMaxShifts && <span className="text-xs ml-1">(max: {w.expectedMaxShifts})</span>}
                        </td>
                        <td className="px-3 py-2 text-orange-700">
                          {w.belowMinPoints && w.aboveMaxShifts
                            ? 'Below min points & above max shifts'
                            : w.belowMinPoints
                            ? 'Below minimum points'
                            : 'Above maximum shifts'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'shifts' && (
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b">Shift ID</th>
                <th className="px-3 py-2 text-left border-b">Role</th>
                <th className="px-3 py-2 text-center border-b">Capacity</th>
                <th className="px-3 py-2 text-center border-b">Filled</th>
                <th className="px-3 py-2 text-center border-b">Points</th>
                <th className="px-3 py-2 text-left border-b">Assigned Volunteers</th>
              </tr>
            </thead>
            <tbody>
              {shiftAssignments.map((s) => (
                <tr key={s.shiftId} className={`hover:bg-gray-50 ${
                  s.volunteers.length < s.capacity ? 'bg-yellow-50' : ''
                }`}>
                  <td className="px-3 py-2 border-b font-mono">{s.shiftId}</td>
                  <td className="px-3 py-2 border-b">{s.role}</td>
                  <td className="px-3 py-2 border-b text-center">{s.capacity}</td>
                  <td className="px-3 py-2 border-b text-center">
                    <span className={s.volunteers.length < s.capacity ? 'text-yellow-600 font-bold' : 'text-green-600'}>
                      {s.volunteers.length}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b text-center">{s.points}</td>
                  <td className="px-3 py-2 border-b">{s.volunteers.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'roster' && (
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b">Volunteer</th>
                <th className="px-3 py-2 text-center border-b">Total Points</th>
                <th className="px-3 py-2 text-center border-b"># Shifts</th>
                <th className="px-3 py-2 text-center border-b">Rank Hits (1-5)</th>
                <th className="px-3 py-2 text-left border-b">Assigned Shifts</th>
              </tr>
            </thead>
            <tbody>
              {volunteerRosters.map((r) => {
                const warning = getWarningFor(r.name);
                const hasWarning = !!warning;
                return (
                <tr key={r.name} className={`hover:bg-gray-50 ${hasWarning ? 'bg-orange-50' : ''}`}>
                  <td className="px-3 py-2 border-b font-medium">
                    {hasWarning && (
                      <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-2" title="Affected by constraint relaxation" />
                    )}
                    {r.name}
                  </td>
                  <td className={`px-3 py-2 border-b text-center ${warning?.belowMinPoints ? 'text-red-600 font-bold' : ''}`}>
                    {r.totalPoints}
                    {warning?.belowMinPoints && (
                      <span className="text-xs text-red-500 ml-1">(min: {warning.expectedMinPoints})</span>
                    )}
                  </td>
                  <td className={`px-3 py-2 border-b text-center ${warning?.aboveMaxShifts ? 'text-red-600 font-bold' : ''}`}>
                    {r.shifts.length}
                    {warning?.aboveMaxShifts && (
                      <span className="text-xs text-red-500 ml-1">(max: {warning.expectedMaxShifts})</span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b text-center font-mono text-xs">
                    {r.rankHits.join(' / ')}
                  </td>
                  <td className="px-3 py-2 border-b text-gray-600 font-mono text-xs">
                    {r.shifts.join(', ')}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="overflow-x-auto">
          {/* Legend */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
            <strong>Satisfaction Score:</strong> Sum of (6 - rank) for each shift from preferences. Rank 1 = 5pts, Rank 2 = 4pts, ..., Rank 5 = 1pt. Unranked = 0pts.
            <span className="ml-4"><strong>Avg/Shift:</strong> Satisfaction ÷ Number of shifts (higher = better quality assignments).</span>
          </div>
          <table className="min-w-full border border-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b">Volunteer</th>
                <th className="px-3 py-2 text-center border-b">Points</th>
                <th className="px-3 py-2 text-center border-b"># Shifts</th>
                <th className="px-3 py-2 text-center border-b bg-indigo-50 border-l border-indigo-200" title="Total satisfaction score">Satisfaction</th>
                <th className="px-3 py-2 text-center border-b bg-indigo-50" title="Average satisfaction per shift">Avg/Shift</th>
                <th className="px-3 py-2 text-center border-b bg-indigo-50 border-r border-indigo-200" title="Percentage of shifts from preferences">% From Prefs</th>
                <th className="px-3 py-2 text-center border-b">#1</th>
                <th className="px-3 py-2 text-center border-b">#2</th>
                <th className="px-3 py-2 text-center border-b">#3</th>
                <th className="px-3 py-2 text-center border-b">#4</th>
                <th className="px-3 py-2 text-center border-b">#5</th>
                <th className="px-3 py-2 text-left border-b">Shifts</th>
              </tr>
            </thead>
            <tbody>
              {auditData.map((a) => {
                const warning = getWarningFor(a.volunteer);
                const hasWarning = !!warning;
                const volMetrics = metrics?.volunteerMetrics.get(a.volunteer);
                return (
                <tr key={a.volunteer} className={`hover:bg-gray-50 ${hasWarning ? 'bg-orange-50' : ''}`}>
                  <td className="px-3 py-2 border-b font-medium">
                    {hasWarning && (
                      <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-2" title="Affected by constraint relaxation" />
                    )}
                    {a.volunteer}
                  </td>
                  <td className={`px-3 py-2 border-b text-center ${warning?.belowMinPoints ? 'text-red-600 font-bold' : ''}`}>
                    {a.totalPoints}
                  </td>
                  <td className={`px-3 py-2 border-b text-center ${warning?.aboveMaxShifts ? 'text-red-600 font-bold' : ''}`}>
                    {a.numShifts}
                  </td>
                  {/* Fairness metrics columns */}
                  <td className="px-3 py-2 border-b text-center bg-indigo-50/50 border-l border-indigo-100 font-medium">
                    {volMetrics?.satisfaction ?? '-'}
                  </td>
                  <td className={`px-3 py-2 border-b text-center bg-indigo-50/50 font-medium ${
                    volMetrics && volMetrics.avgSatisfaction >= 3 ? 'text-green-600' :
                    volMetrics && volMetrics.avgSatisfaction >= 2 ? 'text-blue-600' :
                    volMetrics && volMetrics.avgSatisfaction >= 1 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {volMetrics?.avgSatisfaction.toFixed(2) ?? '-'}
                  </td>
                  <td className={`px-3 py-2 border-b text-center bg-indigo-50/50 border-r border-indigo-100 ${
                    volMetrics && volMetrics.pctFromPrefs === 100 ? 'text-green-600' :
                    volMetrics && volMetrics.pctFromPrefs >= 75 ? 'text-blue-600' :
                    volMetrics && volMetrics.pctFromPrefs >= 50 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {volMetrics ? `${volMetrics.pctFromPrefs.toFixed(0)}%` : '-'}
                  </td>
                  <td className="px-3 py-2 border-b text-center">{a.rankHits[1] || 0}</td>
                  <td className="px-3 py-2 border-b text-center">{a.rankHits[2] || 0}</td>
                  <td className="px-3 py-2 border-b text-center">{a.rankHits[3] || 0}</td>
                  <td className="px-3 py-2 border-b text-center">{a.rankHits[4] || 0}</td>
                  <td className="px-3 py-2 border-b text-center">{a.rankHits[5] || 0}</td>
                  <td className="px-3 py-2 border-b text-gray-600 font-mono text-xs">
                    {a.assignedShifts.join('; ')}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
