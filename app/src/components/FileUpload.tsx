import { useCallback, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { parseExcelFile } from '../lib/parser/excelParser';

function CollapsibleSection({ title, defaultOpen = false, children }: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <span className="font-semibold text-gray-700 dark:text-gray-200">{title}</span>
        <span className={`text-gray-400 dark:text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-300">
          {children}
        </div>
      )}
    </div>
  );
}

export function FileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { setData, parseErrors } = useAppStore();

  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseExcelFile(buffer);
      setData(parsed);
    } catch (error) {
      setData({
        shifts: [],
        volunteers: [],
        settings: {
          minPoints: 6,
          maxOver: 2,
          maxShifts: 10,
          forbidBackToBack: false,
          backToBackGap: 2,
          guaranteeLevel: 0,
          allowRelaxation: false,
          detectedGuarantee: 0,
          detectedMinPoints: { min: 0, max: 10, recommended: 6 },
          detectedMaxOver: { min: 0, max: 5, recommended: 2 },
          detectedMaxShifts: { min: 1, max: 20, recommended: 10 },
          seed: Math.floor(Math.random() * 1000000)
        },
        errors: [`Failed to read file: ${error instanceof Error ? error.message : String(error)}`],
        warnings: []
      });
    } finally {
      setIsLoading(false);
    }
  }, [setData]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Upload Shift Data</h2>

      <p className="text-gray-600 dark:text-gray-300 mb-6">
        Upload an Excel file (.xlsx) with two sheets: <strong>Shifts</strong> and <strong>Prefs</strong>.
      </p>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
          transition-colors duration-200
          ${isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-gray-50 dark:bg-gray-800'
          }
          ${isLoading ? 'opacity-50 cursor-wait' : ''}
        `}
      >
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleInputChange}
          className="hidden"
          id="file-input"
          disabled={isLoading}
        />
        <label htmlFor="file-input" className="cursor-pointer">
          {isLoading ? (
            <div className="text-gray-500 dark:text-gray-400">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              Processing file...
            </div>
          ) : (
            <>
              <div className="text-4xl mb-4">📁</div>
              <p className="text-lg text-gray-700 dark:text-gray-200 mb-2">
                Drop your Excel file here, or click to browse
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Supports .xlsx and .xls files
              </p>
            </>
          )}
        </label>
      </div>

      {parseErrors.length > 0 && (
        <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
          <h3 className="text-red-800 dark:text-red-300 font-semibold mb-2">Errors:</h3>
          <ul className="list-disc list-inside text-red-700 dark:text-red-400">
            {parseErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Template Download */}
      <div className="mt-6 text-center">
        <a
          href="/ShiftSortingHat_InputTemplate.xlsx"
          download
          className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
        >
          <span>📄</span>
          <span>Download input template (.xlsx)</span>
        </a>
      </div>

      {/* Readme Section */}
      <div className="mt-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 border-b border-gray-200 dark:border-gray-600">
          <h3 className="font-bold text-gray-800 dark:text-gray-100">How to Use This Tool</h3>
        </div>

        <CollapsibleSection title="What is the Shift Sorting Hat?" defaultOpen={true}>
          <p className="mb-3">
            The Shift Sorting Hat is an optimization tool that automatically assigns volunteers to shifts
            based on their preferences. It's designed for volunteer-run events (like camps at burns) where
            you need to fairly distribute shift work while maximizing everyone's happiness.
          </p>
          <p>
            <strong>The goal:</strong> Fill all shifts while giving people shifts they actually want,
            ensuring fair workload distribution, and avoiding scheduling conflicts.
          </p>
        </CollapsibleSection>

        <CollapsibleSection title="How the Optimization Works">
          <div className="space-y-3">
            <p>
              The tool uses a two-phase optimization algorithm:
            </p>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>
                <strong>Preference Phase:</strong> Assigns volunteers to shifts they ranked highly,
                respecting capacity limits and workload constraints.
              </li>
              <li>
                <strong>Fill Phase:</strong> Ensures all remaining shift slots get filled, even if
                it means assigning some unranked shifts.
              </li>
            </ol>
            <p className="mt-3">
              <strong>Fairness approach:</strong> Instead of just maximizing total happiness (which would
              favor people with more shifts), the algorithm maximizes the <em>average satisfaction per shift</em>.
              This means someone assigned 2 shifts gets similar quality choices as someone assigned 4 shifts.
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-2">
              Settings like minimum/maximum shifts per person can be adjusted on the Review page after upload.
            </p>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Input File Format">
          <div className="space-y-4">
            <p>
              Upload an Excel file (.xlsx) with two sheets named <strong>Shifts</strong> and <strong>Prefs</strong>.
            </p>

            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">Shifts sheet columns:</p>
              <table className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-2 py-1 text-left border-b border-gray-200 dark:border-gray-600">Column</th>
                    <th className="px-2 py-1 text-left border-b border-gray-200 dark:border-gray-600">Description</th>
                    <th className="px-2 py-1 text-left border-b border-gray-200 dark:border-gray-600">Example</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">ShiftID</td><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">Unique identifier</td><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">Kitchen-Sat-AM</td></tr>
                  <tr><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">Date</td><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">Shift date</td><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">2025-06-14</td></tr>
                  <tr><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">Role</td><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">Job/position name</td><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">Kitchen</td></tr>
                  <tr><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">StartTime</td><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">When shift starts</td><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">9:00 AM</td></tr>
                  <tr><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">EndTime</td><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">When shift ends</td><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">1:00 PM</td></tr>
                  <tr><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">Capacity</td><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">People needed</td><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">3</td></tr>
                  <tr><td className="px-2 py-1">Points</td><td className="px-2 py-1">Workload value</td><td className="px-2 py-1">2</td></tr>
                </tbody>
              </table>
            </div>

            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">Prefs sheet columns:</p>
              <table className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-2 py-1 text-left border-b border-gray-200 dark:border-gray-600">Column</th>
                    <th className="px-2 py-1 text-left border-b border-gray-200 dark:border-gray-600">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">Volunteer</td><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">Person's name (unique)</td></tr>
                  <tr><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">PreAssignedPoints</td><td className="px-2 py-1 border-b border-gray-200 dark:border-gray-600">Optional. Points already assigned outside this system (default: 0)</td></tr>
                  <tr><td className="px-2 py-1">[ShiftID columns]</td><td className="px-2 py-1">One column per shift with rank values: 1 = top choice, 2-5 = other preferences, blank = no preference</td></tr>
                </tbody>
              </table>
            </div>

            <p className="text-gray-500 dark:text-gray-400 text-xs">
              Tip: Each volunteer typically ranks their top 5 preferred shifts (1 being most preferred).
              Leave cells blank for shifts they have no preference about.
            </p>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="What Happens Next">
          <ol className="list-decimal list-inside space-y-2">
            <li><strong>Review:</strong> Check your data and adjust optimization settings</li>
            <li><strong>Optimize:</strong> The algorithm runs (usually takes a few seconds)</li>
            <li><strong>Results:</strong> View assignments, statistics, and export to Excel or CSV</li>
          </ol>
        </CollapsibleSection>
      </div>
    </div>
  );
}
