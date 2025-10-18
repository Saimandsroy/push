'use client';

import { useEffect, useState } from 'react';
import { X, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

interface UploadProgressItem {
  id: string;
  fileName: string;
  progress: number;
  status: 'uploading' | 'registering' | 'completed' | 'error';
  error?: string;
}

interface UploadProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  uploads: UploadProgressItem[];
  onComplete: () => void;
  onRetry?: (id: string) => void;
}

export function UploadProgressModal({ 
  isOpen, 
  onClose, 
  uploads, 
  onComplete,
  onRetry
}: UploadProgressModalProps) {
  const [allCompleted, setAllCompleted] = useState(false);

  // Reset completion state whenever the modal opens or a new uploads batch begins
  useEffect(() => {
    if (isOpen) {
      setAllCompleted(false);
    }
  }, [isOpen]);

  useEffect(() => {
    // If uploads list is reinitialized, clear completion flag
    if (uploads.length === 0) {
      setAllCompleted(false);
    }
  }, [uploads.length]);

  useEffect(() => {
    const completed = uploads.every(upload => 
      upload.status === 'completed' || upload.status === 'error'
    );
    
    if (completed && uploads.length > 0 && !allCompleted) {
      setAllCompleted(true);
      // Immediately proceed to checkout if all uploads successful
      const hasErrors = uploads.some(upload => upload.status === 'error');
      if (!hasErrors) {
        onComplete();
      }
    }
  }, [uploads, allCompleted, onComplete]);

  if (!isOpen) return null;

  const totalProgress = uploads.length > 0 
    ? uploads.reduce((sum, upload) => sum + upload.progress, 0) / uploads.length 
    : 0;

  const completedCount = uploads.filter(upload => upload.status === 'completed').length;
  const errorCount = uploads.filter(upload => upload.status === 'error').length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md max-h-[80vh] overflow-hidden">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-full">
                <Upload className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Uploading Files
                </h3>
                <p className="text-sm text-gray-600">
                  {completedCount}/{uploads.length} files uploaded
                </p>
              </div>
            </div>
            {allCompleted && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Overall Progress */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Overall Progress
              </span>
              <span className="text-sm text-gray-600">
                {Math.round(totalProgress)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${totalProgress}%` }}
              />
            </div>
          </div>

          {/* Individual File Progress */}
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {uploads.map((u) => (
              <div key={u.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900 truncate flex-1 mr-2">
                    {u.fileName}
                  </span>
                  <div className="flex items-center gap-2">
                    {u.status === 'completed' && (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                    {u.status === 'registering' && (
                      <div className="h-4 w-4 rounded-full bg-yellow-500 animate-pulse" />
                    )}
                    {u.status === 'error' && (
                      <AlertCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className="text-xs text-gray-600">{u.progress}%</span>
                  </div>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      u.status === 'error'
                        ? 'bg-red-500'
                        : u.status === 'completed'
                        ? 'bg-green-500'
                        : u.status === 'registering'
                        ? 'bg-yellow-500'
                        : 'bg-blue-500'
                    }`}
                    style={{ width: `${u.progress}%` }}
                  />
                </div>

                {u.error ? (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-red-600">{u.error}</p>
                    {onRetry && (
                      <Button size="sm" variant="secondary" onClick={() => onRetry(u.id)}>
                        Retry
                      </Button>
                    )}
                  </div>
                ) : u.status === 'registering' ? (
                  <p className="text-xs text-gray-600 mt-1">Registering file with server…</p>
                ) : null}
              </div>
            ))}
          </div>

          {/* Status Message */}
          {allCompleted && (
            <div className={`mt-6 p-4 rounded-lg border ${
              errorCount > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'
            }`}>
              <div className="flex items-center gap-2">
                {errorCount > 0 ? (
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {errorCount > 0 
                      ? `Upload completed with ${errorCount} error(s)`
                      : 'All files uploaded successfully! Redirecting to checkout...'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
