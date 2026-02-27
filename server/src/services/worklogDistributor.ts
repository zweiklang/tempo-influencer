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

function getWeekKey(dateStr: string): string {
  // Returns the Monday date of the week as "yyyy-MM-dd"
  const d = parseISO(dateStr);
  const dow = getDay(d); // 0=Sun, 1=Mon
  const offset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(monday.getDate() + offset);
  return format(monday, 'yyyy-MM-dd');
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

    if (totalHours <= 0) continue;

    // Initialize capacity for this user if not done
    if (!capacityMap[accountId]) capacityMap[accountId] = {};

    let remaining = totalHours;

    // Step 1: partition days by usable capacity
    const goodDays = workingDays.filter((d) => (capacityMap[accountId][d] ?? 8) >= 1.0);
    const tinyDays = workingDays.filter((d) => {
      const cap = capacityMap[accountId][d] ?? 8;
      return cap > 0 && cap < 1.0;
    });

    if (goodDays.length === 0 && tinyDays.length === 0) {
      // All days at capacity — overflow immediately
      const targetDay = workingDays[0];
      if (targetDay) {
        schedule.push({ accountId, issueId, date: targetDay, hours: remaining, overflow: true });
      }
      continue;
    }

    if (goodDays.length > 0) {
      // Step 2: group goodDays by week
      const weekMap = new Map<string, string[]>();
      for (const d of goodDays) {
        const wk = getWeekKey(d);
        if (!weekMap.has(wk)) weekMap.set(wk, []);
        weekMap.get(wk)!.push(d);
      }
      const goodWeeks = [...weekMap.keys()].sort();

      // Step 3: pick numTargetWeeks
      const goodCapByWeek: Record<string, number> = {};
      for (const wk of goodWeeks) {
        goodCapByWeek[wk] = weekMap.get(wk)!.reduce((sum, d) => sum + (capacityMap[accountId][d] ?? 8), 0);
      }
      const maxWeekCap = Math.max(...Object.values(goodCapByWeek));
      const minWeeks = Math.max(1, Math.ceil(totalHours / maxWeekCap));
      const maxWeeks = Math.min(goodWeeks.length, 3);
      const t = rand() * rand(); // quadratic bias → fewer weeks
      const numTargetWeeks = Math.max(
        minWeeks,
        Math.min(Math.max(minWeeks, maxWeeks), Math.round(minWeeks + t * (Math.max(minWeeks, maxWeeks) - minWeeks)))
      );

      // Step 4: collect pickedDays from chosen weeks
      const shuffledWeeks = fisherYatesShuffle(goodWeeks, rand);
      const pickedWeeks = new Set(shuffledWeeks.slice(0, numTargetWeeks));
      const pickedDays = goodDays.filter((d) => pickedWeeks.has(getWeekKey(d))).sort();

      // Step 5: distribute totalHours across pickedDays with 1h minimum
      for (let i = 0; i < pickedDays.length; i++) {
        if (remaining <= 0) break;

        const date = pickedDays[i];
        const currentCap = capacityMap[accountId][date] ?? 8;
        if (currentCap <= 0) continue;

        let toLog: number;
        if (i === pickedDays.length - 1 || remaining <= 1.0) {
          // Last picked day, or remainder too small to guarantee 1h: take what's left
          toLog = snapToHalf(Math.min(currentCap, remaining));
        } else {
          const fraction = 0.2 + rand() * 0.6; // 20–80% of remaining
          const desired = Math.max(1.0, remaining * fraction); // 1h minimum
          toLog = snapToHalf(Math.min(currentCap, desired));
        }

        if (toLog <= 0) continue;

        schedule.push({ accountId, issueId, date, hours: toLog, overflow: false });
        capacityMap[accountId][date] = currentCap - toLog;
        remaining -= toLog;
        remaining = Math.round(remaining * 100) / 100;
      }

      // Step 6: greedy fallback — expand to more goodWeeks
      if (remaining > 0) {
        const extraDays = goodDays.filter((d) => !pickedWeeks.has(getWeekKey(d)));
        const shuffledExtra = fisherYatesShuffle(extraDays, rand);
        for (const date of shuffledExtra) {
          if (remaining <= 0) break;

          const currentCap = capacityMap[accountId][date] ?? 8;
          if (currentCap <= 0) continue;

          const toLog = snapToHalf(Math.min(currentCap, remaining));
          if (toLog <= 0) continue;

          schedule.push({ accountId, issueId, date, hours: toLog, overflow: false });
          capacityMap[accountId][date] = currentCap - toLog;
          remaining -= toLog;
          remaining = Math.round(remaining * 100) / 100;
        }
      }
    }

    // Step 7: tiny-day fallback (0.5h capacity days)
    if (remaining > 0) {
      const shuffledTiny = fisherYatesShuffle(tinyDays, rand);
      for (const date of shuffledTiny) {
        if (remaining <= 0) break;

        const currentCap = capacityMap[accountId][date] ?? 8;
        if (currentCap <= 0) continue;

        const toLog = snapToHalf(Math.min(currentCap, remaining));
        if (toLog <= 0) continue;

        schedule.push({ accountId, issueId, date, hours: toLog, overflow: false });
        capacityMap[accountId][date] = currentCap - toLog;
        remaining -= toLog;
        remaining = Math.round(remaining * 100) / 100;
      }
    }

    // Step 8: overflow if still remaining
    if (remaining > 0) {
      const shuffledAll = fisherYatesShuffle(workingDays, rand);
      const overflowDays = shuffledAll.filter((d) => (capacityMap[accountId][d] ?? 8) >= 0);
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
