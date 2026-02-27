import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';

export function useTeams() {
  return useQuery({ queryKey: ['teams'], queryFn: () => api.get('/api/team/teams'), staleTime: 10 * 60 * 1000 });
}

export function useTeamMembers(teamId: number | null) {
  return useQuery({
    queryKey: ['team-members', teamId],
    queryFn: () => api.get(`/api/team/teams/${teamId}/members`),
    enabled: teamId !== null,
    staleTime: 10 * 60 * 1000,
  });
}

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api.get('/api/team/roles'), staleTime: 10 * 60 * 1000 });
}

export function useBillingRates(projectId: string | undefined) {
  return useQuery({
    queryKey: ['billing-rates', projectId],
    queryFn: () => api.get('/api/team/billing-rates'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveBillingRateOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { accountId: string; projectId: string; rate: number }) =>
      api.put('/api/team/billing-rates/override', {
        accountId: data.accountId,
        billingRate: data.rate,
      }),
    onSuccess: (_: unknown, vars: { accountId: string; projectId: string; rate: number }) => {
      qc.invalidateQueries({ queryKey: ['billing-rates', vars.projectId] });
    },
  });
}

export function useSaveRoleDescriptions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (descriptions: Record<number, string>) =>
      api.put('/api/team/roles/descriptions', { descriptions }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => api.post('/api/team/roles', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useUpdateTeamMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => api.put('/api/team/team-memberships', data),
    onSuccess: (_: unknown, vars: unknown) => {
      const v = vars as { teamId: number };
      qc.invalidateQueries({ queryKey: ['team-members', v.teamId] });
    },
  });
}
