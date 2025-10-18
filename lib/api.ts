// ============================================
// LOAD BALANCER CONFIGURATION
// ============================================

// List of backend servers for round-robin load balancing
const BACKEND_SERVERS = [
  'https://b12.prane.in/api',
  'https://b13.prane.in/api',
  'https://b14.prane.in/api',
];

// Round-robin index (server-side safe with module-level state)
let currentServerIndex = 0;

/**
 * Get next server in round-robin fashion
 * Used for initial server selection
 */
function getNextServer(): string {
  const server = BACKEND_SERVERS[currentServerIndex];
  currentServerIndex = (currentServerIndex + 1) % BACKEND_SERVERS.length;
  return server;
}

/**
 * Get sticky server for the current user
 * Uses localStorage to maintain session affinity
 * Falls back to round-robin if no sticky server exists
 */
function getStickyServer(): string {
  // Check if we're in browser environment
  if (typeof window === 'undefined') {
    // Server-side: use round-robin
    return getNextServer();
  }

  try {
    let server = localStorage.getItem('selectedServer');
    
    if (!server || !BACKEND_SERVERS.includes(server)) {
      // No sticky server or invalid server, assign new one
      server = getNextServer();
      localStorage.setItem('selectedServer', server);
      console.log(`[Load Balancer] Assigned sticky server: ${server}`);
    }
    
    return server;
  } catch (error) {
    // localStorage might be disabled, fall back to round-robin
    console.warn('[Load Balancer] localStorage unavailable, using round-robin');
    return getNextServer();
  }
}

/**
 * Clear sticky server assignment
 * Useful when a server fails and you want to reassign
 */
export function clearStickyServer(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('selectedServer');
      console.log('[Load Balancer] Cleared sticky server');
    } catch (error) {
      console.warn('[Load Balancer] Could not clear sticky server');
    }
  }
}

/**
 * Get current sticky server without modifying it
 */
export function getCurrentServer(): string {
  return getStickyServer();
}

// Export the base API URL (uses sticky session)
export const API_BASE = getStickyServer();

export function apiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  if (!path.startsWith('/')) path = '/' + path;
  
  // Use sticky server for consistent routing
  const baseUrl = getStickyServer();
  return `${baseUrl}${path}`;
}

// Client-side direct upload endpoint. In production, point this to your Cloudflare Worker URL.
// Example: https://your-worker.your-account.workers.dev/upload
export const UPLOAD_ENDPOINT = process.env.NEXT_PUBLIC_UPLOAD_URL || '/api/upload/direct';

// Simple fetch wrapper with timeout detection
export interface FetchWithTimeoutOptions {
  timeoutMs?: number; // default 30s
  abortSignal?: AbortSignal;
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  opts: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 40_000; // 40s default
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Chain external abort signal if provided
  if (opts.abortSignal) {
    opts.abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new TimeoutError(`Request timed out after ${timeoutMs}ms. Please try again.`);
    }
    throw error;
  }
}

// ============================================
// LOAD BALANCED FETCH WITH FAILOVER
// ============================================

export interface LoadBalancedFetchOptions extends FetchWithTimeoutOptions {
  retryOnFailure?: boolean; // default true
  maxRetries?: number; // default: try all servers
}

/**
 * Fetch with load balancing and automatic failover
 * Uses sticky sessions by default, but falls back to other servers on failure
 */
export async function fetchWithLoadBalancer(
  path: string,
  init: RequestInit = {},
  opts: LoadBalancedFetchOptions = {}
): Promise<Response> {
  const { retryOnFailure = true, maxRetries = BACKEND_SERVERS.length, ...timeoutOpts } = opts;
  
  // First attempt: use sticky server
  const stickyServer = getStickyServer();
  const url = path.startsWith('http') ? path : `${stickyServer}${path.startsWith('/') ? path : '/' + path}`;
  
  try {
    console.log(`[Load Balancer] Attempting request to sticky server: ${stickyServer}`);
    const response = await fetchWithTimeout(url, init, timeoutOpts);
    
    if (response.ok) {
      return response;
    }
    
    // Non-2xx response
    console.warn(`[Load Balancer] Sticky server returned ${response.status}, attempting failover...`);
    
    if (!retryOnFailure) {
      return response;
    }
  } catch (error: any) {
    console.error(`[Load Balancer] Sticky server failed:`, error.message);
    
    if (!retryOnFailure) {
      throw error;
    }
  }
  
  // Failover: try other servers
  if (retryOnFailure) {
    console.log('[Load Balancer] Initiating failover to other servers...');
    
    // Clear sticky server so next request gets a new one
    clearStickyServer();
    
    const serversToTry = BACKEND_SERVERS.filter(s => s !== stickyServer);
    
    for (let i = 0; i < Math.min(serversToTry.length, maxRetries - 1); i++) {
      const fallbackServer = serversToTry[i];
      const fallbackUrl = path.startsWith('http') ? path : `${fallbackServer}${path.startsWith('/') ? path : '/' + path}`;
      
      try {
        console.log(`[Load Balancer] Trying fallback server: ${fallbackServer}`);
        const response = await fetchWithTimeout(fallbackUrl, init, timeoutOpts);
        
        if (response.ok) {
          // Success! Set this as new sticky server
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('selectedServer', fallbackServer);
              console.log(`[Load Balancer] Switched sticky server to: ${fallbackServer}`);
            } catch (e) {
              // Ignore localStorage errors
            }
          }
          return response;
        }
        
        console.warn(`[Load Balancer] Fallback server ${fallbackServer} returned ${response.status}`);
      } catch (error: any) {
        console.error(`[Load Balancer] Fallback server ${fallbackServer} failed:`, error.message);
      }
    }
  }
  
  throw new Error('All backend servers failed. Please try again later.');
}
