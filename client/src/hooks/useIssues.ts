import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { useAppStore } from '@/store/appStore';

export function useOpenIssues() {
  const { selectedProject } = useAppStore();
  return useQuery({
    queryKey: ['open-issues', selectedProject?.projectId],
    queryFn: () => api.get(`/api/issues/open?projectKey=${selectedProject?.projectId}`),
    enabled: !!selectedProject,
    staleTime: 10 * 60 * 1000,
  });
}
