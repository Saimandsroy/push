'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchWithLoadBalancer } from '@/lib/api';
import { ShopStatusManager } from '@/lib/singletons';

interface ShopStatus {
  isOpen: boolean;
  isPrinting: boolean;
  message: string;
  lastChecked: string;
}

interface StatusMonitorProps {
  sessionId?: string;
}

export function StatusMonitor({ sessionId }: StatusMonitorProps) {
  const [shopStatus, setShopStatus] = useState<ShopStatus>({ isOpen: true, isPrinting: true, message: '', lastChecked: '' });
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline' | 'unknown'>('unknown');
  const [showBanner, setShowBanner] = useState(false);

  const checkShopStatus = useCallback(async () => {
    // Only run when user explicitly clicks Refresh
    try {
      const response = await fetchWithLoadBalancer('/customer/shop-status', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const open = !!(data?.isOpen ?? data?.open ?? data?.success);
        setShopStatus({
          isOpen: open,
          isPrinting: data?.isPrinting ?? true,
          message: data?.message || '',
          lastChecked: data?.lastChecked || new Date().toISOString(),
        });
        setConnectionStatus(open ? 'online' : 'offline');
        setShowBanner(!open || !(data?.isPrinting ?? true));
        if (open) {
          // Ensure global open flag is set so other components stay in sync
          ShopStatusManager.setShopOpen(true);
        }
      } else {
        // Treat non-OK as closed
        setShopStatus({
          isOpen: false,
          isPrinting: false,
          message: 'Shop is currently closed. Please wait until it opens.',
          lastChecked: new Date().toISOString(),
        });
        setConnectionStatus('offline');
        setShowBanner(true);
      }
    } catch (error) {
      console.error('Error checking shop status:', error);
      setShopStatus({
        isOpen: false,
        isPrinting: false,
        message: 'Shop is currently closed. Please wait until it opens.',
        lastChecked: new Date().toISOString(),
      });
      setConnectionStatus('offline');
      setShowBanner(true);
    }
  }, []);

  useEffect(() => {
    // Initialize from global state to avoid triggering extra network calls
    const initOpen = ShopStatusManager.isShopOpen();
    if (initOpen) {
      setShopStatus((prev) => ({ ...prev, isOpen: true, isPrinting: true }));
      setConnectionStatus('online');
      setShowBanner(false);
    } else {
      // Unknown on first paint; don't force closed banner, let ShopGuard handle overlay
      setConnectionStatus('unknown');
    }

    // Stay in sync when ShopGuard confirms open
    function onOpen() {
      setShopStatus((prev) => ({ ...prev, isOpen: true, isPrinting: true, lastChecked: new Date().toISOString() }));
      setConnectionStatus('online');
      setShowBanner(false);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('shop-status-open', onOpen);
      return () => window.removeEventListener('shop-status-open', onOpen);
    }
  }, []);

  const getBannerConfig = () => {
    if (!shopStatus.isOpen) {
      return {
        type: 'closed',
        icon: '🔒',
        title: 'Shop Currently Closed',
        message: shopStatus.message || 'Shop is currently closed',
        bgColor: 'bg-red-50 border-red-200',
        textColor: 'text-red-800'
      };
    } else if (!shopStatus.isPrinting) {
      return {
        type: 'warning',
        icon: '⚠️',
        title: 'Printer Temporarily Offline',
        message: shopStatus.message || 'Printer is temporarily offline',
        bgColor: 'bg-yellow-50 border-yellow-200',
        textColor: 'text-yellow-800'
      };
    } else {
      return {
        type: 'open',
        icon: '✅',
        title: 'Shop Open & Ready',
        message: shopStatus.message || 'Shop is open and ready to print',
        bgColor: 'bg-green-50 border-green-200',
        textColor: 'text-green-800'
      };
    }
  };

  if (!showBanner && shopStatus.isOpen && shopStatus.isPrinting) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        {/* <div className={`w-2 h-2 rounded-full ${connectionStatus === 'online' ? 'bg-green-500' : 'bg-red-500'}`}></div>
        {connectionStatus === 'online' ? 'Online' : 'Offline'} */}
      </div>
    );
  }

  const config = getBannerConfig();

  return (
    <div className={`${config.bgColor} ${config.textColor} border-l-4 p-4 mb-4 rounded-r-lg`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <span className="text-xl">{config.icon}</span>
          <div>
            <h3 className="font-semibold text-sm">{config.title}</h3>
            <p className="text-sm mt-1">{config.message}</p>
            {config.type === 'warning' && (
              <p className="text-xs mt-2 opacity-75">You can still upload files, but printing may be delayed.</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={checkShopStatus}
            className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
            title="Check again"
          >
            Refresh
          </button>
          <button 
            onClick={() => setShowBanner(false)}
            className="text-lg leading-none opacity-50 hover:opacity-100"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
