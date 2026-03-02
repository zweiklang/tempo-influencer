import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db', () => ({
  getBillingRateOverride: vi.fn(),
}));

import { getBillingRateOverride } from '../../db';
import { resolveRatesForMembers } from '../billingRates';
import type { TempoClient } from '../tempoClient';

const mockGetBillingRateOverride = vi.mocked(getBillingRateOverride);

const makeTempoClient = (rates: Awaited<ReturnType<TempoClient['getGlobalRates']>>) =>
  ({
    getGlobalRates: vi.fn().mockResolvedValue(rates),
  }) as unknown as TempoClient;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBillingRateOverride.mockReturnValue(null);
});

describe('resolveRatesForMembers', () => {
  it('returns override rate when one is set', async () => {
    mockGetBillingRateOverride.mockReturnValue(250);
    const result = await resolveRatesForMembers(
      'proj-1',
      [{ accountId: 'user1', roleId: null }],
      makeTempoClient([]),
    );
    expect(result.get('user1')).toEqual({ rate: 250, source: 'override' });
  });

  it('uses global role rate when no override and role matches', async () => {
    const tempo = makeTempoClient([
      { id: 99, account: { id: '5', type: 'ROLE' }, rate: 180, currency: 'USD' },
    ]);
    const result = await resolveRatesForMembers(
      'proj-1',
      [{ accountId: 'user1', roleId: 5 }],
      tempo,
    );
    expect(result.get('user1')).toEqual({ rate: 180, source: 'global' });
  });

  it('falls back to project default rate when no override or global rate', async () => {
    const result = await resolveRatesForMembers(
      'proj-1',
      [{ accountId: 'user1', roleId: null }],
      makeTempoClient([]),
      150,
    );
    expect(result.get('user1')).toEqual({ rate: 150, source: 'project-default' });
  });

  it('returns rate=0 source=none when no rate is configured', async () => {
    const result = await resolveRatesForMembers(
      'proj-1',
      [{ accountId: 'user1', roleId: null }],
      makeTempoClient([]),
    );
    expect(result.get('user1')).toEqual({ rate: 0, source: 'none' });
  });

  it('override takes priority over global and project default', async () => {
    mockGetBillingRateOverride.mockReturnValue(500);
    const tempo = makeTempoClient([
      { id: 1, account: { id: '5', type: 'ROLE' }, rate: 180, currency: 'USD' },
    ]);
    const result = await resolveRatesForMembers(
      'proj-1',
      [{ accountId: 'user1', roleId: 5 }],
      tempo,
      100,
    );
    expect(result.get('user1')?.source).toBe('override');
    expect(result.get('user1')?.rate).toBe(500);
  });

  it('handles multiple members independently', async () => {
    mockGetBillingRateOverride
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(null);
    const result = await resolveRatesForMembers(
      'proj-1',
      [
        { accountId: 'user1', roleId: null },
        { accountId: 'user2', roleId: null },
      ],
      makeTempoClient([]),
      120,
    );
    expect(result.get('user1')?.source).toBe('override');
    expect(result.get('user2')?.source).toBe('project-default');
  });

  it('proceeds without global rates when getGlobalRates throws', async () => {
    const tempo = {
      getGlobalRates: vi.fn().mockRejectedValue(new Error('404')),
    } as unknown as TempoClient;
    const result = await resolveRatesForMembers(
      'proj-1',
      [{ accountId: 'user1', roleId: 5 }],
      tempo,
      100,
    );
    // Should fall back to project default since global rates failed
    expect(result.get('user1')).toEqual({ rate: 100, source: 'project-default' });
  });
});
