'use client';

import { useState, useEffect, useRef } from 'react';
import { fetchWithLoadBalancer } from '@/lib/api';
import { 
  ShopStatusManager, 
  SessionInitManager, 
  SessionCreateManager, 
  SessionValidateManager 
} from '@/lib/singletons';

interface Session {
  sessionId: string;
  customerUUID: string;
  createdAt: string;
}

export function useSessionManager() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !SessionInitManager.getInitialized());
  const [error, setError] = useState<string>('');

  const STORAGE_KEY = 'printshop_customer_session';
  const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  const getStoredSession = (): Session | null => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const session = JSON.parse(stored);
        const now = Date.now();
        const sessionAge = now - new Date(session.createdAt).getTime();
        
        if (sessionAge < SESSION_DURATION) {
          return session;
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.warn('Failed to parse stored session:', error);
      localStorage.removeItem(STORAGE_KEY);
    }
    return null;
  };

  // Initialize session only after shop status is confirmed as open
  const initInFlightRef = useRef(false);
  const hasInitializedRef = useRef(false);
  
  useEffect(() => {
    // Don't initialize on mount - wait for shop status confirmation
    function onShopOpen() {
      console.log('[SessionManager] Shop status confirmed open, initializing session...');
      
      // Avoid overlapping runs and duplicate initialization
      if (initInFlightRef.current || SessionInitManager.getPromise() || hasInitializedRef.current || SessionInitManager.getInitialized()) {
        console.log('[SessionManager] Skipping initialization - already in progress or completed');
        // If already initialized elsewhere, hydrate from storage and stop loading
        const stored = getStoredSession();
        if (stored) {
          setSession(stored);
          setLoading(false);
        } else {
          // No stored session yet; wait for session-initialized event below
        }
        return;
      }
      
      hasInitializedRef.current = true;
      initInFlightRef.current = true;
      
      let p = SessionInitManager.getPromise();
      if (!p) {
        p = initializeSession('shop-status-open').finally(() => SessionInitManager.setPromise(null));
        SessionInitManager.setPromise(p);
      }
      p.finally(() => {
        initInFlightRef.current = false;
      });
    }

    if (typeof window !== 'undefined') {
      // Check if shop is already open (in case we missed the event)
      if (ShopStatusManager.isShopOpen() && !hasInitializedRef.current && !SessionInitManager.getInitialized()) {
        console.log('[SessionManager] Shop already open, initializing session immediately');
        onShopOpen();
      }

      // If another instance already completed initialization earlier, hydrate immediately
      if (SessionInitManager.getInitialized()) {
        const stored = getStoredSession();
        if (stored) {
          setSession(stored);
          setLoading(false);
        } else {
          setLoading(false);
        }
      }
      
      // Listen for shop status open event
      window.addEventListener('shop-status-open', onShopOpen);
      // Listen for session-initialized event from another instance
      const onSessionInitialized = () => {
        const stored = getStoredSession();
        if (stored) {
          setSession(stored);
        }
        setLoading(false);
      };
      window.addEventListener('session-initialized', onSessionInitialized);
      return () => {
        window.removeEventListener('shop-status-open', onShopOpen);
        window.removeEventListener('session-initialized', onSessionInitialized);
      };
    }
  }, []); // Empty dependency array - only run once on mount

  const storeSession = (session: Session) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch (error) {
      console.warn('Failed to store session:', error);
    }
  };

  const clearSession = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setSession(null);
    } catch (error) {
      console.warn('Failed to clear session:', error);
    }
  };

  const refreshStoredSession = (session: Session) => {
    const refreshedSession = {
      ...session,
      createdAt: new Date().toISOString()
    };
    setSession(refreshedSession);
    storeSession(refreshedSession);
  };

  const isSessionValid = (session: Session): boolean => {
    const now = Date.now();
    const sessionAge = now - new Date(session.createdAt).getTime();
    return sessionAge < SESSION_DURATION;
  };

  // Using fetchWithLoadBalancer from lib/api.ts for all API calls

  const validateSessionWithBackend = async (
    customerUUID: string
  ): Promise<{ ok: boolean; data?: { success?: boolean; valid?: boolean; customerUUID?: string } }> => {
    try {
      let existingPromise = SessionValidateManager.getPromise(customerUUID);
      if (existingPromise) {
        console.log('[Session][DEDUP] Reusing in-flight validate-session for customerUUID:', customerUUID);
        return existingPromise;
      }
      
      const validationPromise = (async () => {
        const reqId = Math.random().toString(36).slice(2, 8);
        console.log(`[Session][${reqId}] Validating session with backend for customerUUID:`, customerUUID);
        const response = await fetchWithLoadBalancer('/customer/validate-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerUUID }),
        }, { timeoutMs: 5000 }); // 5 second timeout for validation

        if (response.ok) {
          const data = await response.json();
          console.log(`[Session][${reqId}] Validation response:`, data);
          return { ok: true, data };
        } else {
          // Non-OK status: treat as not ok; do NOT trigger session creation
          console.warn(`[Session][${reqId}] Validation non-OK status:`, response.status);
          return { ok: false };
        }
      })();
      
      SessionValidateManager.setPromise(customerUUID, validationPromise);
      const result = await validationPromise;
      return result;
    } catch (error) {
      console.warn('[Session] Validation failed:', error);
      // Network/timeout error: treat as not ok; do NOT trigger session creation
      return { ok: false };
    } finally {
      SessionValidateManager.setPromise(customerUUID, null);
    }
  };

  const createNewSession = async (): Promise<Session | null> => {
    try {
      let existingPromise = SessionCreateManager.getPromise();
      if (existingPromise) {
        console.log('[Session][DEDUP] Reusing in-flight create-session');
        return existingPromise;
      }
      
      const createPromise = (async () => {
        const reqId = Math.random().toString(36).slice(2, 8);
        console.log(`[Session][${reqId}] Creating new session via API...`);
        const response = await fetchWithLoadBalancer('/customer/create-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, { timeoutMs: 8000 }); // 8 second timeout for session creation

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.sessionId && data.customerUUID) {
            console.log(`[Session][${reqId}] Created via API:`, data);
            return {
              sessionId: data.sessionId,
              customerUUID: data.customerUUID,
              createdAt: new Date().toISOString(),
            };
          }
        }
        return null;
      })();
      
      SessionCreateManager.setPromise(createPromise);
      const result = await createPromise;
      return result;
    } catch (error) {
      console.warn('[Session] Failed to create session via API:', error);
    } finally {
      SessionCreateManager.setPromise(null);
    }
    // No local fallback; return null and let caller handle gracefully
    return null;
  };

  const initializeSession = async (reason: 'initial-mount' | 'shop-status-open' | 'manual-refresh' = 'manual-refresh') => {
    try {
      setLoading(true);
      setError('');
      const runId = Math.random().toString(36).slice(2, 8);
      console.log(`[Session][${runId}] Starting session initialization... reason=${reason}`);

      // Check for existing session
      const storedSession = getStoredSession();
      
      if (storedSession && isSessionValid(storedSession)) {
        console.log(`[Session][${runId}] Found stored session, validating with backend...`);
        // Validate with backend to ensure the session is recognized server-side
        const validation = await validateSessionWithBackend(storedSession.customerUUID);
        if (validation.ok && validation.data?.success) {
          if (validation.data.valid) {
            console.log(`[Session][${runId}] ✅ Stored session is valid on server. Using it.`);
            setSession(storedSession);
            // Mark globally initialized so other hook instances can hydrate
            SessionInitManager.setInitialized(true);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('session-initialized'));
            }
            setLoading(false);
            return; // EARLY RETURN - Do NOT create new session
          } else {
            console.log(`[Session][${runId}] ❌ Stored session not valid on server. Proceeding to create a new session.`);
            // Clear invalid session from storage first
            clearSession();
            // Only create when validate returned success with valid=false
            const newSession = await createNewSession();
            if (newSession) {
              console.log(`[Session][${runId}] ✅ New session created after invalid stored session.`);
              setSession(newSession);
              storeSession(newSession);
              // Mark globally initialized
              SessionInitManager.setInitialized(true);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('session-initialized'));
              }
              setLoading(false);
              return;
            } else {
              // Could not create; surface error
              setError('Failed to create a new session after validation indicated invalid.');
              setLoading(false);
              return;
            }
          }
        } else {
          // Validation failed (error/non-OK). Do NOT create session; keep stored one.
          console.warn(`[Session][${runId}] Validation failed or non-OK. Preserving stored session without creating a new one.`);
          setSession(storedSession);
          // Mark globally initialized so other hook instances can hydrate
          SessionInitManager.setInitialized(true);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('session-initialized'));
          }
          setLoading(false);
          return;
        }
      } else {
        console.log(`[Session][${runId}] No valid stored session found. Will create new session.`);
      }

      // Only reach here if: no stored session OR stored session failed validation
      console.log(`[Session][${runId}] Creating new session via backend...`);
      const newSession = await createNewSession();
      if (newSession) {
        console.log(`[Session][${runId}] ✅ New session created successfully.`);
        setSession(newSession);
        storeSession(newSession);
        // Mark globally initialized so other hook instances can hydrate
        SessionInitManager.setInitialized(true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('session-initialized'));
        }
        setLoading(false);
        return;
      } else {
        // Could not create a session and there is no stored session. Surface error.
        setError('Unable to create a new session at this time. Please try again later.');
      }
    } catch (err) {
      console.error('[Session] Session initialization failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize session');
    } finally {
      setLoading(false);
      console.log('[Session] Initialization complete. loading = false');
    }
  };

  const handleRefresh = () => {
    // Reset the initialization flag to allow manual refresh
    hasInitializedRef.current = false;
    SessionInitManager.setInitialized(false);
    return initializeSession('manual-refresh');
  };

  return {
    session,
    sessionId: session?.sessionId,
    customerUUID: session?.customerUUID,
    loading,
    error,
    refresh: handleRefresh,
    refreshSession: () => session && refreshStoredSession(session),
    clearSession
  };
}
