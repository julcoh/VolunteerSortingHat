import { useAppStore } from '../store/appStore';
import { solveShiftAssignment } from '../lib/solver/shiftSolver';

export function DataReview() {
  const {
    shifts,
    volunteers,
    settings,
    parseWarnings,
    setStep,
    clearData,
    setSolverStatus,
    addSolverProgress,
    clearSolverProgress,
    setSolverResult
  } = useAppStore();

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
              <span className="text-gray-500">Points needed (total):</span>
              <span className="font-medium">{requiredPoints}</span>
            </div>
          </div>
        </div>

        {/* Settings Summary */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Settings</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Min points/person:</span>
              <span className="font-medium">{settings.minPoints}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Max over:</span>
              <span className="font-medium">{settings.maxOver}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Random seed:</span>
              <span className="font-medium">{settings.seed}</span>
            </div>
          </div>
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

      {/* Shifts Table Preview */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-700 mb-3">Shifts Preview</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b">ID</th>
                <th className="px-3 py-2 text-left border-b">Date</th>
                <th className="px-3 py-2 text-left border-b">Role</th>
                <th className="px-3 py-2 text-left border-b">Time</th>
                <th className="px-3 py-2 text-center border-b">Capacity</th>
                <th className="px-3 py-2 text-center border-b">Points</th>
              </tr>
            </thead>
            <tbody>
              {shifts.slice(0, 10).map((shift) => (
                <tr key={shift.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border-b font-mono">{shift.id}</td>
                  <td className="px-3 py-2 border-b">{shift.date}</td>
                  <td className="px-3 py-2 border-b">{shift.role}</td>
                  <td className="px-3 py-2 border-b">
                    {shift.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                    {shift.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-2 border-b text-center">{shift.capacity}</td>
                  <td className="px-3 py-2 border-b text-center">{shift.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shifts.length > 10 && (
            <p className="text-gray-500 text-sm mt-2">...and {shifts.length - 10} more shifts</p>
          )}
        </div>
      </div>

      {/* Volunteers Table Preview */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-700 mb-3">Volunteers Preview</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b">Name</th>
                <th className="px-3 py-2 text-center border-b">Min Points</th>
                <th className="px-3 py-2 text-center border-b"># Preferences</th>
                <th className="px-3 py-2 text-left border-b">Top Picks</th>
              </tr>
            </thead>
            <tbody>
              {volunteers.slice(0, 10).map((vol) => {
                const sortedPrefs = Array.from(vol.preferences.entries())
                  .sort((a, b) => a[1] - b[1])
                  .slice(0, 3);
                return (
                  <tr key={vol.name} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-b">{vol.name}</td>
                    <td className="px-3 py-2 border-b text-center">
                      {vol.minPoints ?? settings.minPoints}
                    </td>
                    <td className="px-3 py-2 border-b text-center">{vol.preferences.size}</td>
                    <td className="px-3 py-2 border-b text-gray-500 font-mono text-xs">
                      {sortedPrefs.map(([id, rank]) => `#${rank}:${id}`).join(', ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {volunteers.length > 10 && (
            <p className="text-gray-500 text-sm mt-2">...and {volunteers.length - 10} more volunteers</p>
          )}
        </div>
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
