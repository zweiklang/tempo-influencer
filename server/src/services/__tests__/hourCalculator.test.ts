import { describe, it, expect } from 'vitest';
import { calculateHours } from '../hourCalculator';

describe('calculateHours', () => {
  it('returns zero hours when no roles provided', () => {
    const result = calculateHours({ targetRevenue: 10000, currentRevenue: 0, roles: [] });
    expect(result.roles).toEqual([]);
    expect(result.totalDeltaRevenue).toBe(0);
    expect(result.achievedRevenue).toBe(0);
  });

  it('distributes revenue proportionally by rate × memberCount', () => {
    const result = calculateHours({
      targetRevenue: 10000,
      currentRevenue: 0,
      roles: [
        { roleId: 1, roleName: 'Dev', billingRate: 100, memberCount: 2 },
        { roleId: 2, roleName: 'Designer', billingRate: 100, memberCount: 1 },
      ],
    });
    // Dev weight = 200, Designer weight = 100 → 2:1 ratio
    const dev = result.roles.find((r) => r.roleName === 'Dev')!;
    const des = result.roles.find((r) => r.roleName === 'Designer')!;
    expect(dev.revenueContribution).toBeGreaterThan(des.revenueContribution);
    expect(result.achievedRevenue).toBeCloseTo(10000, 0);
  });

  it('returns zero contribution for roles with zero billing rate', () => {
    const result = calculateHours({
      targetRevenue: 5000,
      currentRevenue: 0,
      roles: [{ roleId: 1, roleName: 'Intern', billingRate: 0, memberCount: 3 }],
    });
    expect(result.roles[0].hoursPerMember).toBe(0);
    expect(result.roles[0].revenueContribution).toBe(0);
  });

  it('snaps hours to nearest half-hour', () => {
    const result = calculateHours({
      targetRevenue: 1000,
      currentRevenue: 0,
      roles: [{ roleId: 1, roleName: 'Dev', billingRate: 150, memberCount: 1 }],
    });
    const hours = result.roles[0].hoursPerMember;
    // Must be a multiple of 0.5
    expect(hours % 0.5).toBe(0);
  });

  it('handles zero delta when target equals current', () => {
    const result = calculateHours({
      targetRevenue: 5000,
      currentRevenue: 5000,
      roles: [{ roleId: 1, roleName: 'Dev', billingRate: 100, memberCount: 2 }],
    });
    expect(result.totalDeltaRevenue).toBe(0);
    expect(result.achievedRevenue).toBe(5000);
  });

  it('uses greedy reconciliation to minimize rounding error', () => {
    // With odd hours, the greedy loop should pick the adjustment that minimizes error
    const result = calculateHours({
      targetRevenue: 10000,
      currentRevenue: 0,
      roles: [
        { roleId: 1, roleName: 'A', billingRate: 133, memberCount: 1 },
        { roleId: 2, roleName: 'B', billingRate: 97, memberCount: 2 },
      ],
    });
    const error = Math.abs(result.achievedRevenue - 10000);
    // Greedy should get within one half-hour step at worst
    const maxHourlyRate = Math.max(133, 97 * 2);
    expect(error).toBeLessThanOrEqual(maxHourlyRate * 0.5);
  });
});
