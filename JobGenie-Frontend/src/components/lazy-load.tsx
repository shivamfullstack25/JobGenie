import React, { useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { LoadingSpinner, SkeletonCard } from '@/components/ui/loading-spinner';

interface LazyLoadProps {
  children: ReactNode;
  fallback?: ReactNode;
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
  preload?: boolean;
  className?: string;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

export const LazyLoad: React.FC<LazyLoadProps> = ({
  children,
  fallback = <SkeletonCard />,
  threshold = 0.1,
  rootMargin = '50px',
  triggerOnce = true,
  preload = false,
  className,
  onLoad,
  onError
}) => {
  const [isVisible, setIsVisible] = useState(preload);
  const [hasLoaded, setHasLoaded] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || isVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [threshold, rootMargin, triggerOnce, isVisible]);

  useEffect(() => {
    if (isVisible && !hasLoaded) {
      setHasLoaded(true);
      onLoad?.();
    }
  }, [isVisible, hasLoaded, onLoad]);

  return (
    <div ref={elementRef} className={className}>
      {isVisible ? children : fallback}
    </div>
  );
};

// Component for lazy loading images with progressive enhancement
interface LazyImageProps {
  src: string;
  alt: string;
  placeholderSrc?: string;
  className?: string;
  onLoad?: () => void;
  onError?: (error: Event) => void;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  placeholderSrc,
  className,
  onLoad,
  onError
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !isVisible) return;

    const handleLoad = () => {
      setIsLoaded(true);
      onLoad?.();
    };

    const handleError = (event: Event) => {
      setHasError(true);
      onError?.(event);
    };

    img.addEventListener('load', handleLoad);
    img.addEventListener('error', handleError);

    return () => {
      img.removeEventListener('load', handleLoad);
      img.removeEventListener('error', handleError);
    };
  }, [isVisible, onLoad, onError]);

  return (
    <LazyLoad onLoad={() => setIsVisible(true)}>
      <div className={`relative ${className}`}>
        {placeholderSrc && !isLoaded && !hasError && (
          <img
            src={placeholderSrc}
            alt={alt}
            className="absolute inset-0 w-full h-full object-cover filter blur-sm"
          />
        )}
        
        {isVisible && (
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
        
        {!isLoaded && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <LoadingSpinner size="sm" />
          </div>
        )}
        
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-500">
            Failed to load image
          </div>
        )}
      </div>
    </LazyLoad>
  );
};

// Hook for lazy loading data/components
export const useLazyLoad = <T,>(
  loader: () => Promise<T>,
  deps: any[] = []
) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (hasLoadedRef.current) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await loader();
      setData(result);
      hasLoadedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, deps);

  return { data, loading, error, load };
};

// Component for lazy loading React components
interface LazyComponentProps {
  loader: () => Promise<{ default: React.ComponentType<any> }>;
  fallback?: ReactNode;
  props?: any;
}

export const LazyComponent: React.FC<LazyComponentProps> = ({
  loader,
  fallback = <LoadingSpinner />,
  props = {}
}) => {
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadComponent = useCallback(async () => {
    if (Component || loading) return;

    setLoading(true);
    try {
      const module = await loader();
      setComponent(() => module.default);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load component'));
    } finally {
      setLoading(false);
    }
  }, [loader, Component, loading]);

  if (error) {
    return (
      <div className="p-4 text-center text-red-600">
        Failed to load component: {error.message}
      </div>
    );
  }

  if (!Component) {
    return (
      <LazyLoad onLoad={loadComponent}>
        {fallback}
      </LazyLoad>
    );
  }

  return <Component {...props} />;
};

// Preloader for preloading components/data
class Preloader {
  private cache = new Map<string, Promise<any>>();

  preload<T>(key: string, loader: () => Promise<T>): Promise<T> {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const promise = loader().catch(error => {
      // Remove failed promises from cache so they can be retried
      this.cache.delete(key);
      throw error;
    });

    this.cache.set(key, promise);
    return promise;
  }

  get<T>(key: string): Promise<T> | undefined {
    return this.cache.get(key);
  }

  clear(key?: string) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}

export const preloader = new Preloader();

// Hook for preloading resources
export const usePreload = () => {
  const preloadComponent = useCallback((
    key: string,
    loader: () => Promise<{ default: React.ComponentType<any> }>
  ) => {
    return preloader.preload(key, loader);
  }, []);

  const preloadData = useCallback(<T,>(
    key: string,
    loader: () => Promise<T>
  ) => {
    return preloader.preload(key, loader);
  }, []);

  return { preloadComponent, preloadData };
};

// Virtual scrolling component for large lists
interface VirtualScrollProps {
  items: any[];
  renderItem: (item: any, index: number) => ReactNode;
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
  className?: string;
}

export const VirtualScroll: React.FC<VirtualScrollProps> = ({
  items,
  renderItem,
  itemHeight,
  containerHeight,
  overscan = 5,
  className
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = items.slice(startIndex, endIndex + 1);
  const totalHeight = items.length * itemHeight;
  const offsetY = startIndex * itemHeight;

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => (
            <div key={startIndex + index} style={{ height: itemHeight }}>
              {renderItem(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}; 