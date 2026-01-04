import { useMemo } from 'react';
import { useAppStore } from '../store/appStore';

interface ProgressInfo {
  message: string;
  phase?: 1 | 2;
  phaseLabel?: string;
  progress?: number;
}

export function SolvingProgress() {
  const { solverProgress, solverStatus, solverResult, setStep } = useAppStore();

  const isRunning = solverStatus === 'running';
  const isError = solverResult?.status === 'error' || solverResult?.status === 'infeasible';

  // Parse progress messages to extract structured info
  const { messages, currentPhase, currentPhaseLabel, currentProgress } = useMemo(() => {
    const parsed: { text: string; phase?: number; phaseLabel?: string; progress?: number }[] = [];
    let phase: number | undefined;
    let phaseLabel: string | undefined;
    let progress: number | undefined;

    for (const item of solverProgress) {
      if (typeof item === 'string') {
        parsed.push({ text: item });
      } else {
        const info = item as ProgressInfo;
        parsed.push({
          text: info.message,
          phase: info.phase,
          phaseLabel: info.phaseLabel,
          progress: info.progress
        });
        if (info.phase !== undefined) phase = info.phase;
        if (info.phaseLabel !== undefined) phaseLabel = info.phaseLabel;
        if (info.progress !== undefined) progress = info.progress;
      }
    }

    return {
      messages: parsed,
      currentPhase: phase,
      currentPhaseLabel: phaseLabel,
      currentProgress: progress ?? 0
    };
  }, [solverProgress]);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">
        {isRunning ? 'Optimizing Shifts...' : isError ? 'Optimization Failed' : 'Optimization Complete'}
      </h2>

      {/* Progress Indicator (#014) */}
      {isRunning && (
        <div className="mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 shadow-sm">
          {/* Phase indicator */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  currentPhase === 1
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  1
                </div>
                <span className={`text-sm ${currentPhase === 1 ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                  Preference Optimization
                </span>
              </div>
              <div className="w-8 h-0.5 bg-gray-200 dark:bg-gray-700"></div>
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  currentPhase === 2
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  2
                </div>
                <span className={`text-sm ${currentPhase === 2 ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                  Fill All Shifts
                </span>
              </div>
            </div>
          </div>

          {/* Current phase label */}
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {currentPhaseLabel || 'Initializing...'}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${currentProgress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span>Phase {currentPhase || 1}</span>
            <span>{currentProgress}%</span>
          </div>
        </div>
      )}

      <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400 h-64 overflow-y-auto mb-6">
        {messages.map((msg, i) => (
          <div key={i} className="mb-1">
            <span className="text-gray-500">[{i + 1}]</span>{' '}
            {msg.phase && (
              <span className={`${msg.phase === 1 ? 'text-blue-400' : 'text-purple-400'} mr-2`}>
                [P{msg.phase}]
              </span>
            )}
            {msg.text}
          </div>
        ))}
        {isRunning && (
          <div className="animate-pulse text-yellow-400">Processing...</div>
        )}
      </div>

      {isError && solverResult && (
        <div className="mb-6 space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
            <h3 className="text-red-800 dark:text-red-300 font-semibold mb-2">
              {solverResult.status === 'infeasible' ? 'No Valid Solution Found' : 'Error'}
            </h3>
            <p className="text-red-700 dark:text-red-400">{solverResult.message}</p>
          </div>

          {/* Infeasibility Diagnosis (#015) */}
          {solverResult.infeasibilityDiagnosis && solverResult.infeasibilityDiagnosis.issues.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-5">
              <h3 className="text-amber-800 dark:text-amber-200 font-semibold mb-3 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Potential Issues Identified
              </h3>
              <div className="space-y-4">
                {solverResult.infeasibilityDiagnosis.issues.map((issue, idx) => (
                  <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-amber-100 dark:border-amber-800">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-200 dark:bg-amber-700 flex items-center justify-center text-amber-800 dark:text-amber-200 font-bold text-xs">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-800 dark:text-gray-200 font-medium">
                          {issue.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </p>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                          {issue.description}
                        </p>
                        <div className="mt-2 flex items-start gap-2">
                          <svg className="w-4 h-4 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                          <p className="text-green-700 dark:text-green-400 text-sm">
                            <strong>Suggestion:</strong> {issue.suggestion}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
