import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { useAppStore } from '@/store/appStore';

export interface WorklogEntry {
  accountId: string;
  displayName: string;
  role?: string;
  issueKey?: string;
  issueSummary?: string;
  startDate: string;
  hours: number;
  billingRate?: number;
  rateSource?: 'override' | 'global' | 'project-default' | 'none';
  revenue?: number;
}

interface StreamState {
  isLoading: boolean;
  progress: number;
  message: string;
  data: WorklogEntry[] | null;
  error: string | null;
}

export function useWorklogsStream(): StreamState {
  const { activePeriod } = useAppStore();
  const [state, setState] = useState<StreamState>({
    isLoading: false,
    progress: 0,
    message: '',
    data: null,
    error: null,
  });

  useEffect(() => {
    setState({ isLoading: true, progress: 0, message: 'Starting...', data: null, error: null });

    const es = new EventSource(
      `/api/project/worklogs/stream?from=${activePeriod.from}&to=${activePeriod.to}`
    );

    es.onmessage = (event) => {
      const payload = JSON.parse(event.data as string);
      if (payload.stage === 'complete') {
        setState({ isLoading: false, progress: 100, message: '', data: payload.data, error: null });
        es.close();
      } else if (payload.stage === 'error') {
        setState((prev) => ({ ...prev, isLoading: false, error: payload.message as string }));
        es.close();
      } else {
        setState((prev) => ({
          ...prev,
          progress: payload.progress ?? prev.progress,
          message: payload.message ?? prev.message,
        }));
      }
    };

    es.onerror = () => {
      setState((prev) => ({ ...prev, isLoading: false, error: 'Connection error' }));
      es.close();
    };

    return () => {
      es.close();
    };
  }, [activePeriod.from, activePeriod.to]);

  return state;
}

export function useRevenue() {
  const { activePeriod } = useAppStore();
  return useQuery({
    queryKey: ['revenue', activePeriod.from, activePeriod.to],
    queryFn: () => api.get(`/api/project/revenue?from=${activePeriod.from}&to=${activePeriod.to}`),
    staleTime: 2 * 60 * 1000,
  });
}

export function useBudget() {
  return useQuery({
    queryKey: ['budget'],
    queryFn: () => api.get('/api/project/budget'),
    staleTime: 5 * 60 * 1000,
  });
}
