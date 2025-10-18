'use client';

import { useEffect, useState } from 'react';
import { ShopStatusManager, SessionInitManager } from '@/lib/singletons';

interface BootLoaderProps {
  active?: boolean;
  sessionLoading: boolean;
  pricingLoading: boolean;
}

export function BootLoader({ active = true, sessionLoading, pricingLoading }: BootLoaderProps) {
  const [shopStatusChecked, setShopStatusChecked] = useState(false);
  const [visible, setVisible] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Checking shop status...');
  const [sessionReady, setSessionReady] = useState<boolean>(() => SessionInitManager.getInitialized());

  // Listen for shop status events
  useEffect(() => {
    function onShopOpen() {
      console.log('[BootLoader] Shop status confirmed open');
      setShopStatusChecked(true);
      setLoadingMessage('Loading session and pricing...');
    }

    if (typeof window !== 'undefined') {
      // Check if shop is already open
      if (ShopStatusManager.isShopOpen()) {
        setShopStatusChecked(true);
        setLoadingMessage('Loading session and pricing...');
      }
      
      window.addEventListener('shop-status-open', onShopOpen);
      return () => window.removeEventListener('shop-status-open', onShopOpen);
    }
  }, []);

  // Listen for explicit session-initialized event to mark session ready
  useEffect(() => {
    function onSessionInitialized() {
      console.log('[BootLoader] Session initialized event received');
      setSessionReady(true);
    }
    if (typeof window !== 'undefined') {
      if (SessionInitManager.getInitialized()) setSessionReady(true);
      window.addEventListener('session-initialized', onSessionInitialized);
      return () => window.removeEventListener('session-initialized', onSessionInitialized);
    }
  }, []);

  // Update loading message based on current state
  useEffect(() => {
    if (!shopStatusChecked) {
      setLoadingMessage('Checking shop status...');
    } else if (!sessionReady && pricingLoading) {
      setLoadingMessage('Loading session and pricing...');
    } else if (!sessionReady) {
      setLoadingMessage('Loading session...');
    } else if (pricingLoading) {
      setLoadingMessage('Loading pricing...');
    } else {
      setLoadingMessage('Almost ready...');
    }
  }, [shopStatusChecked, sessionReady, pricingLoading]);

  useEffect(() => {
    // Hide overlay once everything is loaded
    if (shopStatusChecked && sessionReady && !pricingLoading) {
      const t = setTimeout(() => setVisible(false), 300); // small fade-out delay
      return () => clearTimeout(t);
    }
  }, [shopStatusChecked, sessionReady, pricingLoading]);

  // Keep loader visible until our own visibility flag turns off
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-800">Getting things ready…</h2>
        <p className="text-gray-500 mt-1 text-sm">{loadingMessage}</p>
        
        {/* Progress indicators */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <div className={`w-2 h-2 rounded-full ${shopStatusChecked ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span>Shop Status</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <div className={`w-2 h-2 rounded-full ${sessionReady && shopStatusChecked ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span>Session</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <div className={`w-2 h-2 rounded-full ${!pricingLoading && shopStatusChecked ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span>Pricing</span>
          </div>
        </div>
      </div>
    </div>
  );
}
