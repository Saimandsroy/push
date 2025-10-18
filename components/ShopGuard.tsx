"use client";

import { useEffect, useState } from "react";
import { fetchWithLoadBalancer } from "@/lib/api";
import { ShopStatusManager } from "@/lib/singletons";

// Using fetchWithLoadBalancer from lib/api.ts for shop status checks

export function ShopGuard() {
  const [closed, setClosed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // Check if shop is already confirmed open
      if (ShopStatusManager.isShopOpen()) {
        console.log('[ShopGuard] Shop already confirmed open');
        if (!cancelled) {
          setClosed(false);
          setChecked(true);
        }
        return;
      }

      // Check if there's already a shop status check in progress
      let existingPromise = ShopStatusManager.getPromise();
      if (existingPromise) {
        console.log('[ShopGuard] Reusing existing shop status check');
        try {
          const isOpen = await existingPromise;
          if (!cancelled) {
            setClosed(!isOpen);
            setChecked(true);
          }
        } catch (error) {
          console.error('[ShopGuard] Error in existing promise:', error);
          if (!cancelled) {
            setClosed(true);
            setChecked(true);
          }
        }
        return;
      }

      // Create new shop status check promise
      const statusPromise = (async (): Promise<boolean> => {
        console.log('[ShopGuard] Starting new shop status check');
        
        // Try up to 3 times sequentially (reduced from 5)
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          if (cancelled) return false;
          
          try {
            console.log(`[ShopGuard] Checking shop status - attempt ${attempt}/${maxAttempts}`);
            const resp = await fetchWithLoadBalancer("/customer/shop-status", { 
              cache: 'no-store' 
            }, { 
              timeoutMs: 3000 // Reduced from 5000ms
            });
            
            if (!resp.ok) {
              console.log('[ShopGuard] non-OK response', resp.status, `attempt ${attempt}/${maxAttempts}`);
              // Continue to next attempt unless it's the last one
              if (attempt === maxAttempts) return false;
              continue;
            }

            let isOpen = true;
            try {
              const data = await resp.json();
              // Accept multiple casing/keys from backend; coerce string booleans
              let openVal: any = (data?.isOpen ?? data?.open ?? data?.Open);
              if (typeof openVal === 'string') {
                const lowered = openVal.toLowerCase();
                if (lowered === 'true') openVal = true; 
                else if (lowered === 'false') openVal = false;
              }
              if (typeof openVal === 'boolean') {
                isOpen = openVal;
              } else if (typeof data?.success === 'boolean') {
                // If API explicitly says success and does not say closed, allow usage
                isOpen = data.success === true;
              } else {
                // Default to open if not explicitly provided
                isOpen = true;
              }
              console.log('[ShopGuard] status payload', data, 'resolved isOpen =', isOpen, `attempt ${attempt}/${maxAttempts}`);
            } catch {
              // If we cannot parse, don't block
              isOpen = true;
            }

            if (isOpen) {
              console.log('[ShopGuard] ✅ Shop is open');
              // Use singleton manager to set shop status
              ShopStatusManager.setShopOpen(true);
              return true;
            }
            
            // If explicitly closed, try again unless it's the last attempt
            if (attempt === maxAttempts) {
              console.log('[ShopGuard] ❌ Shop is closed after all attempts');
              return false;
            }
          } catch (e) {
            console.log('[ShopGuard] fetch error', e, `attempt ${attempt}/${maxAttempts}`);
            // Continue to next attempt unless it's the last one
            if (attempt === maxAttempts) return false;
          }
        }
        
        return false;
      })();

      ShopStatusManager.setPromise(statusPromise);
      
      try {
        const isOpen = await statusPromise;
        if (!cancelled) {
          setClosed(!isOpen);
          setChecked(true);
        }
      } catch (error) {
        console.error('[ShopGuard] Shop status check failed:', error);
        if (!cancelled) {
          setClosed(true);
          setChecked(true);
        }
      } finally {
        ShopStatusManager.setPromise(null);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  function handleRecheck() {
    setChecked(false);
    setNonce((n) => n + 1);
  }

  if (!checked) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-sm text-gray-700">Checking shop status…</div>
        </div>
      </div>
    );
  }

  if (!closed) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Shop Currently Closed</h2>
        <p className="text-gray-600 mb-4">Shop is currently closed. Please wait until it opens.</p>
        <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg mb-4">We’ll be back soon!</div>
        <button
          type="button"
          onClick={handleRecheck}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white font-medium shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Check again
        </button>
      </div>
    </div>
  );
}

export default ShopGuard;
