'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Dashboard Data Cache Hook
 * Provides instant data loading with stale-while-revalidate pattern
 * 
 * Features:
 * - Shows cached data immediately on page load
 * - Fetches fresh data in background
 * - Stores data in localStorage for persistence across page reloads
 * - Automatic cache expiry (configurable TTL)
 */

interface CachedData<T> {
    data: T;
    timestamp: number;
    cacheKey: string;
}

interface UseDashboardDataOptions<T> {
    /** Unique cache key for this data */
    cacheKey: string;
    /** Time-to-live in milliseconds (default: 5 minutes) */
    ttl?: number;
    /** Function to fetch fresh data */
    fetchFn: () => Promise<T>;
    /** Whether to enable caching (default: true) */
    enableCache?: boolean;
    /** Called when data is successfully fetched */
    onSuccess?: (data: T) => void;
    /** Called when fetch fails */
    onError?: (error: Error) => void;
}

interface UseDashboardDataReturn<T> {
    /** The data (cached or fresh) */
    data: T | null;
    /** Whether initial data is loading (no cache available) */
    isLoading: boolean;
    /** Whether fresh data is being fetched in background */
    isRefreshing: boolean;
    /** Whether data is from cache */
    isFromCache: boolean;
    /** Any error that occurred */
    error: Error | null;
    /** Manually trigger a refresh */
    refresh: (forceRefresh?: boolean) => Promise<void>;
    /** Clear the cache */
    clearCache: () => void;
    /** Cache age in seconds */
    cacheAge: number | null;
}

const CACHE_PREFIX = 'dashboard_cache_';
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached data from localStorage
 */
function getCachedData<T>(cacheKey: string): CachedData<T> | null {
    if (typeof window === 'undefined') return null;

    try {
        const stored = localStorage.getItem(`${CACHE_PREFIX}${cacheKey}`);
        if (!stored) return null;

        const parsed = JSON.parse(stored) as CachedData<T>;
        return parsed;
    } catch (error) {
        console.warn('[CACHE_HOOK] Failed to parse cached data:', error);
        return null;
    }
}

/**
 * Store data in localStorage cache
 */
function setCachedData<T>(cacheKey: string, data: T): void {
    if (typeof window === 'undefined') return;

    try {
        const cacheEntry: CachedData<T> = {
            data,
            timestamp: Date.now(),
            cacheKey,
        };
        localStorage.setItem(`${CACHE_PREFIX}${cacheKey}`, JSON.stringify(cacheEntry));
        console.log(`[CACHE_HOOK] Cached data for ${cacheKey}`);
    } catch (error) {
        console.warn('[CACHE_HOOK] Failed to cache data:', error);
        // If storage is full, try to clear old entries
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
            clearOldCacheEntries();
        }
    }
}

/**
 * Clear cache entries older than 1 hour
 */
function clearOldCacheEntries(): void {
    if (typeof window === 'undefined') return;

    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_PREFIX)) {
            try {
                const stored = localStorage.getItem(key);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed.timestamp < oneHourAgo) {
                        keysToRemove.push(key);
                    }
                }
            } catch {
                keysToRemove.push(key!);
            }
        }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`[CACHE_HOOK] Cleared ${keysToRemove.length} old cache entries`);
}

/**
 * Custom hook for dashboard data with caching
 */
export function useDashboardData<T>({
    cacheKey,
    ttl = DEFAULT_TTL,
    fetchFn,
    enableCache = true,
    onSuccess,
    onError,
}: UseDashboardDataOptions<T>): UseDashboardDataReturn<T> {
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isFromCache, setIsFromCache] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [cacheAge, setCacheAge] = useState<number | null>(null);

    const fetchInProgressRef = useRef(false);
    const mountedRef = useRef(true);

    // Load cached data on mount
    useEffect(() => {
        if (!enableCache) return;

        const cached = getCachedData<T>(cacheKey);
        if (cached) {
            const age = Date.now() - cached.timestamp;
            const isStale = age > ttl;

            // Always show cached data immediately 
            setData(cached.data);
            setIsFromCache(true);
            setCacheAge(Math.round(age / 1000));
            setIsLoading(false);

            console.log(`[CACHE_HOOK] Loaded cached data for ${cacheKey} (age: ${Math.round(age / 1000)}s, stale: ${isStale})`);
        }
    }, [cacheKey, enableCache, ttl]);

    // Fetch fresh data function
    const fetchData = useCallback(async (forceRefresh = false): Promise<void> => {
        if (fetchInProgressRef.current) {
            console.log('[CACHE_HOOK] Fetch already in progress, skipping');
            return;
        }

        fetchInProgressRef.current = true;

        // Determine if we have cached data
        const cached = enableCache ? getCachedData<T>(cacheKey) : null;
        const hasCachedData = !!cached;

        // If we have cached data, show refreshing indicator instead of full loading
        if (hasCachedData) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        setError(null);

        try {
            console.log(`[CACHE_HOOK] Fetching fresh data for ${cacheKey}${forceRefresh ? ' (force refresh)' : ''}`);
            const freshData = await fetchFn();

            if (!mountedRef.current) return;

            setData(freshData);
            setIsFromCache(false);
            setCacheAge(0);

            // Cache the fresh data
            if (enableCache) {
                setCachedData(cacheKey, freshData);
            }

            onSuccess?.(freshData);
            console.log(`[CACHE_HOOK] Fresh data loaded for ${cacheKey}`);

        } catch (err) {
            console.error(`[CACHE_HOOK] Error fetching data for ${cacheKey}:`, err);

            if (!mountedRef.current) return;

            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            onError?.(error);

            // If we have cached data and fetch fails, keep showing cached data
            if (hasCachedData) {
                console.log('[CACHE_HOOK] Keeping cached data after fetch error');
            }
        } finally {
            if (mountedRef.current) {
                setIsLoading(false);
                setIsRefreshing(false);
            }
            fetchInProgressRef.current = false;
        }
    }, [cacheKey, enableCache, fetchFn, onSuccess, onError]);

    // Initial fetch on mount or when cache key changes
    useEffect(() => {
        mountedRef.current = true;

        // If we have cached data, fetch in background
        // If no cached data, fetch immediately
        const cached = enableCache ? getCachedData<T>(cacheKey) : null;

        if (cached) {
            const age = Date.now() - cached.timestamp;
            const isStale = age > ttl;

            // If data is stale or doesn't exist, fetch fresh
            if (isStale) {
                console.log(`[CACHE_HOOK] Cache stale for ${cacheKey}, fetching fresh data in background`);
                fetchData();
            } else {
                console.log(`[CACHE_HOOK] Cache fresh for ${cacheKey}, skipping background fetch`);
                setIsLoading(false);
            }
        } else {
            // No cache, fetch immediately
            fetchData();
        }

        return () => {
            mountedRef.current = false;
        };
    }, [cacheKey, enableCache, ttl, fetchData]);

    // Manual refresh function
    const refresh = useCallback(async (forceRefresh = false): Promise<void> => {
        if (forceRefresh && enableCache) {
            // Clear cache before refreshing
            localStorage.removeItem(`${CACHE_PREFIX}${cacheKey}`);
            console.log(`[CACHE_HOOK] Cleared cache for ${cacheKey}`);
        }
        await fetchData(forceRefresh);
    }, [cacheKey, enableCache, fetchData]);

    // Clear cache function
    const clearCache = useCallback((): void => {
        localStorage.removeItem(`${CACHE_PREFIX}${cacheKey}`);
        setIsFromCache(false);
        setCacheAge(null);
        console.log(`[CACHE_HOOK] Cache cleared for ${cacheKey}`);
    }, [cacheKey]);

    return {
        data,
        isLoading,
        isRefreshing,
        isFromCache,
        error,
        refresh,
        clearCache,
        cacheAge,
    };
}

/**
 * Generate a cache key from parameters
 */
export function generateCacheKey(params: {
    feed: 'predicto' | 'adsense' | 'compado';
    accountId: string | string[];
    startDate: string;
    endDate: string;
}): string {
    const { feed, accountId, startDate, endDate } = params;
    const accounts = Array.isArray(accountId) ? accountId.sort().join(',') : accountId;
    return `${feed}:${accounts}:${startDate}:${endDate}`;
}

export default useDashboardData;
