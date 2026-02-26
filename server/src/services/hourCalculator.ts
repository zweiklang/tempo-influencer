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

  // Iterative greedy reconciliation: minimize |achievedDelta - deltaRevenue|
  let achievedDelta = roleOutputs.reduce((sum, r) => sum + r.revenueContribution, 0);
  let improved = true;
  while (improved) {
    improved = false;
    let bestIdx = -1;
    let bestAdj = 0;
    let bestError = Math.abs(achievedDelta - deltaRevenue);
    for (let i = 0; i < roleOutputs.length; i++) {
      const role = roleOutputs[i];
      if (role.billingRate === 0) continue;
      for (const adj of [-0.5, 0.5]) {
        const newHours = role.hoursPerMember + adj;
        if (newHours < 0) continue;
        const newContrib = newHours * role.memberCount * role.billingRate;
        const newAchieved = achievedDelta - role.revenueContribution + newContrib;
        const newError = Math.abs(newAchieved - deltaRevenue);
        if (newError < bestError) {
          bestError = newError;
          bestIdx = i;
          bestAdj = adj;
        }
      }
    }
    if (bestIdx >= 0) {
      const role = roleOutputs[bestIdx];
      role.hoursPerMember += bestAdj;
      role.totalHours = role.hoursPerMember * role.memberCount;
      role.revenueContribution = role.hoursPerMember * role.memberCount * role.billingRate;
      achievedDelta = roleOutputs.reduce((sum, r) => sum + r.revenueContribution, 0);
      improved = true;
    }
  }

  const totalDeltaRevenue = achievedDelta;

  return {
    roles: roleOutputs,
    totalDeltaRevenue,
    achievedRevenue: currentRevenue + achievedDelta,
  };
}
