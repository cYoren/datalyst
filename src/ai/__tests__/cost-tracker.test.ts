import { describe, it, expect } from 'vitest';
import { InMemoryAiCostTracker } from '../policy/cost-tracker';
import { AiBudgetExceededError } from '../providers/errors';

describe('InMemoryAiCostTracker', () => {
  it('tracks daily cost per user correctly', () => {
    const tracker = new InMemoryAiCostTracker({ dailyLimitUsd: 0.5 });
    const userId = 'user-1';

    expect(tracker.getDailyCost(userId)).toBe(0);

    tracker.recordCost(userId, 0.05);
    tracker.recordCost(userId, 0.15);

    expect(tracker.getDailyCost(userId)).toBeCloseTo(0.2, 4);
  });

  it('enforces daily budget limit and rejects exceeding requests', () => {
    const tracker = new InMemoryAiCostTracker({ dailyLimitUsd: 0.1 });
    const userId = 'user-2';

    tracker.recordCost(userId, 0.08);

    const check1 = tracker.checkBudget(userId, 0.01);
    expect(check1.allowed).toBe(true);
    expect(check1.remainingUsd).toBeCloseTo(0.02, 4);

    const check2 = tracker.checkBudget(userId, 0.05);
    expect(check2.allowed).toBe(false);

    expect(() => tracker.assertWithinBudget(userId, 0.05)).toThrow(AiBudgetExceededError);
  });

  it('automatically resets daily budget when date rolls over', () => {
    let mockDate = new Date('2026-08-15T12:00:00Z');
    const tracker = new InMemoryAiCostTracker({
      dailyLimitUsd: 0.1,
      clock: () => mockDate,
    });
    const userId = 'user-rollover';

    // Day 1: User exhausts daily budget
    tracker.recordCost(userId, 0.1);
    expect(tracker.checkBudget(userId, 0.01).allowed).toBe(false);

    // Roll clock to Day 2 (2026-08-16)
    mockDate = new Date('2026-08-16T08:00:00Z');

    // User should have fresh daily allowance
    expect(tracker.getDailyCost(userId)).toBe(0);
    const day2Check = tracker.checkBudget(userId, 0.05);
    expect(day2Check.allowed).toBe(true);
    expect(day2Check.currentCostUsd).toBe(0);
    expect(day2Check.remainingUsd).toBe(0.1);

    // Previous day cost is still preserved if explicitly queried
    expect(tracker.getDailyCost(userId, '2026-08-15')).toBe(0.1);
  });

  it('isolates costs between different users', () => {
    const tracker = new InMemoryAiCostTracker({ dailyLimitUsd: 1.0 });
    tracker.recordCost('user-A', 0.8);
    tracker.recordCost('user-B', 0.1);

    expect(tracker.getDailyCost('user-A')).toBe(0.8);
    expect(tracker.getDailyCost('user-B')).toBe(0.1);
  });

  it('supports targeted reset per user and global reset', () => {
    const tracker = new InMemoryAiCostTracker();
    tracker.recordCost('user-A', 0.5);
    tracker.recordCost('user-B', 0.5);

    tracker.reset('user-A');
    expect(tracker.getDailyCost('user-A')).toBe(0);
    expect(tracker.getDailyCost('user-B')).toBe(0.5);

    tracker.reset();
    expect(tracker.getDailyCost('user-B')).toBe(0);
  });
});
