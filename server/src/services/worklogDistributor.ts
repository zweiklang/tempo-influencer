import { eachDayOfInterval, parseISO, getDay, format } from 'date-fns';
import type { TempoWorklog, CreateWorklogBody } from '../types/tempo';

export interface Assignment {
  accountId: string;
  issueId: string | number;
  totalHours: number;
}

export interface DistributorInput {
  assignments: Assignment[];
  from: string;
  to: string;
  existingWorklogs: TempoWorklog[];
  seed?: number;
}

export interface ScheduleEntry {
  accountId: string;
  issueId: string | number;
  date: string;
  hours: number;
  overflow: boolean;
}

export interface DistributorOutput {
  schedule: ScheduleEntry[];
  worklogBodies: CreateWorklogBody[];
}

// Mulberry32 PRNG for deterministic shuffling
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fisherYatesShuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function snapToHalf(value: number): number {
  return Math.round(value / 0.5) * 0.5;
}

export function distributeWorklogs(input: DistributorInput): DistributorOutput {
  const { assignments, from, to, existingWorklogs, seed = Date.now() } = input;

  // 1. Compute all working days (Mon-Fri) in [from, to]
  const fromDate = parseISO(from);
  const toDate = parseISO(to);
  const allDays = eachDayOfInterval({ start: fromDate, end: toDate });
  const workingDays = allDays
    .filter((d) => {
      const dow = getDay(d);
      return dow !== 0 && dow !== 6; // exclude Sunday (0) and Saturday (6)
    })
    .map((d) => format(d, 'yyyy-MM-dd'));

  // 2. Build capacity map: capacityMap[accountId][date] = 8 - existingHours
  const capacityMap: Record<string, Record<string, number>> = {};

  for (const wl of existingWorklogs) {
    const accountId = wl.author.accountId;
    const date = wl.startDate;
    const hours = wl.timeSpentSeconds / 3600;

    if (!capacityMap[accountId]) capacityMap[accountId] = {};
    capacityMap[accountId][date] = (capacityMap[accountId][date] ?? 8) - hours;
    if (capacityMap[accountId][date] < 0) capacityMap[accountId][date] = 0;
  }

  const schedule: ScheduleEntry[] = [];
  const rand = mulberry32(seed);

  // 3. For each assignment, distribute hours
  for (const assignment of assignments) {
    const { accountId, issueId, totalHours } = assignment;

    // Initialize capacity for this user if not done
    if (!capacityMap[accountId]) capacityMap[accountId] = {};

    // Shuffle working days with deterministic seed
    const shuffledDays = fisherYatesShuffle(workingDays, rand);

    let remaining = totalHours;

    // Greedy fill within capacity
    for (const date of shuffledDays) {
      if (remaining <= 0) break;

      const currentCap = capacityMap[accountId][date] ?? 8;
      if (currentCap <= 0) continue;

      const toLog = snapToHalf(Math.min(currentCap, remaining));
      if (toLog <= 0) continue;

      schedule.push({ accountId, issueId, date, hours: toLog, overflow: false });
      capacityMap[accountId][date] = currentCap - toLog;
      remaining -= toLog;
      remaining = Math.round(remaining * 100) / 100; // floating point safety
    }

    // Overflow: log remaining without cap
    if (remaining > 0) {
      // Find a day with any capacity or the first working day
      const overflowDays = shuffledDays.filter(
        (d) => (capacityMap[accountId][d] ?? 8) >= 0
      );
      const targetDay = overflowDays[0] ?? workingDays[0];

      if (targetDay) {
        schedule.push({ accountId, issueId, date: targetDay, hours: remaining, overflow: true });
      }
    }
  }

  // 4. Convert to worklog bodies
  const worklogBodies: CreateWorklogBody[] = schedule.map((entry) => ({
    issueId: entry.issueId,
    authorAccountId: entry.accountId,
    startDate: entry.date,
    startTime: '09:00:00',
    timeSpentSeconds: Math.round(entry.hours * 3600),
    billableSeconds: Math.round(entry.hours * 3600),
  }));

  return { schedule, worklogBodies };
}
