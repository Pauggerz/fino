import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Module-level deduplication map — prevents duplicate in-flight network requests
// for the same cache key across multiple hook instances.
const inFlightRequests = new Map<string, Promise<void>>();

/**
 * Stale-While-Revalidate data hook.
 *
 * - Reads from AsyncStorage immediately (0-ms render if cached).
 * - Fires a background fetch to Supabase; silently updates if data changed.
 * - `mutate` lets callers apply optimistic updates before the network roundtrip.
 * - `refetch` re-runs the fetcher explicitly (e.g. after a confirmed write).
 *
 * The fetcher may return a native Promise or a PromiseLike (e.g. Supabase
 * PostgrestFilterBuilder), so we accept PromiseLike here and wrap with
 * Promise.resolve() internally when we need full Promise semantics.
 */
export function useCachedQuery<T>(
  key: string,
  fetcher: () => PromiseLike<{ data: T[] | null; error: unknown }>,
): {
  data: T[];
  loading: boolean;
  mutate: (newData: T[]) => Promise<void>;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  // Always keep a ref to the latest fetcher so the effect closure never stales
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Track mounted state so we never setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Optimistically overwrite both in-memory state and the AsyncStorage cache. */
  const mutate = useCallback(
    async (newData: T[]) => {
      if (mountedRef.current) setData(newData);
      try {
        await AsyncStorage.setItem(key, JSON.stringify(newData));
      } catch (e) {
        if (__DEV__) console.error(`[useCachedQuery] mutate cache write failed (${key})`, e);
      }
    },
    [key],
  );

  /**
   * Background revalidation. Deduplicates concurrent calls with the same key
   * so only one network request is ever in flight per key at a time.
   */
  const refetch = useCallback(async () => {
    if (inFlightRequests.has(key)) {
      return inFlightRequests.get(key);
    }

    const request = (async () => {
      try {
        const { data: remote, error } = await Promise.resolve(fetcherRef.current());
        if (error || !remote) return;
        if (!mountedRef.current) return;

        await AsyncStorage.setItem(key, JSON.stringify(remote)).catch(() => {});
        if (mountedRef.current) setData(remote);
      } catch (e) {
        if (__DEV__) console.error(`[useCachedQuery] background fetch failed (${key})`, e);
      }
    })();

    inFlightRequests.set(key, request.finally(() => inFlightRequests.delete(key)));
    return inFlightRequests.get(key);
  }, [key]);

  // Initial load: serve cache instantly, then revalidate in background
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // 1. Serve stale cache immediately — no loading flash for returning users
      try {
        const cached = await AsyncStorage.getItem(key);
        if (cached && !cancelled) {
          setData(JSON.parse(cached));
          setLoading(false);
        }
      } catch (e) {
        if (__DEV__) console.error(`[useCachedQuery] cache read failed (${key})`, e);
      }

      // 2. Revalidate in the background
      if (!cancelled) {
        await refetch();
        // If no cache existed, refetch just populated data — clear the spinner
        if (!cancelled && mountedRef.current) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // key is the only real dependency — fetcher changes are handled via fetcherRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, mutate, refetch };
}
