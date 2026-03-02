import { describe, it, expect } from 'vitest';
import { distributeWorklogs } from '../worklogDistributor';

const NO_WORKLOGS = [] as never[];

describe('distributeWorklogs', () => {
  it('returns empty schedule for empty assignments', () => {
    const result = distributeWorklogs({
      assignments: [],
      from: '2025-01-06',
      to: '2025-01-10',
      existingWorklogs: NO_WORKLOGS,
      seed: 1,
    });
    expect(result.schedule).toEqual([]);
    expect(result.worklogBodies).toEqual([]);
  });

  it('is deterministic with the same seed', () => {
    const input = {
      assignments: [{ accountId: 'user1', issueId: 42, totalHours: 8 }],
      from: '2025-01-06',
      to: '2025-01-17',
      existingWorklogs: NO_WORKLOGS,
      seed: 12345,
    };
    const r1 = distributeWorklogs(input);
    const r2 = distributeWorklogs(input);
    expect(r1.schedule).toEqual(r2.schedule);
  });

  it('produces different distribution with different seed', () => {
    const base = {
      assignments: [{ accountId: 'user1', issueId: 42, totalHours: 24 }],
      from: '2025-01-06',
      to: '2025-01-31',
      existingWorklogs: NO_WORKLOGS,
    };
    const r1 = distributeWorklogs({ ...base, seed: 1 });
    const r2 = distributeWorklogs({ ...base, seed: 9999 });
    // Different seeds should (with high probability) produce different schedules
    const dates1 = r1.schedule.map((e) => e.date).join(',');
    const dates2 = r2.schedule.map((e) => e.date).join(',');
    expect(dates1).not.toEqual(dates2);
  });

  it('only schedules on working days (Mon-Fri)', () => {
    const result = distributeWorklogs({
      assignments: [{ accountId: 'user1', issueId: 1, totalHours: 16 }],
      from: '2025-01-06',
      to: '2025-01-31',
      existingWorklogs: NO_WORKLOGS,
      seed: 42,
    });
    const WEEKEND = [0, 6]; // Sunday=0, Saturday=6
    for (const entry of result.schedule) {
      const day = new Date(entry.date).getDay();
      expect(WEEKEND).not.toContain(day);
    }
  });

  it('distributes total hours correctly (non-overflow entries sum to totalHours)', () => {
    const totalHours = 12;
    const result = distributeWorklogs({
      assignments: [{ accountId: 'user1', issueId: 7, totalHours }],
      from: '2025-01-06',
      to: '2025-01-24',
      existingWorklogs: NO_WORKLOGS,
      seed: 77,
    });
    const nonOverflow = result.schedule.filter((e) => !e.overflow);
    const sum = nonOverflow.reduce((acc, e) => acc + e.hours, 0);
    expect(sum).toBeCloseTo(totalHours, 1);
  });

  it('produces worklogBodies with correct fields', () => {
    const result = distributeWorklogs({
      assignments: [{ accountId: 'acc-123', issueId: 99, totalHours: 4 }],
      from: '2025-01-06',
      to: '2025-01-10',
      existingWorklogs: NO_WORKLOGS,
      seed: 1,
    });
    for (const body of result.worklogBodies) {
      expect(body.authorAccountId).toBe('acc-123');
      expect(body.issueId).toBe(99);
      expect(body.timeSpentSeconds).toBeGreaterThan(0);
      expect(body.timeSpentSeconds % 1800).toBe(0); // multiples of 30 minutes
    }
  });

  it('reduces capacity on days with existing worklogs', () => {
    const existingWorklogs = [
      {
        tempoWorklogId: 1,
        author: { accountId: 'user1', displayName: 'User One' },
        timeSpentSeconds: 8 * 3600, // full 8h day
        billableSeconds: 8 * 3600,
        startDate: '2025-01-06',
        issue: { id: 10, key: 'PROJ-10' },
      },
    ];
    const result = distributeWorklogs({
      assignments: [{ accountId: 'user1', issueId: 1, totalHours: 8 }],
      from: '2025-01-06',
      to: '2025-01-10',
      existingWorklogs,
      seed: 1,
    });
    // Monday Jan 6 should have 0 capacity (full 8h already logged)
    // so no entries should be scheduled on that day
    const jan6 = result.schedule.filter((e) => e.date === '2025-01-06' && !e.overflow);
    expect(jan6.reduce((s, e) => s + e.hours, 0)).toBe(0);
  });
});
