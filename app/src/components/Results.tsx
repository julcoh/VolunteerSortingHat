import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import * as XLSX from 'xlsx';

type Tab = 'shifts' | 'roster' | 'audit' | 'summary';

export function Results() {
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const {
    shifts,
    volunteers,
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

  const rankCounts = [0, 0, 0, 0, 0];
  for (const roster of volunteerRosters) {
    for (let i = 0; i < 5; i++) {
      if (roster.rankHits[i] > 0) {
        rankCounts[i]++;
      }
    }
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
        solverResult?.phase === 1 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
      }`}>
        <p className={solverResult?.phase === 1 ? 'text-green-800' : 'text-yellow-800'}>
          <strong>Status:</strong> {solverResult?.message}
          {solverResult?.phase === 2 && ' (Some shifts required fallback assignments outside of preferences)'}
        </p>
      </div>

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
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <div className="text-3xl font-bold text-orange-600">Phase {solverResult?.phase}</div>
            <div className="text-gray-500">Solution Phase</div>
          </div>

          {/* Preference Satisfaction */}
          <div className="col-span-full bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Preference Satisfaction</h3>
            <p className="text-sm text-gray-500 mb-4">Number of volunteers who got at least one shift at each rank:</p>
            <div className="flex gap-4">
              {rankCounts.map((count, i) => (
                <div key={i} className="flex-1 text-center">
                  <div className="text-2xl font-bold" style={{
                    color: i === 0 ? '#22c55e' : i === 1 ? '#84cc16' : i === 2 ? '#eab308' : i === 3 ? '#f97316' : '#ef4444'
                  }}>
                    {count}
                  </div>
                  <div className="text-sm text-gray-500">Rank {i + 1}</div>
                  <div className="text-xs text-gray-400">
                    ({volunteers.length > 0 ? Math.round(count / volunteers.length * 100) : 0}%)
                  </div>
                </div>
              ))}
            </div>
          </div>
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
              {volunteerRosters.map((r) => (
                <tr key={r.name} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border-b font-medium">{r.name}</td>
                  <td className="px-3 py-2 border-b text-center">{r.totalPoints}</td>
                  <td className="px-3 py-2 border-b text-center">{r.shifts.length}</td>
                  <td className="px-3 py-2 border-b text-center font-mono text-xs">
                    {r.rankHits.join(' / ')}
                  </td>
                  <td className="px-3 py-2 border-b text-gray-600 font-mono text-xs">
                    {r.shifts.join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b">Volunteer</th>
                <th className="px-3 py-2 text-center border-b">Points</th>
                <th className="px-3 py-2 text-center border-b">#1</th>
                <th className="px-3 py-2 text-center border-b">#2</th>
                <th className="px-3 py-2 text-center border-b">#3</th>
                <th className="px-3 py-2 text-center border-b">#4</th>
                <th className="px-3 py-2 text-center border-b">#5</th>
                <th className="px-3 py-2 text-left border-b">Shifts</th>
              </tr>
            </thead>
            <tbody>
              {auditData.map((a) => (
                <tr key={a.volunteer} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border-b font-medium">{a.volunteer}</td>
                  <td className="px-3 py-2 border-b text-center">{a.totalPoints}</td>
                  <td className="px-3 py-2 border-b text-center">{a.rankHits[1] || 0}</td>
                  <td className="px-3 py-2 border-b text-center">{a.rankHits[2] || 0}</td>
                  <td className="px-3 py-2 border-b text-center">{a.rankHits[3] || 0}</td>
                  <td className="px-3 py-2 border-b text-center">{a.rankHits[4] || 0}</td>
                  <td className="px-3 py-2 border-b text-center">{a.rankHits[5] || 0}</td>
                  <td className="px-3 py-2 border-b text-gray-600 font-mono text-xs">
                    {a.assignedShifts.join('; ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
