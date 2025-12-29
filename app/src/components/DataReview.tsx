import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { solveShiftAssignment } from '../lib/solver/shiftSolver';

export function DataReview() {
  const {
    shifts,
    volunteers,
    settings,
    updateSettings,
    updateVolunteer,
    updateShift,
    parseWarnings,
    setStep,
    clearData,
    setSolverStatus,
    addSolverProgress,
    clearSolverProgress,
    setSolverResult
  } = useAppStore();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAllShifts, setShowAllShifts] = useState(false);
  const [showAllVolunteers, setShowAllVolunteers] = useState(false);

  const totalCapacity = shifts.reduce((sum, s) => sum + s.capacity, 0);
  const totalPoints = shifts.reduce((sum, s) => sum + s.capacity * s.points, 0);
  const requiredPoints = volunteers.length * settings.minPoints;

  const prefsCount = volunteers.reduce((sum, v) => sum + v.preferences.size, 0);
  const avgPrefs = volunteers.length > 0 ? (prefsCount / volunteers.length).toFixed(1) : 0;

  const handleSolve = async () => {
    setStep('solving');
    setSolverStatus('running');
    clearSolverProgress();

    try {
      const result = await solveShiftAssignment({
        shifts,
        volunteers,
        settings,
        onProgress: (msg) => addSolverProgress(msg)
      });
      setSolverResult(result);
    } catch (error) {
      setSolverResult({
        status: 'error',
        phase: 1,
        assignments: [],
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Helper to show if a value differs from recommended
  const isModified = (value: number, recommended: number) =>
    Math.abs(value - recommended) > 0.01;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Review Data</h2>
        <button
          onClick={clearData}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
        >
          Start Over
        </button>
      </div>

      {parseWarnings.length > 0 && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-yellow-800 font-semibold mb-2">Warnings:</h3>
          <ul className="list-disc list-inside text-yellow-700 text-sm">
            {parseWarnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Shifts Summary */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Shifts</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Total shifts:</span>
              <span className="font-medium">{shifts.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total slots:</span>
              <span className="font-medium">{totalCapacity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total points available:</span>
              <span className="font-medium">{totalPoints}</span>
            </div>
          </div>
        </div>

        {/* Volunteers Summary */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Volunteers</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Total volunteers:</span>
              <span className="font-medium">{volunteers.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Avg preferences/person:</span>
              <span className="font-medium">{avgPrefs}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Points per person:</span>
              <span className="font-medium">{settings.minPoints} - {settings.minPoints + settings.maxOver}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Auto-Detected Settings Summary */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="text-blue-500 mt-0.5">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-blue-800 font-medium">Settings auto-configured based on your data</p>
            <p className="text-blue-700 text-sm mt-1">
              Each volunteer will work <strong>{settings.minPoints}-{settings.minPoints + settings.maxOver} points</strong>
              {settings.guaranteeLevel > 0
                ? <> and receive at least one of their <strong>top {settings.guaranteeLevel} preferences</strong></>
                : <> with no specific preference guarantee</>
              }.
              {settings.forbidBackToBack
                ? " Back-to-back shifts are forbidden."
                : " Back-to-back shifts are minimized but allowed if necessary."}
            </p>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      <div className="mb-8 bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-700">Optimization Settings</h3>
          <p className="text-sm text-gray-500 mt-1">Settings are auto-detected from your data. Adjust in Advanced if needed.</p>
        </div>

        <div className="p-5">
          {/* Back-to-Back Toggle - Main visible setting */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Back-to-Back Shifts
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Shifts that start within {settings.backToBackGap} hours after another ends.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="forbidBackToBack"
                  checked={!settings.forbidBackToBack}
                  onChange={() => updateSettings({ forbidBackToBack: false })}
                  className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Minimize</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="forbidBackToBack"
                  checked={settings.forbidBackToBack}
                  onChange={() => updateSettings({ forbidBackToBack: true })}
                  className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Forbid</span>
              </label>
            </div>
          </div>
        </div>

        {/* Advanced Settings Toggle */}
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-5 py-3 flex items-center justify-between text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium">Advanced Settings</span>
            <svg
              className={`w-5 h-5 transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAdvanced && (
            <div className="px-5 pb-5 pt-2 bg-gray-50 space-y-6">
              {/* Preference Guarantee */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div className="md:col-span-2">
                  <label htmlFor="guaranteeLevel" className="block text-sm font-medium text-gray-700">
                    Preference Guarantee
                    {isModified(settings.guaranteeLevel, settings.detectedGuarantee) && (
                      <span className="ml-2 text-xs text-amber-600">(modified)</span>
                    )}
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    Every volunteer receives at least one shift from their top N preferences.
                    {settings.detectedGuarantee > 0 && (
                      <span className="block mt-1 text-blue-600">
                        Recommended: <strong>Top {settings.detectedGuarantee}</strong> (strongest achievable)
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <select
                    id="guaranteeLevel"
                    value={settings.guaranteeLevel}
                    onChange={(e) => updateSettings({ guaranteeLevel: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={1}>Top 1</option>
                    <option value={2}>Top 2</option>
                    <option value={3}>Top 3</option>
                    <option value={4}>Top 4</option>
                    <option value={5}>Top 5</option>
                    <option value={0}>Any (no guarantee)</option>
                  </select>
                </div>
              </div>

              {/* Min Points */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div className="md:col-span-2">
                  <label htmlFor="minPoints" className="block text-sm font-medium text-gray-700">
                    Minimum Points per Volunteer
                    {isModified(settings.minPoints, settings.detectedMinPoints.recommended) && (
                      <span className="ml-2 text-xs text-amber-600">(modified)</span>
                    )}
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    The minimum workload each volunteer must be assigned.
                    <span className="block mt-1 text-blue-600">
                      Recommended: <strong>{settings.detectedMinPoints.recommended}</strong> (fair share based on {volunteers.length} volunteers, {totalPoints} total points)
                    </span>
                  </p>
                </div>
                <div>
                  <input
                    type="number"
                    id="minPoints"
                    min={settings.detectedMinPoints.min}
                    max={settings.detectedMinPoints.max}
                    step="0.5"
                    value={settings.minPoints}
                    onChange={(e) => updateSettings({ minPoints: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Max Over */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div className="md:col-span-2">
                  <label htmlFor="maxOver" className="block text-sm font-medium text-gray-700">
                    Maximum Points Over Minimum
                    {isModified(settings.maxOver, settings.detectedMaxOver.recommended) && (
                      <span className="ml-2 text-xs text-amber-600">(modified)</span>
                    )}
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    How many points above minimum a volunteer can be assigned.
                    <span className="block mt-1 text-blue-600">
                      Recommended: <strong>{settings.detectedMaxOver.recommended}</strong> (allows flexibility while keeping workloads fair)
                    </span>
                  </p>
                </div>
                <div>
                  <input
                    type="number"
                    id="maxOver"
                    min={settings.detectedMaxOver.min}
                    max={settings.detectedMaxOver.max}
                    step="0.5"
                    value={settings.maxOver}
                    onChange={(e) => updateSettings({ maxOver: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Max Shifts */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div className="md:col-span-2">
                  <label htmlFor="maxShifts" className="block text-sm font-medium text-gray-700">
                    Maximum Shifts per Volunteer
                    {isModified(settings.maxShifts, settings.detectedMaxShifts.recommended) && (
                      <span className="ml-2 text-xs text-amber-600">(modified)</span>
                    )}
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    Maximum number of individual shifts any volunteer can work.
                    <span className="block mt-1 text-blue-600">
                      Recommended: <strong>{settings.detectedMaxShifts.recommended}</strong>
                    </span>
                  </p>
                </div>
                <div>
                  <input
                    type="number"
                    id="maxShifts"
                    min={settings.detectedMaxShifts.min}
                    max={settings.detectedMaxShifts.max}
                    step="1"
                    value={settings.maxShifts}
                    onChange={(e) => updateSettings({ maxShifts: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Back-to-Back Gap */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div className="md:col-span-2">
                  <label htmlFor="backToBackGap" className="block text-sm font-medium text-gray-700">
                    Back-to-Back Gap (hours)
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    Two shifts are "back-to-back" if the second starts within this many hours after the first ends.
                  </p>
                </div>
                <div>
                  <input
                    type="number"
                    id="backToBackGap"
                    min="0"
                    max="12"
                    step="0.5"
                    value={settings.backToBackGap}
                    onChange={(e) => updateSettings({ backToBackGap: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Allow Relaxation */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start border-t border-gray-200 pt-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Allow Constraint Relaxation
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    If enabled, the solver can relax min/max constraints to fill all shifts.
                    <span className="block mt-1 text-amber-600">
                      <strong>Recommended: OFF</strong> — Keeps workloads fair. If disabled and shifts can't all be filled, the solver will fail rather than assign unfair workloads.
                    </span>
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => updateSettings({ allowRelaxation: !settings.allowRelaxation })}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      settings.allowRelaxation ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.allowRelaxation ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`ml-3 text-sm font-medium ${settings.allowRelaxation ? 'text-blue-600' : 'text-gray-500'}`}>
                    {settings.allowRelaxation ? 'On' : 'Off'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Feasibility Check */}
      <div className={`mb-8 p-4 rounded-lg ${totalPoints >= requiredPoints ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        {totalPoints >= requiredPoints ? (
          <p className="text-green-800">
            <span className="font-semibold">Feasibility check passed:</span> There are enough shift points available ({totalPoints}) to meet everyone's minimum requirements ({requiredPoints}).
          </p>
        ) : (
          <p className="text-red-800">
            <span className="font-semibold">Warning:</span> Total available points ({totalPoints}) may not be enough to meet everyone's minimum ({requiredPoints}). The solver may not find a solution.
          </p>
        )}
      </div>

      {/* Shifts Table - Editable */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-700">Shifts</h3>
          <span className="text-xs text-gray-500">Click capacity or points to edit</span>
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b font-medium text-gray-600">ID</th>
                <th className="px-3 py-2 text-left border-b font-medium text-gray-600">Date</th>
                <th className="px-3 py-2 text-left border-b font-medium text-gray-600">Role</th>
                <th className="px-3 py-2 text-left border-b font-medium text-gray-600">Time</th>
                <th className="px-3 py-2 text-center border-b font-medium text-gray-600">Capacity</th>
                <th className="px-3 py-2 text-center border-b font-medium text-gray-600">Points</th>
              </tr>
            </thead>
            <tbody>
              {(showAllShifts ? shifts : shifts.slice(0, 10)).map((shift) => (
                <tr key={shift.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border-b font-mono text-gray-700">{shift.id}</td>
                  <td className="px-3 py-2 border-b text-gray-600">{shift.date}</td>
                  <td className="px-3 py-2 border-b text-gray-600">{shift.role}</td>
                  <td className="px-3 py-2 border-b text-gray-600">
                    {shift.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                    {shift.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-1 border-b text-center">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={shift.capacity}
                      onChange={(e) => updateShift(shift.id, { capacity: parseInt(e.target.value) || 1 })}
                      className="w-16 px-2 py-1 text-center border border-gray-200 rounded hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-1 border-b text-center">
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      value={shift.points}
                      onChange={(e) => updateShift(shift.id, { points: parseFloat(e.target.value) || 0 })}
                      className="w-16 px-2 py-1 text-center border border-gray-200 rounded hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shifts.length > 10 && (
          <button
            onClick={() => setShowAllShifts(!showAllShifts)}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800"
          >
            {showAllShifts ? 'Show less' : `Show all ${shifts.length} shifts`}
          </button>
        )}
      </div>

      {/* Volunteers Table - Editable */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-700">Volunteers</h3>
          <span className="text-xs text-gray-500">Pre-assigned points reduce their minimum requirement</span>
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b font-medium text-gray-600">Name</th>
                <th className="px-3 py-2 text-center border-b font-medium text-gray-600">Pre-Assigned Pts</th>
                <th className="px-3 py-2 text-center border-b font-medium text-gray-600">Effective Min</th>
                <th className="px-3 py-2 text-center border-b font-medium text-gray-600"># Prefs</th>
                <th className="px-3 py-2 text-left border-b font-medium text-gray-600">Top Picks</th>
              </tr>
            </thead>
            <tbody>
              {(showAllVolunteers ? volunteers : volunteers.slice(0, 10)).map((vol) => {
                const sortedPrefs = Array.from(vol.preferences.entries())
                  .sort((a, b) => a[1] - b[1])
                  .slice(0, 3);
                const effectiveMin = Math.max(0, settings.minPoints - vol.preAssignedPoints);
                return (
                  <tr key={vol.name} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-b text-gray-700">{vol.name}</td>
                    <td className="px-3 py-1 border-b text-center">
                      <input
                        type="number"
                        min="0"
                        max={settings.minPoints + settings.maxOver}
                        step="0.5"
                        value={vol.preAssignedPoints}
                        onChange={(e) => updateVolunteer(vol.name, { preAssignedPoints: parseFloat(e.target.value) || 0 })}
                        className="w-16 px-2 py-1 text-center border border-gray-200 rounded hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 border-b text-center text-gray-600">
                      {effectiveMin.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 border-b text-center text-gray-600">{vol.preferences.size}</td>
                    <td className="px-3 py-2 border-b text-gray-500 font-mono text-xs">
                      {sortedPrefs.map(([id, rank]) => `#${rank}:${id}`).join(', ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {volunteers.length > 10 && (
          <button
            onClick={() => setShowAllVolunteers(!showAllVolunteers)}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800"
          >
            {showAllVolunteers ? 'Show less' : `Show all ${volunteers.length} volunteers`}
          </button>
        )}
      </div>

      {/* Action Button */}
      <div className="flex justify-center">
        <button
          onClick={handleSolve}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors"
        >
          Run Optimization
        </button>
      </div>
    </div>
  );
}
