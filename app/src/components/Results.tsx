import { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  // Calculate preference distribution histogram data
  // Shows how many assignments came from each rank (total across all volunteers)
  const preferenceHistogram = useMemo(() => {
    const histogram = {
      rank1: 0,
      rank2: 0,
      rank3: 0,
      rank4: 0,
      rank5: 0,
      unranked: 0
    };

    for (const roster of volunteerRosters) {
      histogram.rank1 += roster.rankHits[0];
      histogram.rank2 += roster.rankHits[1];
      histogram.rank3 += roster.rankHits[2];
      histogram.rank4 += roster.rankHits[3];
      histogram.rank5 += roster.rankHits[4];
    }

    // Calculate unranked assignments
    const totalFromRanks = histogram.rank1 + histogram.rank2 + histogram.rank3 + histogram.rank4 + histogram.rank5;
    histogram.unranked = totalAssignments - totalFromRanks;

    return histogram;
  }, [volunteerRosters, totalAssignments]);

  // Calculate satisfaction distribution (how many volunteers at each satisfaction level)
  const satisfactionDistribution = useMemo(() => {
    if (!metrics) return null;

    const buckets: { range: string; count: number; volunteers: string[] }[] = [];
    const volMetrics = Array.from(metrics.volunteerMetrics.entries());

    // Create buckets based on avg satisfaction per shift
    // 4-5: Excellent, 3-4: Good, 2-3: Fair, 1-2: Poor, 0-1: Very Poor
    const excellent: string[] = [];
    const good: string[] = [];
    const fair: string[] = [];
    const poor: string[] = [];
    const veryPoor: string[] = [];

    for (const [name, m] of volMetrics) {
      if (m.avgSatisfaction >= 4) excellent.push(name);
      else if (m.avgSatisfaction >= 3) good.push(name);
      else if (m.avgSatisfaction >= 2) fair.push(name);
      else if (m.avgSatisfaction >= 1) poor.push(name);
      else veryPoor.push(name);
    }

    buckets.push({ range: 'Excellent (4-5)', count: excellent.length, volunteers: excellent });
    buckets.push({ range: 'Good (3-4)', count: good.length, volunteers: good });
    buckets.push({ range: 'Fair (2-3)', count: fair.length, volunteers: fair });
    buckets.push({ range: 'Poor (1-2)', count: poor.length, volunteers: poor });
    buckets.push({ range: 'Very Poor (0-1)', count: veryPoor.length, volunteers: veryPoor });

    return buckets;
  }, [metrics]);

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const shiftById = new Map(shifts.map(s => [s.id, s]));

    // ===== REPORT SHEET - Algorithm Transparency (#006/#007) =====
    const reportData: (string | number)[][] = [
      ['SHIFT SORTING HAT - ASSIGNMENT REPORT'],
      ['Generated: ' + new Date().toLocaleString()],
      [''],
      ['=== ALGORITHM OVERVIEW ==='],
      ['This report was generated using a two-phase optimization algorithm:'],
      [''],
      ['Phase 1: Preference Optimization'],
      ['- Uses binary search to find the highest achievable minimum average satisfaction'],
      ['- Each volunteer is guaranteed to receive shifts that maximize their average happiness'],
      ['- Satisfaction score: Rank 1 = 5 points, Rank 2 = 4 points, ..., Rank 5 = 1 point per shift'],
      [''],
      ['Phase 2: Hard-Fill (if needed)'],
      ['- Ensures all shift slots are filled even if some volunteers must take unpreferred shifts'],
      ['- Maintains fairness constraints while guaranteeing full coverage'],
      [''],
      ['=== SETTINGS USED ==='],
      ['Minimum Points per Volunteer:', settings.minPoints],
      ['Maximum Points Over Minimum:', settings.maxOver],
      ['Maximum Shifts per Volunteer:', settings.maxShifts],
      ['Preference Guarantee Level:', settings.guaranteeLevel > 0 ? `Top ${settings.guaranteeLevel}` : 'None'],
      ['Back-to-Back Shifts:', settings.forbidBackToBack ? 'Forbidden' : 'Minimized'],
      ['Back-to-Back Gap (hours):', settings.backToBackGap],
      ['Constraint Relaxation:', settings.allowRelaxation ? 'Allowed' : 'Disabled'],
      ['Random Seed:', settings.seed],
      [''],
      ['=== RESULT SUMMARY ==='],
      ['Status:', solverResult?.phase === 1 ? 'Optimal (Phase 1)' : 'Feasible (Phase 2)'],
      ['Total Assignments:', totalAssignments],
      ['Shifts Fully Staffed:', `${shiftsFullyStaffed}/${shifts.length}`],
      ['Volunteers Assigned:', volunteers.length],
      [''],
      ['=== FAIRNESS METRICS ==='],
    ];

    if (metrics) {
      reportData.push(
        ['Fairness Index:', `${(metrics.fairnessIndex * 100).toFixed(1)}%`],
        ['Average Satisfaction per Shift:', metrics.overallAvgSatPerShift.toFixed(2)],
        ['Satisfaction Range:', `${metrics.minSatisfaction} - ${metrics.maxSatisfaction}`],
        ['Std Dev (lower = more fair):', metrics.stdDevSatisfaction.toFixed(2)],
        [''],
        ['=== PREFERENCE DISTRIBUTION ==='],
        ['#1 Choices Assigned:', preferenceHistogram.rank1],
        ['#2 Choices Assigned:', preferenceHistogram.rank2],
        ['#3 Choices Assigned:', preferenceHistogram.rank3],
        ['#4 Choices Assigned:', preferenceHistogram.rank4],
        ['#5 Choices Assigned:', preferenceHistogram.rank5],
        ['Unranked (Fallback):', preferenceHistogram.unranked],
        ['% From Preferences:', `${metrics.pctAssignmentsFromPrefs.toFixed(1)}%`],
        [''],
        ['Volunteers with #1 Choice:', rankCounts[0]],
        ['Volunteers with Top 3 Choice:', volunteersWithTop3]
      );
    }

    const reportSheet = XLSX.utils.aoa_to_sheet(reportData);
    reportSheet['!cols'] = [{ wch: 35 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, reportSheet, 'Report');

    // ===== SHIFT ASSIGNMENTS SHEET =====
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
    XLSX.utils.book_append_sheet(wb, shiftVolsSheet, 'ShiftAssignments');

    // ===== ROSTER SHEET =====
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
    XLSX.utils.book_append_sheet(wb, rosterSheet, 'VolunteerRosters');

    // ===== AUDIT SHEET =====
    const auditSheetData = auditData.map(a => {
      const volMetrics = metrics?.volunteerMetrics.get(a.volunteer);
      return {
        Volunteer: a.volunteer,
        TotalPoints: a.totalPoints,
        NumShifts: a.numShifts,
        Satisfaction: volMetrics?.satisfaction ?? 0,
        'Avg/Shift': volMetrics?.avgSatisfaction.toFixed(2) ?? '-',
        '% From Prefs': volMetrics ? `${volMetrics.pctFromPrefs.toFixed(0)}%` : '-',
        '#1 hits': a.rankHits[1] || 0,
        '#2 hits': a.rankHits[2] || 0,
        '#3 hits': a.rankHits[3] || 0,
        '#4 hits': a.rankHits[4] || 0,
        '#5 hits': a.rankHits[5] || 0,
        AssignedShifts: a.assignedShifts.join('; ')
      };
    });
    const auditSheet = XLSX.utils.json_to_sheet(auditSheetData);
    XLSX.utils.book_append_sheet(wb, auditSheet, 'Audit');

    // Download
    XLSX.writeFile(wb, 'shift_assignments.xlsx');
  };

  const exportDailyShiftsPDF = () => {
    const doc = new jsPDF();

    // Get assignment map
    const assignmentMap = new Map<string, string[]>();
    if (solverResult) {
      for (const a of solverResult.assignments) {
        const vols = assignmentMap.get(a.shiftId) || [];
        vols.push(a.volunteerName);
        assignmentMap.set(a.shiftId, vols);
      }
    }

    // Group shifts by date
    const shiftsByDate = new Map<string, typeof shifts>();
    for (const shift of shifts) {
      const existing = shiftsByDate.get(shift.date) || [];
      existing.push(shift);
      shiftsByDate.set(shift.date, existing);
    }

    const sortedDates = Array.from(shiftsByDate.keys()).sort();
    let isFirstPage = true;

    for (const date of sortedDates) {
      if (!isFirstPage) {
        doc.addPage();
      }
      isFirstPage = false;

      const dayShifts = shiftsByDate.get(date)!;
      dayShifts.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

      // Page title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(`Daily Shift Assignments`, 14, 20);

      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text(date, 14, 30);

      // Calculate max volunteers for column headers
      const maxVols = Math.max(...dayShifts.map(s => assignmentMap.get(s.id)?.length || 0), 1);

      // Build table data
      const tableHead = ['Time', 'Role', 'Pts'];
      for (let i = 1; i <= maxVols; i++) {
        tableHead.push(`Vol ${i}`);
      }

      const tableBody = dayShifts.map(s => {
        const assigned = assignmentMap.get(s.id) || [];
        const timeStr = `${s.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${s.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const row: string[] = [timeStr, s.role, s.points.toString()];
        for (let i = 0; i < maxVols; i++) {
          row.push(assigned[i] || '');
        }
        return row;
      });

      autoTable(doc, {
        head: [tableHead],
        body: tableBody,
        startY: 38,
        theme: 'grid',
        headStyles: {
          fillColor: [59, 130, 246], // blue-500
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9
        },
        bodyStyles: {
          fontSize: 8
        },
        columnStyles: {
          0: { cellWidth: 35 }, // Time
          1: { cellWidth: 30 }, // Role
          2: { cellWidth: 12, halign: 'center' }, // Points
        },
        styles: {
          cellPadding: 2,
          overflow: 'linebreak'
        },
        margin: { left: 14, right: 14 }
      });

      // Add summary at bottom
      const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 150;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100);
      doc.text(`${dayShifts.length} shifts | ${dayShifts.reduce((sum, s) => sum + (assignmentMap.get(s.id)?.length || 0), 0)} assignments`, 14, finalY + 8);
    }

    // Add footer to all pages
    const pageCount = doc.getNumberOfPages();
    doc.setFontSize(8);
    doc.setTextColor(128);
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.text(`Generated by Shift Sorting Hat | Page ${i} of ${pageCount}`, 14, doc.internal.pageSize.height - 10);
    }

    doc.save('daily_shifts.pdf');
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
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Results</h2>
        <div className="flex gap-3">
          <button
            onClick={exportToExcel}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Download results .xlsx</span>
          </button>
          <button
            onClick={exportDailyShiftsPDF}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span>Download daily shifts PDF</span>
          </button>
          <button
            onClick={clearData}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            Start Over
          </button>
        </div>
      </div>

      {/* Status Banner */}
      <div className={`mb-6 p-4 rounded-lg ${
        solverResult?.phase === 1 ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800' :
        solverResult?.relaxation ? 'bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800' : 'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800'
      }`}>
        <p className={solverResult?.phase === 1 ? 'text-green-800 dark:text-green-300' : solverResult?.relaxation ? 'text-orange-800 dark:text-orange-300' : 'text-yellow-800 dark:text-yellow-300'}>
          <strong>Status:</strong> {solverResult?.message}
          {solverResult?.phase === 2 && !solverResult?.relaxation && ' (Some shifts required fallback assignments outside of preferences)'}
        </p>
      </div>

      {/* Relaxation Warning Banner */}
      {solverResult?.relaxation && (
        <div className="mb-6 p-4 rounded-lg bg-orange-100 dark:bg-orange-900/40 border border-orange-300 dark:border-orange-700">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-semibold text-orange-800 dark:text-orange-200">Constraints Were Relaxed</h3>
              <p className="text-orange-700 dark:text-orange-300 mt-1">
                To fill all shifts, the solver had to relax some constraints:
              </p>
              <ul className="text-orange-700 dark:text-orange-300 mt-2 list-disc list-inside space-y-1">
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
                <p className="text-orange-700 dark:text-orange-300 mt-2">
                  <strong>{volunteerWarnings.length} volunteer{volunteerWarnings.length !== 1 ? 's' : ''}</strong> affected - see Warnings section below.
                </p>
              )}
              <div className="mt-3 text-sm text-orange-600 dark:text-orange-400">
                <strong>Suggestions:</strong> Consider adding more volunteers, reducing minimum points, or checking for too many overlapping shifts.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
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
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 shadow-sm">
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{totalAssignments}</div>
            <div className="text-gray-500 dark:text-gray-400">Total Assignments</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 shadow-sm">
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">{shiftsFullyStaffed}/{shifts.length}</div>
            <div className="text-gray-500 dark:text-gray-400">Shifts Fully Staffed</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 shadow-sm">
            <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{volunteers.length}</div>
            <div className="text-gray-500 dark:text-gray-400">Volunteers Assigned</div>
          </div>
          <div className={`border rounded-lg p-5 shadow-sm ${
            solverResult?.phase === 1
              ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800'
              : 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800'
          }`}>
            <div className={`text-xl font-bold ${
              solverResult?.phase === 1 ? 'text-green-700 dark:text-green-300' : 'text-yellow-700 dark:text-yellow-300'
            }`}>
              {solverResult?.phase === 1 ? 'Optimal' : 'Fallback Used'}
            </div>
            <div className={`text-sm mt-1 ${
              solverResult?.phase === 1 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
            }`}>
              {solverResult?.phase === 1
                ? 'All shifts filled from preferences'
                : 'Some shifts needed non-preferred volunteers'}
            </div>
          </div>

          {/* Fairness Metrics */}
          {metrics && (
            <div className="col-span-full bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-indigo-800 dark:text-indigo-200 mb-4">Fairness Metrics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {(metrics.fairnessIndex * 100).toFixed(0)}%
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Fairness Index</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Higher = more equal</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {metrics.overallAvgSatPerShift.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Avg Satisfaction/Shift</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Range: {metrics.minAvgSatPerShift.toFixed(1)} - {metrics.maxAvgSatPerShift.toFixed(1)}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {metrics.avgSatisfaction.toFixed(1)}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Avg Total Satisfaction</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Range: {metrics.minSatisfaction} - {metrics.maxSatisfaction}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {metrics.stdDevSatisfaction.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Std Dev (Satisfaction)</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Lower = more fair</div>
                </div>
              </div>
            </div>
          )}

          {/* Assignment Sources */}
          {metrics && (
            <div className="col-span-full md:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">Assignment Sources</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">From Preferences (Rank 1-5)</span>
                    <span className="font-medium text-green-600 dark:text-green-400">{metrics.totalShiftsFromPrefs} ({metrics.pctAssignmentsFromPrefs.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${metrics.pctAssignmentsFromPrefs}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Fallback (Outside Preferences)</span>
                    <span className="font-medium text-yellow-600 dark:text-yellow-400">{metrics.totalShiftsOutsidePrefs} ({(100 - metrics.pctAssignmentsFromPrefs).toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-yellow-500 h-2 rounded-full"
                      style={{ width: `${100 - metrics.pctAssignmentsFromPrefs}%` }}
                    />
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100 dark:border-gray-700 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Volunteers with all shifts from prefs:</span>
                    <span className="ml-2 font-medium text-green-600 dark:text-green-400">{metrics.volunteersAllFromPrefs}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Volunteers with fallback shifts:</span>
                    <span className="ml-2 font-medium text-yellow-600 dark:text-yellow-400">{metrics.volunteersWithFallback}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Points Distribution */}
          {metrics && (
            <div className="col-span-full md:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">Points Distribution</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">{metrics.minPoints}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Min Points</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{metrics.avgPoints.toFixed(1)}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Avg Points</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">{metrics.maxPoints}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Max Points</div>
                </div>
              </div>
              <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Volunteers meeting minimum target:</span>
                  <span className={`font-medium ${metrics.volunteersMetMinimum === volunteers.length ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                    {metrics.volunteersMetMinimum}/{volunteers.length}
                    {metrics.volunteersMetMinimum === volunteers.length && ' ✓'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Overall Satisfaction */}
          {metrics && (
            <div className="col-span-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">Overall Satisfaction</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Happiness Score */}
                <div className="text-center">
                  <div className="text-4xl font-bold text-green-600 dark:text-green-400">
                    {Math.round((metrics.overallAvgSatPerShift / 5) * 100)}%
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Happiness Score</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    100% = everyone got only #1 picks, 0% = no one got any top-5 picks
                  </div>
                </div>

                {/* Top Choice Stats */}
                <div className="text-center border-l border-r border-gray-100 dark:border-gray-700 px-4">
                  <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                    {volunteers.length > 0 ? Math.round((rankCounts[0] / volunteers.length) * 100) : 0}%
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Got Their #1 Choice</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {rankCounts[0]} of {volunteers.length} volunteers
                  </div>
                </div>

                {/* Top 3 Stats */}
                <div className="text-center">
                  <div className="text-4xl font-bold text-purple-600 dark:text-purple-400">
                    {volunteers.length > 0 ? Math.round((volunteersWithTop3 / volunteers.length) * 100) : 0}%
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Got a Top-3 Choice</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {volunteersWithTop3} of {volunteers.length} volunteers
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preference Distribution Histogram (#001) */}
          {metrics && (
            <div className="col-span-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">Preference Distribution</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Distribution of all {totalAssignments} assignments by preference rank. Higher concentration in #1-#3 indicates better overall match quality.
              </p>
              <div className="space-y-3">
                {[
                  { label: '#1 Choice', value: preferenceHistogram.rank1, color: 'bg-emerald-500' },
                  { label: '#2 Choice', value: preferenceHistogram.rank2, color: 'bg-green-500' },
                  { label: '#3 Choice', value: preferenceHistogram.rank3, color: 'bg-lime-500' },
                  { label: '#4 Choice', value: preferenceHistogram.rank4, color: 'bg-yellow-500' },
                  { label: '#5 Choice', value: preferenceHistogram.rank5, color: 'bg-orange-500' },
                  { label: 'Unranked', value: preferenceHistogram.unranked, color: 'bg-gray-400' },
                ].map((item) => {
                  const pct = totalAssignments > 0 ? (item.value / totalAssignments) * 100 : 0;
                  return (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className="w-24 text-sm font-medium text-gray-600 dark:text-gray-400">{item.label}</div>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
                        <div
                          className={`${item.color} h-6 rounded-full flex items-center justify-end pr-2 transition-all duration-500`}
                          style={{ width: `${Math.max(pct, item.value > 0 ? 8 : 0)}%` }}
                        >
                          {pct >= 10 && (
                            <span className="text-xs font-medium text-white">{item.value}</span>
                          )}
                        </div>
                      </div>
                      <div className="w-20 text-right text-sm text-gray-600 dark:text-gray-400">
                        {item.value} ({pct.toFixed(1)}%)
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {((preferenceHistogram.rank1 + preferenceHistogram.rank2 + preferenceHistogram.rank3) / totalAssignments * 100).toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Top 3 Choices</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {(((preferenceHistogram.rank1 + preferenceHistogram.rank2 + preferenceHistogram.rank3 + preferenceHistogram.rank4 + preferenceHistogram.rank5) / totalAssignments) * 100).toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">From Preferences</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                    {(preferenceHistogram.unranked / totalAssignments * 100).toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Fallback</div>
                </div>
              </div>
            </div>
          )}

          {/* Satisfaction Distribution Histogram (#001) */}
          {satisfactionDistribution && (
            <div className="col-span-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">Volunteer Satisfaction Distribution</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                How volunteers are distributed by their average satisfaction per shift. Identifies if certain volunteers consistently get worse assignments.
              </p>
              <div className="grid grid-cols-5 gap-2">
                {satisfactionDistribution.map((bucket, idx) => {
                  const maxCount = Math.max(...satisfactionDistribution.map(b => b.count), 1);
                  const heightPct = (bucket.count / maxCount) * 100;
                  const colors = [
                    'bg-emerald-500 hover:bg-emerald-600',
                    'bg-green-500 hover:bg-green-600',
                    'bg-yellow-500 hover:bg-yellow-600',
                    'bg-orange-500 hover:bg-orange-600',
                    'bg-red-500 hover:bg-red-600'
                  ];
                  return (
                    <div key={idx} className="flex flex-col items-center">
                      <div className="h-32 w-full flex items-end justify-center">
                        <div
                          className={`w-full max-w-16 ${colors[idx]} rounded-t transition-all duration-500 cursor-pointer group relative`}
                          style={{ height: `${Math.max(heightPct, bucket.count > 0 ? 10 : 0)}%` }}
                          title={bucket.volunteers.length > 0 ? bucket.volunteers.join(', ') : 'No volunteers'}
                        >
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-sm font-bold text-gray-700 dark:text-gray-300">
                            {bucket.count}
                          </div>
                          {/* Tooltip with volunteer names */}
                          {bucket.volunteers.length > 0 && (
                            <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10 w-48 max-h-32 overflow-y-auto">
                              <div className="font-semibold mb-1">{bucket.range}</div>
                              {bucket.volunteers.map(v => (
                                <div key={v} className="text-gray-300">{v}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 text-center leading-tight">
                        {bucket.range.split(' ')[0]}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        {bucket.range.match(/\([\d-]+\)/)?.[0]}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 text-center">
                Hover over bars to see volunteer names. Avg satisfaction: Rank 1 = 5pts, Rank 2 = 4pts, ..., Rank 5 = 1pt per shift.
              </div>
            </div>
          )}

          {/* Warnings Section */}
          {volunteerWarnings.length > 0 && (
            <div className="col-span-full bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-200 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Affected Volunteers ({volunteerWarnings.length})
              </h3>
              <p className="text-sm text-orange-700 dark:text-orange-300 mb-4">
                These volunteers have assignments outside the normal constraints due to relaxation:
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-orange-200 dark:border-orange-700">
                      <th className="px-3 py-2 text-left text-orange-800 dark:text-orange-200">Volunteer</th>
                      <th className="px-3 py-2 text-center text-orange-800 dark:text-orange-200">Points</th>
                      <th className="px-3 py-2 text-center text-orange-800 dark:text-orange-200">Shifts</th>
                      <th className="px-3 py-2 text-left text-orange-800 dark:text-orange-200">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {volunteerWarnings.map((w) => (
                      <tr key={w.name} className="border-b border-orange-100 dark:border-orange-800">
                        <td className="px-3 py-2 font-medium text-orange-900 dark:text-orange-100">{w.name}</td>
                        <td className={`px-3 py-2 text-center ${w.belowMinPoints ? 'text-red-600 dark:text-red-400 font-bold' : 'text-orange-700 dark:text-orange-300'}`}>
                          {w.totalPoints}
                          {w.belowMinPoints && <span className="text-xs ml-1">(min: {w.expectedMinPoints})</span>}
                        </td>
                        <td className={`px-3 py-2 text-center ${w.aboveMaxShifts ? 'text-red-600 dark:text-red-400 font-bold' : 'text-orange-700 dark:text-orange-300'}`}>
                          {w.numShifts}
                          {w.aboveMaxShifts && <span className="text-xs ml-1">(max: {w.expectedMaxShifts})</span>}
                        </td>
                        <td className="px-3 py-2 text-orange-700 dark:text-orange-300">
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
          <table className="min-w-full border border-gray-200 dark:border-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-3 py-2 text-left border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">Shift ID</th>
                <th className="px-3 py-2 text-left border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">Role</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">Capacity</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">Filled</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">Points</th>
                <th className="px-3 py-2 text-left border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">Assigned Volunteers</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {shiftAssignments.map((s) => (
                <tr key={s.shiftId} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  s.volunteers.length < s.capacity ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''
                }`}>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-mono text-gray-800 dark:text-gray-200">{s.shiftId}</td>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">{s.role}</td>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center text-gray-700 dark:text-gray-300">{s.capacity}</td>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center">
                    <span className={s.volunteers.length < s.capacity ? 'text-yellow-600 dark:text-yellow-400 font-bold' : 'text-green-600 dark:text-green-400'}>
                      {s.volunteers.length}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center text-gray-700 dark:text-gray-300">{s.points}</td>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">{s.volunteers.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'roster' && (
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 dark:border-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-3 py-2 text-left border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">Volunteer</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">Total Points</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300"># Shifts</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">Rank Hits (1-5)</th>
                <th className="px-3 py-2 text-left border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">Assigned Shifts</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {volunteerRosters.map((r) => {
                const warning = getWarningFor(r.name);
                const hasWarning = !!warning;
                return (
                <tr key={r.name} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${hasWarning ? 'bg-orange-50 dark:bg-orange-900/20' : ''}`}>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-medium text-gray-800 dark:text-gray-200">
                    {hasWarning && (
                      <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-2" title="Affected by constraint relaxation" />
                    )}
                    {r.name}
                  </td>
                  <td className={`px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center ${warning?.belowMinPoints ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                    {r.totalPoints}
                    {warning?.belowMinPoints && (
                      <span className="text-xs text-red-500 dark:text-red-400 ml-1">(min: {warning.expectedMinPoints})</span>
                    )}
                  </td>
                  <td className={`px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center ${warning?.aboveMaxShifts ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                    {r.shifts.length}
                    {warning?.aboveMaxShifts && (
                      <span className="text-xs text-red-500 dark:text-red-400 ml-1">(max: {warning.expectedMaxShifts})</span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center font-mono text-xs text-gray-700 dark:text-gray-300">
                    {r.rankHits.join(' / ')}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-mono text-xs">
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
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300">
            <strong>Satisfaction Score:</strong> Sum of (6 - rank) for each shift from preferences. Rank 1 = 5pts, Rank 2 = 4pts, ..., Rank 5 = 1pt. Unranked = 0pts.
            <span className="ml-4"><strong>Avg/Shift:</strong> Satisfaction ÷ Number of shifts (higher = better quality assignments).</span>
          </div>
          <table className="min-w-full border border-gray-200 dark:border-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-3 py-2 text-left border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">Volunteer</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">Points</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300"># Shifts</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 bg-indigo-50 dark:bg-indigo-900/30 border-l border-indigo-200 dark:border-indigo-700 text-gray-700 dark:text-gray-300" title="Total satisfaction score">Satisfaction</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 bg-indigo-50 dark:bg-indigo-900/30 text-gray-700 dark:text-gray-300" title="Average satisfaction per shift">Avg/Shift</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 bg-indigo-50 dark:bg-indigo-900/30 border-r border-indigo-200 dark:border-indigo-700 text-gray-700 dark:text-gray-300" title="Percentage of shifts from preferences">% From Prefs</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">#1</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">#2</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">#3</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">#4</th>
                <th className="px-3 py-2 text-center border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">#5</th>
                <th className="px-3 py-2 text-left border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">Shifts</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {auditData.map((a) => {
                const warning = getWarningFor(a.volunteer);
                const hasWarning = !!warning;
                const volMetrics = metrics?.volunteerMetrics.get(a.volunteer);
                return (
                <tr key={a.volunteer} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${hasWarning ? 'bg-orange-50 dark:bg-orange-900/20' : ''}`}>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-medium text-gray-800 dark:text-gray-200">
                    {hasWarning && (
                      <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-2" title="Affected by constraint relaxation" />
                    )}
                    {a.volunteer}
                  </td>
                  <td className={`px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center ${warning?.belowMinPoints ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                    {a.totalPoints}
                  </td>
                  <td className={`px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center ${warning?.aboveMaxShifts ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                    {a.numShifts}
                  </td>
                  {/* Fairness metrics columns */}
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center bg-indigo-50/50 dark:bg-indigo-900/20 border-l border-indigo-100 dark:border-indigo-800 font-medium text-gray-800 dark:text-gray-200">
                    {volMetrics?.satisfaction ?? '-'}
                  </td>
                  <td className={`px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center bg-indigo-50/50 dark:bg-indigo-900/20 font-medium ${
                    volMetrics && volMetrics.avgSatisfaction >= 3 ? 'text-green-600 dark:text-green-400' :
                    volMetrics && volMetrics.avgSatisfaction >= 2 ? 'text-blue-600 dark:text-blue-400' :
                    volMetrics && volMetrics.avgSatisfaction >= 1 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {volMetrics?.avgSatisfaction.toFixed(2) ?? '-'}
                  </td>
                  <td className={`px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center bg-indigo-50/50 dark:bg-indigo-900/20 border-r border-indigo-100 dark:border-indigo-800 ${
                    volMetrics && volMetrics.pctFromPrefs === 100 ? 'text-green-600 dark:text-green-400' :
                    volMetrics && volMetrics.pctFromPrefs >= 75 ? 'text-blue-600 dark:text-blue-400' :
                    volMetrics && volMetrics.pctFromPrefs >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {volMetrics ? `${volMetrics.pctFromPrefs.toFixed(0)}%` : '-'}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center text-gray-700 dark:text-gray-300">{a.rankHits[1] || 0}</td>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center text-gray-700 dark:text-gray-300">{a.rankHits[2] || 0}</td>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center text-gray-700 dark:text-gray-300">{a.rankHits[3] || 0}</td>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center text-gray-700 dark:text-gray-300">{a.rankHits[4] || 0}</td>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-center text-gray-700 dark:text-gray-300">{a.rankHits[5] || 0}</td>
                  <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-mono text-xs">
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
