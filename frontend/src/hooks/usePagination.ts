/**
 * Custom hook for pagination state management
 * Consolidates duplicate pagination logic from across the codebase
 */

import { useState, useEffect, useCallback } from 'react';

interface UsePaginationOptions {
  /** Key for localStorage persistence */
  storageKey: string;
  /** Default page size if not saved */
  defaultPageSize?: number;
  /** Initial page number */
  initialPage?: number;
}

interface UsePaginationReturn {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setTotal: (total: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (page: number) => void;
  reset: () => void;
}

export const usePagination = ({
  storageKey,
  defaultPageSize = 25,
  initialPage = 1
}: UsePaginationOptions): UsePaginationReturn => {
  const [page, setPageState] = useState(initialPage);
  const [total, setTotal] = useState(0);

  // Load page size from localStorage or use default
  const [pageSize, setPageSizeState] = useState(() => {
    if (typeof window === 'undefined') return defaultPageSize;
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : defaultPageSize;
  });

  // Persist page size to localStorage
  useEffect(() => {
    localStorage.setItem(storageKey, pageSize.toString());
  }, [storageKey, pageSize]);

  const totalPages = Math.ceil(total / pageSize) || 1;

  const setPage = useCallback((newPage: number) => {
    setPageState(Math.max(1, Math.min(newPage, totalPages)));
  }, [totalPages]);

  const setPageSize = useCallback((newSize: number) => {
    setPageSizeState(newSize);
    setPageState(1); // Reset to first page when changing page size
  }, []);

  const nextPage = useCallback(() => {
    setPageState(prev => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setPageState(prev => Math.max(prev - 1, 1));
  }, []);

  const goToPage = useCallback((targetPage: number) => {
    setPageState(Math.max(1, Math.min(targetPage, totalPages)));
  }, [totalPages]);

  const reset = useCallback(() => {
    setPageState(initialPage);
  }, [initialPage]);

  return {
    page,
    pageSize,
    total,
    totalPages,
    setPage,
    setPageSize,
    setTotal,
    nextPage,
    prevPage,
    goToPage,
    reset
  };
};

export default usePagination;
