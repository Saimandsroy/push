'use client';

import { useState, useEffect } from 'react';
import { PricingConfig } from '@/lib/types';
import { fetchWithLoadBalancer, TimeoutError } from '@/lib/api';

const CACHE_KEY = 'printshop_pricing_cache';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

interface CachedPricing {
  data: PricingConfig;
  timestamp: number;
}

export function usePricing() {
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const getCachedPricing = (): PricingConfig | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsedCache: CachedPricing = JSON.parse(cached);
        const now = Date.now();
        
        if (now - parsedCache.timestamp < CACHE_DURATION) {
          return parsedCache.data;
        }
      }
    } catch (error) {
      console.warn('Failed to read pricing cache:', error);
    }
    return null;
  };

  const cachePricing = (pricingData: PricingConfig) => {
    try {
      const cacheData: CachedPricing = {
        data: pricingData,
        timestamp: Date.now()
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Failed to cache pricing:', error);
    }
  };

  const fetchPricing = async (useCache = true) => {
    try {
      setLoading(true);
      console.log('[Pricing] Starting pricing fetch...');
      
      // Try cache first if enabled
      if (useCache) {
        const cachedData = getCachedPricing();
        if (cachedData) {
          console.log('[Pricing] Using cached pricing:', cachedData);
          setPricing(cachedData);
          setError('');
          setLoading(false);
          return;
        }
      }

      // Fetch from backend with load balancing
      const resp = await fetchWithLoadBalancer('/customer/pricing', { 
        headers: { 'Accept': 'application/json' } 
      }, { 
        timeoutMs: 25_000 
      });

      if (!resp.ok) {
        throw new Error(`Failed to fetch pricing (${resp.status})`);
      }

      const data = await resp.json().catch(() => ({} as any));
      const p = data?.pricing || {};

      const normalized: PricingConfig = {
        a4_bw: Number(p.a4_bw ?? 2.0),
        a4_color: Number(p.a4_color ?? 8.0),
        ...(p.a3_bw != null && p.a3_color != null ? { a3_bw: Number(p.a3_bw), a3_color: Number(p.a3_color) } : {})
      };

      console.log('[Pricing] Loaded from backend:', normalized);
      setPricing(normalized);
      cachePricing(normalized);
      setError('');
      
    } catch (err) {
      console.error('Error in pricing initialization:', err);
      setError(err instanceof Error ? err.message : 'Failed to load pricing');
      
      // Fallback to default pricing
      const defaultPricing: PricingConfig = {
        a4_bw: 2.00,
        a4_color: 8.00,
      };
      setPricing(defaultPricing);
    } finally {
      setLoading(false);
      console.log('[Pricing] Pricing initialization complete. loading = false');
    }
  };

  useEffect(() => {
    fetchPricing();
  }, []);

  const calculatePrice = (paperSize: string, colorMode: string, pages: number, copies: number): number => {
    if (!pricing) return 0;
    
    const priceKey = `${paperSize.toLowerCase()}_${colorMode}` as keyof PricingConfig;
    const pricePerPage = pricing[priceKey] || 2.00;
    return pages * copies * pricePerPage;
  };

  const refreshPricing = () => {
    fetchPricing(false); // Force refresh without cache
  };

  return {
    pricing,
    loading,
    error,
    calculatePrice,
    refetch: fetchPricing,
    refresh: refreshPricing
  };
}
