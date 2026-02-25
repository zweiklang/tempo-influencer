import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';

export function useCredentials() {
  return useQuery({ queryKey: ['credentials'], queryFn: () => api.get('/api/settings/credentials') });
}

export function useSaveCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => api.put('/api/settings/credentials', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credentials'] }),
  });
}

export function useSelectedProject() {
  return useQuery({ queryKey: ['selected-project'], queryFn: () => api.get('/api/settings/project') });
}

export function useSaveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => api.put('/api/settings/project', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['selected-project'] }),
  });
}

export function useTempoProjects() {
  return useQuery({
    queryKey: ['tempo-projects'],
    queryFn: () => api.get('/api/settings/projects'),
    staleTime: 10 * 60 * 1000,
  });
}
