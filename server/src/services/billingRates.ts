import { getBillingRateOverride } from '../db';
import type { TempoClient } from './tempoClient';

type RateSource = 'override' | 'global' | 'project-default' | 'none';

interface ResolvedRate {
  rate: number;
  source: RateSource;
}

interface MemberInput {
  accountId: string;
  roleId?: number | null;
}

export async function resolveRatesForMembers(
  projectId: string,
  members: MemberInput[],
  tempoClient: TempoClient,
  projectDefaultRate?: number | null
): Promise<Map<string, ResolvedRate>> {
  const result = new Map<string, ResolvedRate>();

  // Fetch global rates once
  let globalRates: Awaited<ReturnType<TempoClient['getGlobalRates']>> = [];
  try {
    globalRates = await tempoClient.getGlobalRates();
  } catch {
    // proceed without global rates
  }

  for (const member of members) {
    const override = getBillingRateOverride(projectId, member.accountId);
    if (override !== null) {
      result.set(member.accountId, { rate: override, source: 'override' });
      continue;
    }

    if (member.roleId != null) {
      const roleRate = globalRates.find(
        (r) => r.account?.type === 'ROLE' && String(r.account.id) === String(member.roleId)
      );
      if (roleRate) {
        result.set(member.accountId, { rate: roleRate.rate, source: 'global' });
        continue;
      }
    }

    if (projectDefaultRate != null) {
      result.set(member.accountId, { rate: projectDefaultRate, source: 'project-default' });
      continue;
    }

    result.set(member.accountId, { rate: 0, source: 'none' });
  }

  return result;
}
