'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface CachedData<T> {
    data: T;
    timestamp: number;
    cacheKey: string;
}

interface UseDashboardDataOptions<T> {
    cacheKey: string;
    ttl?: number;
    fetchFn: () => Promise<T>;
    enableCache?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
}

interface UseDashboardDataReturn<T> {
    data: T | null;
    isLoading: boolean;
    isRefreshing: boolean;
    isFromCache: boolean;
    error: Error | null;
    refresh: (forceRefresh?: boolean) => Promise<void>;
    clearCache: () => void;
    cacheAge: number | null;
}

const CACHE_PREFIX = 'dashboard_cache_';
const DEFAULT_TTL = 5 * 60 * 1000;

function getCachedData<T>(cacheKey: string): CachedData<T> | null {
    if (typeof window === 'undefined') return null;

    try {
        const stored = localStorage.getItem(`${CACHE_PREFIX}${cacheKey}`);
        if (!stored) return null;
        return JSON.parse(stored) as CachedData<T>;
    } catch {
        return null;
    }
}

function setCachedData<T>(cacheKey: string, data: T): void {
    if (typeof window === 'undefined') return;

    try {
        const cacheEntry: CachedData<T> = {
            data,
            timestamp: Date.now(),
            cacheKey,
        };
        localStorage.setItem(`${CACHE_PREFIX}${cacheKey}`, JSON.stringify(cacheEntry));
    } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
            clearOldCacheEntries();
        }
    }
}

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
}

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

    useEffect(() => {
        if (!enableCache) return;

        const cached = getCachedData<T>(cacheKey);
        if (cached) {
            const age = Date.now() - cached.timestamp;
            setData(cached.data);
            setIsFromCache(true);
            setCacheAge(Math.round(age / 1000));
            setIsLoading(false);
        }
    }, [cacheKey, enableCache, ttl]);

    const fetchData = useCallback(async (forceRefresh = false): Promise<void> => {
        if (fetchInProgressRef.current) return;

        fetchInProgressRef.current = true;

        const cached = enableCache ? getCachedData<T>(cacheKey) : null;
        const hasCachedData = !!cached;

        if (hasCachedData) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        setError(null);

        try {
            const freshData = await fetchFn();

            if (!mountedRef.current) return;

            setData(freshData);
            setIsFromCache(false);
            setCacheAge(0);

            if (enableCache) {
                setCachedData(cacheKey, freshData);
            }

            onSuccess?.(freshData);
        } catch (err) {
            if (!mountedRef.current) return;

            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            onError?.(error);
        } finally {
            if (mountedRef.current) {
                setIsLoading(false);
                setIsRefreshing(false);
            }
            fetchInProgressRef.current = false;
        }
    }, [cacheKey, enableCache, fetchFn, onSuccess, onError]);

    useEffect(() => {
        mountedRef.current = true;

        const cached = enableCache ? getCachedData<T>(cacheKey) : null;

        if (cached) {
            const age = Date.now() - cached.timestamp;
            const isStale = age > ttl;

            if (isStale) {
                fetchData();
            } else {
                setIsLoading(false);
            }
        } else {
            fetchData();
        }

        return () => {
            mountedRef.current = false;
        };
    }, [cacheKey, enableCache, ttl, fetchData]);

    const refresh = useCallback(async (forceRefresh = false): Promise<void> => {
        if (forceRefresh && enableCache) {
            localStorage.removeItem(`${CACHE_PREFIX}${cacheKey}`);
        }
        await fetchData(forceRefresh);
    }, [cacheKey, enableCache, fetchData]);

    const clearCache = useCallback((): void => {
        localStorage.removeItem(`${CACHE_PREFIX}${cacheKey}`);
        setIsFromCache(false);
        setCacheAge(null);
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
