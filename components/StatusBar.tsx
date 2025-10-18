'use client';

import { Wifi, WifiOff } from 'lucide-react';
import { useSessionManager } from '@/hooks/useSessionManager';

interface StatusBarProps {
  isOnline?: boolean;
}

export function StatusBar({ isOnline = true }: StatusBarProps) {
  const { sessionId } = useSessionManager();

  return (
    <div className="bg-gray-50 border-b border-gray-200">
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          {/* Connection Status */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${
              isOnline
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="h-4 w-4" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4" />
                <span>Offline</span>
              </>
            )}
          </div>

          {/* Session ID */}
          {sessionId && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white text-gray-700 border border-gray-200 shadow-sm max-w-full">
              <span className="text-sm text-gray-500 flex-shrink-0">Session ID:</span>
              <span
                className="font-mono text-sm font-semibold text-gray-800 truncate max-w-[40vw] sm:max-w-[320px]"
                title={sessionId}
              >
                {sessionId}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
