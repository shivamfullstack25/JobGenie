import { useState, useEffect, useCallback } from 'react';

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  storage?: 'memory' | 'sessionStorage' | 'localStorage';
  maxSize?: number; // Maximum number of entries
  prefix?: string; // Key prefix for namespacing
  serialize?: boolean; // Whether to serialize complex objects
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

class CacheManager {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private maxMemorySize = 100;

  set<T>(
    key: string, 
    data: T, 
    options: CacheOptions = {}
  ): void {
    const {
      ttl = 5 * 60 * 1000, // 5 minutes default
      storage = 'memory',
      serialize = true
    } = options;

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    const finalKey = this.getFinalKey(key, options.prefix);

    switch (storage) {
      case 'memory':
        this.setMemoryCache(finalKey, entry);
        break;
      case 'sessionStorage':
        this.setStorageCache(finalKey, entry, sessionStorage, serialize);
        break;
      case 'localStorage':
        this.setStorageCache(finalKey, entry, localStorage, serialize);
        break;
    }
  }

  get<T>(
    key: string, 
    options: CacheOptions = {}
  ): T | null {
    const finalKey = this.getFinalKey(key, options.prefix);
    const { storage = 'memory', serialize = true } = options;

    let entry: CacheEntry<T> | null = null;

    switch (storage) {
      case 'memory':
        entry = this.memoryCache.get(finalKey) || null;
        break;
      case 'sessionStorage':
        entry = this.getStorageCache(finalKey, sessionStorage, serialize);
        break;
      case 'localStorage':
        entry = this.getStorageCache(finalKey, localStorage, serialize);
        break;
    }

    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.delete(key, options);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    // Update the cache with new access info
    this.set(finalKey, entry.data, { ...options, ttl: entry.ttl });

    return entry.data;
  }

  delete(key: string, options: CacheOptions = {}): void {
    const finalKey = this.getFinalKey(key, options.prefix);
    const { storage = 'memory' } = options;

    switch (storage) {
      case 'memory':
        this.memoryCache.delete(finalKey);
        break;
      case 'sessionStorage':
        sessionStorage.removeItem(finalKey);
        break;
      case 'localStorage':
        localStorage.removeItem(finalKey);
        break;
    }
  }

  clear(options: CacheOptions = {}): void {
    const { storage = 'memory', prefix } = options;

    switch (storage) {
      case 'memory':
        if (prefix) {
          const keysToDelete = Array.from(this.memoryCache.keys())
            .filter(key => key.startsWith(prefix));
          keysToDelete.forEach(key => this.memoryCache.delete(key));
        } else {
          this.memoryCache.clear();
        }
        break;
      case 'sessionStorage':
        this.clearStorage(sessionStorage, prefix);
        break;
      case 'localStorage':
        this.clearStorage(localStorage, prefix);
        break;
    }
  }

  getStats(options: CacheOptions = {}): {
    size: number;
    keys: string[];
    totalAccess: number;
    averageAge: number;
  } {
    const { storage = 'memory', prefix } = options;
    
    let entries: [string, CacheEntry<any>][] = [];

    switch (storage) {
      case 'memory':
        entries = Array.from(this.memoryCache.entries())
          .filter(([key]) => !prefix || key.startsWith(prefix));
        break;
      default:
        // For storage-based caches, we'd need to iterate through all keys
        // This is a simplified version
        entries = [];
    }

    const totalAccess = entries.reduce((sum, [, entry]) => sum + entry.accessCount, 0);
    const averageAge = entries.length > 0 
      ? entries.reduce((sum, [, entry]) => sum + (Date.now() - entry.timestamp), 0) / entries.length
      : 0;

    return {
      size: entries.length,
      keys: entries.map(([key]) => key),
      totalAccess,
      averageAge
    };
  }

  private getFinalKey(key: string, prefix?: string): string {
    return prefix ? `${prefix}:${key}` : key;
  }

  private setMemoryCache<T>(key: string, entry: CacheEntry<T>): void {
    // Implement LRU eviction if cache is full
    if (this.memoryCache.size >= this.maxMemorySize) {
      const oldestKey = this.findLeastRecentlyUsed();
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }
    this.memoryCache.set(key, entry);
  }

  private setStorageCache<T>(
    key: string, 
    entry: CacheEntry<T>, 
    storage: Storage,
    serialize: boolean
  ): void {
    try {
      const value = serialize ? JSON.stringify(entry) : entry;
      storage.setItem(key, value as string);
    } catch (error) {
      console.warn('Failed to set cache in storage:', error);
    }
  }

  private getStorageCache<T>(
    key: string, 
    storage: Storage,
    serialize: boolean
  ): CacheEntry<T> | null {
    try {
      const value = storage.getItem(key);
      if (!value) return null;
      return serialize ? JSON.parse(value) : (value as unknown as CacheEntry<T>);
    } catch (error) {
      console.warn('Failed to get cache from storage:', error);
      return null;
    }
  }

  private clearStorage(storage: Storage, prefix?: string): void {
    if (prefix) {
      const keysToDelete = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(prefix)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => storage.removeItem(key));
    } else {
      storage.clear();
    }
  }

  private findLeastRecentlyUsed(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    return oldestKey;
  }
}

// Global cache manager instance
const cacheManager = new CacheManager();

// React hook for caching
export const useCache = <T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cachedData = cacheManager.get<T>(key, options);
      if (cachedData) {
        setData(cachedData);
        return cachedData;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetcher();
      cacheManager.set(key, result, options);
      setData(result);
      setLoading(false);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setLoading(false);
      throw error;
    }
  }, [key, fetcher, options]);

  const invalidate = useCallback(() => {
    cacheManager.delete(key, options);
    setData(null);
  }, [key, options]);

  const refresh = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refresh,
    invalidate,
    fetchData
  };
};

// Specialized hooks for common use cases
export const useApiCache = <T>(
  endpoint: string,
  fetcher: () => Promise<T>,
  ttl = 5 * 60 * 1000 // 5 minutes
) => {
  return useCache(
    `api:${endpoint}`,
    fetcher,
    { ttl, storage: 'memory', prefix: 'api' }
  );
};

export const useUserDataCache = <T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = 30 * 60 * 1000 // 30 minutes
) => {
  return useCache(
    key,
    fetcher,
    { ttl, storage: 'sessionStorage', prefix: 'user' }
  );
};

export const useStaticDataCache = <T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = 24 * 60 * 60 * 1000 // 24 hours
) => {
  return useCache(
    key,
    fetcher,
    { ttl, storage: 'localStorage', prefix: 'static' }
  );
};

// Cache utilities
export const clearAllCaches = () => {
  cacheManager.clear({ storage: 'memory' });
  cacheManager.clear({ storage: 'sessionStorage' });
  cacheManager.clear({ storage: 'localStorage' });
};

export const getCacheStats = () => ({
  memory: cacheManager.getStats({ storage: 'memory' }),
  session: cacheManager.getStats({ storage: 'sessionStorage' }),
  local: cacheManager.getStats({ storage: 'localStorage' })
});

export default cacheManager; 