'use client';

import { Printer, ExternalLink } from 'lucide-react';
import { useSessionManager } from '@/hooks/useSessionManager';
import { Button } from '@/components/ui/Button';

export function Header() {
  const { sessionId } = useSessionManager();

  const handleCheckStatus = () => {
    if (sessionId) {
      window.open(`/status?sessionId=${sessionId}`, '_blank');
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75 border-b border-gray-200">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Branding */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 border border-blue-200">
              <Printer className="h-6 w-6 text-blue-700" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">PrintPrane</h1>
              <p className="text-xs text-gray-600 font-medium">Prane Printing Shop</p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            {/* Check Order Status Button */}
            <Button 
              variant="secondary"
              onClick={handleCheckStatus}
              disabled={!sessionId}
              className="inline-flex items-center gap-2 shadow-md text-xs"
            >
              <ExternalLink className="h-4 w-4" />
              Check Order Status
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
