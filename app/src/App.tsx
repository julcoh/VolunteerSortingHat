import { useAppStore } from './store/appStore';
import { FileUpload } from './components/FileUpload';
import { DataReview } from './components/DataReview';
import { SolvingProgress } from './components/SolvingProgress';
import { Results } from './components/Results';
import { VERSION } from './version';

function DarkModeToggle() {
  const { darkMode, toggleDarkMode } = useAppStore();

  return (
    <button
      onClick={toggleDarkMode}
      className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {darkMode ? (
        <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  );
}

function App() {
  const { step, darkMode } = useAppStore();

  return (
    <div className={`min-h-screen bg-gray-100 dark:bg-gray-900 ${darkMode ? 'dark' : ''}`}>
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              Shift Sorting Hat
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Optimal shift assignments that maximize volunteer happiness
            </p>
          </div>
          <DarkModeToggle />
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-6 py-3">
          <div className="flex items-center gap-2 text-sm">
            <StepIndicator
              number={1}
              label="Upload"
              active={step === 'upload'}
              complete={step !== 'upload'}
            />
            <StepDivider />
            <StepIndicator
              number={2}
              label="Review"
              active={step === 'review'}
              complete={step === 'solving' || step === 'results'}
            />
            <StepDivider />
            <StepIndicator
              number={3}
              label="Optimize"
              active={step === 'solving'}
              complete={step === 'results'}
            />
            <StepDivider />
            <StepIndicator
              number={4}
              label="Results"
              active={step === 'results'}
              complete={false}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="py-8">
        {step === 'upload' && <FileUpload />}
        {step === 'review' && <DataReview />}
        {step === 'solving' && <SolvingProgress />}
        {step === 'results' && <Results />}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center text-gray-500 dark:text-gray-400 text-sm">
          <span>Shift Sorting Hat - Fair shift assignments through optimization</span>
          <span className="text-gray-400 dark:text-gray-500">v{VERSION}</span>
        </div>
      </footer>
    </div>
  );
}

function StepIndicator({
  number,
  label,
  active,
  complete
}: {
  number: number;
  label: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${active ? 'text-blue-600 dark:text-blue-400' : complete ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
      <div className={`
        w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
        ${active ? 'bg-blue-600 text-white' : complete ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'}
      `}>
        {complete ? '✓' : number}
      </div>
      <span className={`font-medium ${active ? 'text-blue-600 dark:text-blue-400' : complete ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
        {label}
      </span>
    </div>
  );
}

function StepDivider() {
  return <div className="w-8 h-px bg-gray-300 dark:bg-gray-600" />;
}

export default App;
