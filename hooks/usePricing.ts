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
      const root = data || {};
      const priceSource = (root.pricing && Object.keys(root.pricing).length > 0)
        ? root.pricing
        : root;

      const normalized: PricingConfig = {
        a4_bw: Number(priceSource.a4_bw ?? 2.0),
        a4_color: Number(priceSource.a4_color ?? 8.0),
        ...(priceSource.a3_bw != null && priceSource.a3_color != null ? { a3_bw: Number(priceSource.a3_bw), a3_color: Number(priceSource.a3_color) } : {}),
        ...(priceSource.a4_matt != null ? { a4_matt: Number(priceSource.a4_matt) } : {}),
        ...(priceSource.a4_glossy != null ? { a4_glossy: Number(priceSource.a4_glossy) } : {}),
        matt_enabled: root.matt_enabled,
        glossy_enabled: root.glossy_enabled,
        color_enabled: (root.color_enabled ?? root.colorEnabled),
        duplex_enabled: root.duplex_enabled
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
        color_enabled: true
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

  const calculatePrice = (
    paperSize: string,
    colorMode: string,
    pages: number,
    copies: number,
    paperType: 'normal' | 'matt' | 'glossy' = 'normal',
    duplex: boolean = false
  ): number => {
    if (!pricing) return 0;
    
    let pricePerPage = 2.0;

    if (paperType === 'matt' && pricing.a4_matt) {
      pricePerPage = pricing.a4_matt;
    } else if (paperType === 'glossy' && pricing.a4_glossy) {
      pricePerPage = pricing.a4_glossy;
    } else {
      const priceKey = `${paperSize.toLowerCase()}_${colorMode}` as keyof PricingConfig;
      const candidate = pricing[priceKey];
      if (typeof candidate === 'number') {
        pricePerPage = candidate;
      } else if (typeof pricing.a4_bw === 'number') {
        pricePerPage = pricing.a4_bw;
      }
    }

    const effectivePages = pages;
    const effectiveCopies = copies;
    const sheetsMultiplier = duplex ? 1 : 1;

    return effectivePages * effectiveCopies * pricePerPage * sheetsMultiplier;
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
