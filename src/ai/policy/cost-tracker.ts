import 'server-only';

import { AiBudgetExceededError } from '../providers/errors';

export interface BudgetCheckResult {
  allowed: boolean;
  currentCostUsd: number;
  limitUsd: number;
  remainingUsd: number;
}

export interface AiCostTracker {
  getDailyCost(userId: string, dateKey?: string): Promise<number> | number;
  recordCost(userId: string, costUsd: number, dateKey?: string): Promise<void> | void;
  checkBudget(userId: string, additionalCostUsd?: number, dateKey?: string): Promise<BudgetCheckResult> | BudgetCheckResult;
  assertWithinBudget(userId: string, additionalCostUsd?: number, dateKey?: string, correlationId?: string): Promise<void> | void;
  reset(userId?: string): void;
}

export interface InMemoryAiCostTrackerOptions {
  dailyLimitUsd?: number;
  clock?: () => Date;
  formatDateKey?: (date: Date) => string;
}

export class InMemoryAiCostTracker implements AiCostTracker {
  private dailyLimitUsd: number;
  private clock: () => Date;
  private formatDateKey: (date: Date) => string;
  private usageMap: Map<string, number> = new Map();

  constructor(options: InMemoryAiCostTrackerOptions = {}) {
    this.dailyLimitUsd = options.dailyLimitUsd ?? 1.0; // Default $1.00 USD per user per day
    this.clock = options.clock ?? (() => new Date());
    this.formatDateKey =
      options.formatDateKey ??
      ((date: Date) => {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      });
  }

  setDailyLimit(limitUsd: number): void {
    this.dailyLimitUsd = Math.max(0, limitUsd);
  }

  getDailyLimit(): number {
    return this.dailyLimitUsd;
  }

  private resolveKey(userId: string, dateKey?: string): string {
    const activeDateKey = dateKey ?? this.formatDateKey(this.clock());
    return `${userId}:${activeDateKey}`;
  }

  getDailyCost(userId: string, dateKey?: string): number {
    const key = this.resolveKey(userId, dateKey);
    return this.usageMap.get(key) ?? 0;
  }

  recordCost(userId: string, costUsd: number, dateKey?: string): void {
    if (!Number.isFinite(costUsd) || costUsd <= 0) return;
    const key = this.resolveKey(userId, dateKey);
    const current = this.usageMap.get(key) ?? 0;
    const updated = Number((current + costUsd).toFixed(8));
    this.usageMap.set(key, updated);
  }

  checkBudget(userId: string, additionalCostUsd: number = 0, dateKey?: string): BudgetCheckResult {
    const currentCost = this.getDailyCost(userId, dateKey);
    const projectedTotal = currentCost + Math.max(0, additionalCostUsd);
    const allowed =
      this.dailyLimitUsd > 0 &&
      currentCost < this.dailyLimitUsd &&
      projectedTotal <= this.dailyLimitUsd;
    const remainingUsd = Number(Math.max(0, this.dailyLimitUsd - currentCost).toFixed(8));

    return {
      allowed,
      currentCostUsd: currentCost,
      limitUsd: this.dailyLimitUsd,
      remainingUsd,
    };
  }

  assertWithinBudget(
    userId: string,
    additionalCostUsd: number = 0,
    dateKey?: string,
    correlationId?: string
  ): void {
    const check = this.checkBudget(userId, additionalCostUsd, dateKey);
    if (!check.allowed) {
      throw new AiBudgetExceededError(
        `User ${userId} daily AI budget exceeded. Spent: $${check.currentCostUsd.toFixed(4)}, Limit: $${check.limitUsd.toFixed(4)}`,
        correlationId,
        {
          userId,
          currentCostUsd: check.currentCostUsd,
          limitUsd: check.limitUsd,
        }
      );
    }
  }

  reset(userId?: string): void {
    if (userId) {
      for (const key of Array.from(this.usageMap.keys())) {
        if (key.startsWith(`${userId}:`)) {
          this.usageMap.delete(key);
        }
      }
    } else {
      this.usageMap.clear();
    }
  }
}
