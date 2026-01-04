import { useAppStore } from '../store/appStore';

export function SolvingProgress() {
  const { solverProgress, solverStatus, solverResult, setStep } = useAppStore();

  const isRunning = solverStatus === 'running';
  const isError = solverResult?.status === 'error' || solverResult?.status === 'infeasible';

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">
        {isRunning ? 'Optimizing Shifts...' : isError ? 'Optimization Failed' : 'Optimization Complete'}
      </h2>

      <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400 h-64 overflow-y-auto mb-6">
        {solverProgress.map((msg, i) => (
          <div key={i} className="mb-1">
            <span className="text-gray-500">[{i + 1}]</span> {msg}
          </div>
        ))}
        {isRunning && (
          <div className="animate-pulse text-yellow-400">Processing...</div>
        )}
      </div>

      {isError && solverResult && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
          <h3 className="text-red-800 dark:text-red-300 font-semibold mb-2">Error:</h3>
          <p className="text-red-700 dark:text-red-400">{solverResult.message}</p>
        </div>
      )}

      {!isRunning && (
        <div className="flex justify-center gap-4">
          {isError ? (
            <button
              onClick={() => setStep('review')}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg"
            >
              Back to Review
            </button>
          ) : (
            <button
              onClick={() => setStep('results')}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
            >
              View Results
            </button>
          )}
        </div>
      )}
    </div>
  );
}
