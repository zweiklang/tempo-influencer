import { getBillingRateOverride } from '../db';
import type { TempoClient } from './tempoClient';

export type RateSource = 'override' | 'global' | 'project-default' | 'none';

export interface ResolvedRate {
  rate: number;
  source: RateSource;
}

export async function resolveRate(
  projectId: string,
  accountId: string,
  roleId: number | null | undefined,
  tempoClient: TempoClient,
  projectDefaultRate?: number | null
): Promise<ResolvedRate> {
  // 1. Check billing_rate_overrides
  const override = getBillingRateOverride(projectId, accountId);
  if (override !== null) {
    return { rate: override, source: 'override' };
  }

  // 2. Look up global rates by role
  if (roleId != null) {
    try {
      const globalRates = await tempoClient.getGlobalRates();
      const roleRate = globalRates.find(
        (r) => r.account?.type === 'ROLE' && String(r.account.id) === String(roleId)
      );
      if (roleRate) {
        return { rate: roleRate.rate, source: 'global' };
      }
    } catch {
      // Fall through
    }
  }

  // 3. Project default rate
  if (projectDefaultRate != null) {
    return { rate: projectDefaultRate, source: 'project-default' };
  }

  // 4. No rate found
  return { rate: 0, source: 'none' };
}

export interface MemberInput {
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
