import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { useAppStore } from '@/store/appStore';

export function useWorklogs() {
  const { activePeriod } = useAppStore();
  return useQuery({
    queryKey: ['worklogs', activePeriod.from, activePeriod.to],
    queryFn: () => api.get(`/api/project/worklogs?from=${activePeriod.from}&to=${activePeriod.to}`),
    staleTime: 2 * 60 * 1000,
  });
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
