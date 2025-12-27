import { useCallback, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { parseExcelFile } from '../lib/parser/excelParser';

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
        settings: { minPoints: 6, maxOver: 2, seed: 42, maxShifts: 999 },
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
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Upload Shift Data</h2>

      <p className="text-gray-600 mb-6">
        Upload an Excel file (.xlsx) with three sheets: <strong>Shifts</strong>, <strong>Prefs</strong>, and <strong>Settings</strong>.
      </p>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
          transition-colors duration-200
          ${isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 bg-gray-50'
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
            <div className="text-gray-500">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              Processing file...
            </div>
          ) : (
            <>
              <div className="text-4xl mb-4">📁</div>
              <p className="text-lg text-gray-700 mb-2">
                Drop your Excel file here, or click to browse
              </p>
              <p className="text-sm text-gray-500">
                Supports .xlsx and .xls files
              </p>
            </>
          )}
        </label>
      </div>

      {parseErrors.length > 0 && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="text-red-800 font-semibold mb-2">Errors:</h3>
          <ul className="list-disc list-inside text-red-700">
            {parseErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 p-4 bg-gray-100 rounded-lg">
        <h3 className="font-semibold text-gray-700 mb-2">Expected File Format:</h3>
        <div className="text-sm text-gray-600 space-y-2">
          <p><strong>Shifts sheet:</strong> ShiftID, Date, Role, StartTime, EndTime, Capacity, Points</p>
          <p><strong>Prefs sheet:</strong> Volunteer, MinPoints (optional), then one column per ShiftID with rank values (1-5)</p>
          <p><strong>Settings sheet:</strong> MIN_POINTS, MAX_OVER, SEED (optional), MAX_SHIFTS (optional)</p>
        </div>
      </div>
    </div>
  );
}
