'use client';

import { useState, useEffect } from 'react';

interface UploadFile {
  name: string;
  status: 'waiting' | 'uploading' | 'completed' | 'error';
  progress?: number;
}

interface UploadProgressProps {
  files: UploadFile[];
  isVisible: boolean;
  onClose: () => void;
}

export function UploadProgress({ files, isVisible, onClose }: UploadProgressProps) {
  const [completedFiles, setCompletedFiles] = useState(0);

  useEffect(() => {
    const completed = files.filter(f => f.status === 'completed').length;
    setCompletedFiles(completed);
  }, [files]);

  if (!isVisible) return null;

  const totalFiles = files.length;
  const overallProgress = totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-modal>
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-4xl mb-4">📤</div>
          <h3 className="text-xl font-semibold text-gray-800">Uploading Your Files</h3>
          <p className="text-gray-600 mt-2">Please wait while we process your documents...</p>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Overall Progress</span>
            <span>{overallProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-blue-500 h-3 rounded-full transition-all duration-300"
              style={{ width: `${overallProgress}%` }}
            ></div>
          </div>
        </div>

        <div className="space-y-3 max-h-48 overflow-y-auto">
          {files.map((file, index) => (
            <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="text-lg">
                {file.status === 'waiting' && '⏳'}
                {file.status === 'uploading' && '⏳'}
                {file.status === 'completed' && '✅'}
                {file.status === 'error' && '❌'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{file.name}</div>
                <div className="text-xs text-gray-500">
                  {file.status === 'waiting' && 'Waiting...'}
                  {file.status === 'uploading' && 'Uploading...'}
                  {file.status === 'completed' && 'Completed'}
                  {file.status === 'error' && 'Failed'}
                </div>
              </div>
            </div>
          ))}
        </div>

        {overallProgress === 100 && (
          <div className="mt-6 text-center">
            <button
              onClick={onClose}
              className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
