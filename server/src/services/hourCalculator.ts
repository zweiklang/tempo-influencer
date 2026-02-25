export interface RoleInput {
  roleId: string | number;
  roleName: string;
  billingRate: number;
  memberCount: number;
}

export interface RoleOutput extends RoleInput {
  hoursPerMember: number;
  totalHours: number;
  revenueContribution: number;
}

export interface HourCalculatorInput {
  targetRevenue: number;
  currentRevenue: number;
  roles: RoleInput[];
}

export interface HourCalculatorOutput {
  roles: RoleOutput[];
  totalDeltaRevenue: number;
  achievedRevenue: number;
}

function snapToHalf(value: number): number {
  return Math.round(value / 0.5) * 0.5;
}

export function calculateHours(input: HourCalculatorInput): HourCalculatorOutput {
  const { targetRevenue, currentRevenue, roles } = input;
  const deltaRevenue = targetRevenue - currentRevenue;

  // Total weight = Σ(rate × memberCount)
  const totalWeight = roles.reduce((sum, r) => sum + r.billingRate * r.memberCount, 0);

  const roleOutputs: RoleOutput[] = roles.map((role) => {
    if (totalWeight === 0 || role.billingRate === 0) {
      return {
        ...role,
        hoursPerMember: 0,
        totalHours: 0,
        revenueContribution: 0,
      };
    }

    // Revenue share proportional to weight
    const roleRevenue = deltaRevenue * ((role.billingRate * role.memberCount) / totalWeight);

    // Raw total hours for this role
    const rawHoursTotal = roleRevenue / role.billingRate;

    // Snap to half-hour
    const roundedTotal = snapToHalf(rawHoursTotal);

    // Per-member hours (also snapped)
    const hoursPerMember =
      role.memberCount > 0 ? snapToHalf(roundedTotal / role.memberCount) : 0;

    const revenueContribution = hoursPerMember * role.memberCount * role.billingRate;

    return {
      ...role,
      hoursPerMember,
      totalHours: hoursPerMember * role.memberCount,
      revenueContribution,
    };
  });

  // Drift reconciliation
  let achievedRevenue = roleOutputs.reduce((sum, r) => sum + r.revenueContribution, 0);
  const drift = Math.abs(achievedRevenue - targetRevenue);

  if (targetRevenue !== 0 && drift / Math.abs(targetRevenue) > 0.05 && roleOutputs.length > 0) {
    // Find the highest-rate role to adjust
    const highestRateIdx = roleOutputs.reduce(
      (bestIdx, r, idx) =>
        r.billingRate > roleOutputs[bestIdx].billingRate ? idx : bestIdx,
      0
    );

    const adjustment = achievedRevenue < targetRevenue ? 0.5 : -0.5;
    const role = roleOutputs[highestRateIdx];
    role.hoursPerMember = Math.max(0, role.hoursPerMember + adjustment);
    role.totalHours = role.hoursPerMember * role.memberCount;
    role.revenueContribution = role.hoursPerMember * role.memberCount * role.billingRate;

    achievedRevenue = roleOutputs.reduce((sum, r) => sum + r.revenueContribution, 0);
  }

  const totalDeltaRevenue = achievedRevenue;

  return {
    roles: roleOutputs,
    totalDeltaRevenue,
    achievedRevenue: currentRevenue + achievedRevenue,
  };
}
