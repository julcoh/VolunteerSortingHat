import { useAppStore } from './store/appStore';
import { FileUpload } from './components/FileUpload';
import { DataReview } from './components/DataReview';
import { SolvingProgress } from './components/SolvingProgress';
import { Results } from './components/Results';
import { VERSION } from './version';

function App() {
  const { step } = useAppStore();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800">
            Shift Sorting Hat
          </h1>
          <p className="text-gray-500 text-sm">
            Optimal shift assignments that maximize volunteer happiness
          </p>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-white border-b border-gray-200">
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
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center text-gray-500 text-sm">
          <span>Shift Sorting Hat - Fair shift assignments through optimization</span>
          <span className="text-gray-400">v{VERSION}</span>
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
    <div className={`flex items-center gap-2 ${active ? 'text-blue-600' : complete ? 'text-green-600' : 'text-gray-400'}`}>
      <div className={`
        w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
        ${active ? 'bg-blue-600 text-white' : complete ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}
      `}>
        {complete ? '✓' : number}
      </div>
      <span className={`font-medium ${active ? 'text-blue-600' : complete ? 'text-green-600' : 'text-gray-400'}`}>
        {label}
      </span>
    </div>
  );
}

function StepDivider() {
  return <div className="w-8 h-px bg-gray-300" />;
}

export default App;
