import * as ss from 'simple-statistics';
import { tTestPValue } from './pvalue';
import { performLinearRegression } from './regressions';

// ========================================
// TYPES
// ========================================

export interface PowerEstimate {
  requiredDays: number;
  detectedEffectSize: number; // Cohen's d target
  currentVariance: number;
  confidence: number; // 0.80 default
  autocorrelationAdjusted: boolean;
}

export interface BlockAnalysisResult {
  nBlocks: number;
  blockDifferences: number[]; // A-B mean diff per block
  meanBlockDiff: number;
  tTest: { tStatistic: number; pValue: number; significant: boolean } | null;
  effectSize: number; // Cohen's d on block differences
  missingDataWarning: string | null;
}

export interface CarryoverTestResult {
  conditionACarryover: { tStatistic: number; pValue: number; significant: boolean } | null;
  conditionBCarryover: { tStatistic: number; pValue: number; significant: boolean } | null;
  hasCarryover: boolean;
  warning: string | null;
}

export interface PeriodEffectResult {
  earlyMeanDiff: number;
  lateMeanDiff: number;
  tTest: { tStatistic: number; pValue: number; significant: boolean } | null;
  hasPeriodEffect: boolean;
  warning: string | null;
}

export interface SequentialBoundary {
  currentZ: number;
  criticalValue: number;
  alphaSpent: number;
  dataFraction: number;
  nLooks: number;
  canRejectNull: boolean;
  canStopForFutility: boolean;
}

export interface AutocorrelationResult {
  lag1: number;
  isProblematic: boolean; // > 0.5
  warning: string | null;
}

export interface BayesianResult {
  probabilityOfEffect: number; // 0-1, the "88% chance it helps" number
  posteriorMean: number;
  posteriorStd: number;
  credibleInterval: [number, number]; // 95% HDI
}

export interface CovariateAdjustedResult {
  adjustedEffect: number;
  rawEffect: number;
  covariatesUsed: string[];
  r2: number;
}

export interface BangIndexResult {
  guessedCorrectly: boolean;
  bangIndex: number; // 0 = perfect blinding, 1 = fully unblinded
  integrityWarning: string | null;
}

export interface BlockedSchedule {
  assignments: { date: string; condition: string; blockIndex: number; isWashout: boolean }[];
}

export interface N1TrialResult {
  effectSize: number; // Cohen's d
  effectLabel: string;
  tTest: { tStatistic: number; pValue: number; significant: boolean } | null;
  bayesian: BayesianResult;
  autocorrelation: AutocorrelationResult;
  conditionAMean: number;
  conditionBMean: number;
  conditionAStd: number;
  conditionBStd: number;
  nA: number;
  nB: number;
  blockAnalysis?: BlockAnalysisResult | null;
  carryoverTest?: CarryoverTestResult | null;
  periodEffect?: PeriodEffectResult | null;
  sequentialBoundary?: SequentialBoundary | null;
}

export interface AuditReport {
  experimentName: string;
  hypothesis: string;
  hypothesisLockedAt: string | null;
  startDate: string;
  endDate: string;
  randomizationType: string;
  washoutPeriod: number;
  isBlind: boolean;
  results: N1TrialResult;
  bangIndex: BangIndexResult | null;
  covariateAdjustment: CovariateAdjustedResult | null;
  analysisModifiedAfterLock: boolean;
  generatedAt: string;
}

// ========================================
// MULTI-ARM ANALYSIS TYPES
// ========================================

export interface ConditionStats {
  label: string;
  mean: number;
  std: number;
  n: number;
  dose?: number;
}

export interface PairwiseComparison {
  conditionA: string;
  conditionB: string;
  meanDiff: number;
  pValue: number;
  significant: boolean;
}

export interface DoseResponseResult {
  slope: number;
  intercept: number;
  r2: number;
  pValue: number;
  optimalDose: number | null; // Dose that maximizes/minimizes outcome
  curve: { dose: number; predicted: number }[];
}

export interface MultiArmResult {
  nConditions: number;
  conditionStats: ConditionStats[];
  kruskalWallis: { H: number; pValue: number; significant: boolean } | null;
  pairwiseComparisons: PairwiseComparison[];
  doseResponse: DoseResponseResult | null;
  autocorrelation: AutocorrelationResult;
}

// ========================================
// RESULT INTERPRETATION (Plain English)
// ========================================

export interface ResultInterpretation {
  headline: string;           // "Your sleep improved on magnesium days"
  effectDescription: string;  // "0.7 hours better on average"
  confidenceStatement: string; // "82% confident this is real"
  magnitude: 'negligible' | 'small' | 'moderate' | 'large' | 'very_large';
  recommendation: string;     // "Worth continuing"
  nextSteps: string[];        // ["Run 2 more weeks", "Try increasing dose"]
}

/**
 * Interprets statistical results into plain English for users.
 * Designed for laypeople who don't understand p-values or Cohen's d.
 */
export function interpretResults(
  n1Stats: N1TrialResult | null,
  multiArm: MultiArmResult | null,
  conditionLabels: string[],
  dependentName: string,
  independentName: string,
  goalDirection: 'HIGHER_BETTER' | 'LOWER_BETTER' | 'NEUTRAL' = 'HIGHER_BETTER'
): ResultInterpretation {
  // Multi-arm interpretation
  if (multiArm && multiArm.kruskalWallis) {
    const best = multiArm.conditionStats.reduce((a, b) =>
      goalDirection === 'HIGHER_BETTER' ? (a.mean > b.mean ? a : b) : (a.mean < b.mean ? a : b)
    );
    const worst = multiArm.conditionStats.reduce((a, b) =>
      goalDirection === 'HIGHER_BETTER' ? (a.mean < b.mean ? a : b) : (a.mean > b.mean ? a : b)
    );

    const diff = Math.abs(best.mean - worst.mean);
    const isSignificant = multiArm.kruskalWallis.significant;

    return {
      headline: isSignificant
        ? `${best.label} performed best for ${dependentName}`
        : `No clear winner among conditions`,
      effectDescription: `${best.label}: ${best.mean.toFixed(1)} vs ${worst.label}: ${worst.mean.toFixed(1)}`,
      confidenceStatement: isSignificant
        ? `Statistically significant difference (p=${multiArm.kruskalWallis.pValue.toFixed(3)})`
        : `Differences could be random chance`,
      magnitude: diff > 1 ? 'large' : diff > 0.5 ? 'moderate' : 'small',
      recommendation: isSignificant ? `Focus on ${best.label}` : 'Consider running longer',
      nextSteps: isSignificant
        ? [`Continue with ${best.label}`, `Test ${best.label} vs a new condition`]
        : ['Run 2 more weeks for clarity', 'Check your logging consistency'],
    };
  }

  // Binary N1 interpretation  
  if (!n1Stats) {
    return {
      headline: 'Not enough data yet',
      effectDescription: 'Keep logging to see results',
      confidenceStatement: 'Collecting more data...',
      magnitude: 'negligible',
      recommendation: 'Continue your experiment',
      nextSteps: ['Log daily for accurate results'],
    };
  }

  const { effectSize, bayesian, conditionAMean, conditionBMean } = n1Stats;
  const absEffect = Math.abs(effectSize);
  const condA = conditionLabels[0] || 'Condition A';
  const condB = conditionLabels[1] || 'Condition B';

  // Determine which condition is "better" based on goal direction
  const aBetter = goalDirection === 'HIGHER_BETTER'
    ? conditionAMean > conditionBMean
    : conditionAMean < conditionBMean;
  const betterCondition = aBetter ? condA : condB;
  const diff = Math.abs(conditionAMean - conditionBMean);

  // Effect magnitude thresholds (Cohen's d)
  let magnitude: ResultInterpretation['magnitude'];
  let magnitudeWord: string;
  if (absEffect < 0.2) {
    magnitude = 'negligible';
    magnitudeWord = 'negligible';
  } else if (absEffect < 0.5) {
    magnitude = 'small';
    magnitudeWord = 'small';
  } else if (absEffect < 0.8) {
    magnitude = 'moderate';
    magnitudeWord = 'moderate';
  } else if (absEffect < 1.2) {
    magnitude = 'large';
    magnitudeWord = 'substantial';
  } else {
    magnitude = 'very_large';
    magnitudeWord = 'dramatic';
  }

  // Confidence interpretation
  const prob = bayesian.probabilityOfEffect;
  let confidenceLevel: 'low' | 'moderate' | 'high' | 'very_high';
  let confidenceWord: string;
  if (prob < 0.6) {
    confidenceLevel = 'low';
    confidenceWord = 'uncertain';
  } else if (prob < 0.75) {
    confidenceLevel = 'moderate';
    confidenceWord = 'somewhat confident';
  } else if (prob < 0.9) {
    confidenceLevel = 'high';
    confidenceWord = 'confident';
  } else {
    confidenceLevel = 'very_high';
    confidenceWord = 'very confident';
  }

  // Build interpretation
  const directionWord = goalDirection === 'HIGHER_BETTER' ? 'higher' : 'lower';
  const improvementWord = magnitude === 'negligible' ? 'similar' :
    (goalDirection === 'HIGHER_BETTER' ? 'better' : 'improved');

  let headline: string;
  let recommendation: string;
  let nextSteps: string[];

  if (magnitude === 'negligible') {
    headline = `${condA} and ${condB} performed similarly`;
    recommendation = 'No clear difference detected';
    nextSteps = ['Try increasing the intervention dose', 'Test for a longer period', 'Consider a different outcome measure'];
  } else if (confidenceLevel === 'low') {
    headline = `${betterCondition} might be ${improvementWord}, but uncertain`;
    recommendation = 'Need more data to be sure';
    nextSteps = ['Run 1-2 more weeks', 'Check your logging consistency'];
  } else {
    headline = `${betterCondition} ${improvementWord} for ${dependentName}`;
    recommendation = confidenceLevel === 'very_high'
      ? `Strong evidence: stick with ${betterCondition}!`
      : `${betterCondition} appears beneficial`;
    nextSteps = [
      `Continue with ${betterCondition}`,
      `Test ${betterCondition} at different levels`,
      'Share your results',
    ];
  }

  return {
    headline,
    effectDescription: `${diff.toFixed(2)} ${directionWord} on ${betterCondition} days (${magnitudeWord} effect)`,
    confidenceStatement: `${Math.round(prob * 100)}% ${confidenceWord} this is real, not random chance`,
    magnitude,
    recommendation,
    nextSteps,
  };
}

// ========================================
// POWER ESTIMATION
// ========================================

/**
 * Estimates required trial duration to detect a given effect size.
 * Uses the formula: n = 2 * ((z_alpha + z_beta) / d)^2
 * where d = target Cohen's d, and we default to alpha=0.05, power=0.80.
 */
export function calculatePower(
  historicalValues: number[],
  targetEffectPct: number = 0.10, // 10% change
  alpha: number = 0.05,
  power: number = 0.80,
): PowerEstimate | null {
  if (historicalValues.length < 5) return null;

  const mean = ss.mean(historicalValues);
  const std = ss.standardDeviation(historicalValues);
  if (std === 0 || mean === 0) return null;

  // Target effect as Cohen's d
  const targetAbsolute = Math.abs(mean * targetEffectPct);
  const d = targetAbsolute / std;
  if (d === 0) return null;

  // z-scores for alpha/2 (two-tailed) and power
  const zAlpha = zFromP(alpha / 2);
  const zBeta = zFromP(1 - power);

  // Per-group sample size for two-sample t-test
  let nPerGroup = Math.ceil(2 * Math.pow((zAlpha + zBeta) / d, 2));

  // Autocorrelation-adjusted variance inflation
  let autocorrelationAdjusted = false;
  const acResult = calculateAutocorrelation(historicalValues);
  if (Math.abs(acResult.lag1) > 0.1) {
    const r = Math.abs(acResult.lag1);
    nPerGroup = Math.ceil(nPerGroup * (1 + r) / (1 - r));
    autocorrelationAdjusted = true;
  }

  // Total days = 2 groups * nPerGroup
  const requiredDays = nPerGroup * 2;

  return {
    requiredDays: Math.max(requiredDays, 14), // minimum 14 days
    detectedEffectSize: d,
    currentVariance: std * std,
    confidence: power,
    autocorrelationAdjusted,
  };
}

// ========================================
// AUTOCORRELATION
// ========================================

/**
 * Calculates lag-1 autocorrelation for a time series.
 * High autocorrelation (>0.5) means trends may confound results.
 */
export function calculateAutocorrelation(values: number[]): AutocorrelationResult {
  if (values.length < 4) {
    return { lag1: 0, isProblematic: false, warning: null };
  }

  // Note: Values MUST be in chronological order for this to be valid.
  const mean = ss.mean(values);
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < values.length; i++) {
    denominator += Math.pow(values[i] - mean, 2);
    if (i > 0) {
      numerator += (values[i] - mean) * (values[i - 1] - mean);
    }
  }

  const lag1 = denominator === 0 ? 0 : numerator / denominator;
  const isProblematic = Math.abs(lag1) > 0.5;

  return {
    lag1,
    isProblematic,
    warning: isProblematic
      ? 'High autocorrelation detected. Your data has strong day-to-day trends that may reduce the reliability of this comparison. Consider a longer trial or adding a washout period.'
      : null,
  };
}

// ========================================
// BLOCKED RANDOMIZATION
// ========================================

/**
 * Generates a blocked randomization schedule.
 * Each block of `blockSize` days contains equal A and B assignments.
 * Washout days are inserted between condition switches.
 */
export function generateBlockedSchedule(
  startDate: string,
  totalDays: number,
  blockSize: number = 4,
  washoutPeriod: number = 2,
  seed?: number,
  conditions: string[] = ['A', 'B'],
): BlockedSchedule {
  const assignments: BlockedSchedule['assignments'] = [];
  const rng = seededRandom(seed ?? Date.now());

  let dayOffset = 0;
  let blockIndex = 0;
  let prevCondition: string | null = null;

  while (dayOffset < totalDays) {
    // Generate a balanced block with all conditions
    const perCondition = Math.floor(blockSize / conditions.length);
    const remainder = blockSize - perCondition * conditions.length;
    const block: string[] = [];
    for (let c = 0; c < conditions.length; c++) {
      const count = perCondition + (c < remainder ? 1 : 0);
      for (let i = 0; i < count; i++) block.push(conditions[c]);
    }

    // Fisher-Yates shuffle with seeded RNG
    for (let i = block.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [block[i], block[j]] = [block[j], block[i]];
    }

    for (const condition of block) {
      if (dayOffset >= totalDays) break;

      // Insert washout if condition switched
      if (prevCondition !== null && condition !== prevCondition && washoutPeriod > 0) {
        for (let w = 0; w < washoutPeriod && dayOffset < totalDays; w++) {
          assignments.push({
            date: addDays(startDate, dayOffset),
            condition: 'WASHOUT', // Avoid labeling washout with the new condition
            blockIndex: -1, // Washout isn't part of the analytical block
            isWashout: true,
          });
          dayOffset++;
        }
      }

      if (dayOffset >= totalDays) break;

      assignments.push({
        date: addDays(startDate, dayOffset),
        condition,
        blockIndex,
        isWashout: false,
      });
      dayOffset++;
      prevCondition = condition;
    }
    blockIndex++;
  }

  return { assignments };
}

// ========================================
// BAYESIAN POSTERIOR
// ========================================

/**
 * Calculates a Bayesian posterior for the difference in means using
 * a conjugate Normal-Normal model with a weakly informative prior.
 *
 * Returns the probability that the intervention has a positive effect,
 * plus a 95% credible interval.
 */
export function calculateBayesianPosterior(
  conditionA: number[],
  conditionB: number[],
): BayesianResult | null {
  if (conditionA.length < 3 || conditionB.length < 3) return null;

  const meanA = ss.mean(conditionA);
  const meanB = ss.mean(conditionB);

  // Use sample variance (dividing by n-1) for better uncertainty estimation in small N
  const varA = ss.sampleVariance(conditionA);
  const varB = ss.sampleVariance(conditionB);

  const nA = conditionA.length;
  const nB = conditionB.length;

  // Weakly informative prior: mean=0, variance=100
  const priorMean = 0;
  const priorVar = 100;

  // Observed difference and its variance
  const obsDiff = meanA - meanB;
  const obsVar = (varA / nA) + (varB / nB);

  if (obsVar === 0) return null;

  // Posterior parameters (conjugate update)
  const posteriorVar = 1 / (1 / priorVar + 1 / obsVar);
  const posteriorMean = posteriorVar * (priorMean / priorVar + obsDiff / obsVar);
  const posteriorStd = Math.sqrt(posteriorVar);

  // P(effect > 0) using normal CDF
  const z = posteriorMean / posteriorStd;
  const probabilityOfEffect = normalCDF(z);

  // 95% credible interval
  const ci: [number, number] = [
    posteriorMean - 1.96 * posteriorStd,
    posteriorMean + 1.96 * posteriorStd,
  ];

  return {
    probabilityOfEffect,
    posteriorMean,
    posteriorStd,
    credibleInterval: ci,
  };
}

// ========================================
// COVARIATE ADJUSTMENT
// ========================================

/**
 * Adjusts the treatment effect by regressing out covariates.
 * Uses residualization: regress outcome on covariates, then compare
 * residuals between conditions.
 */
export function adjustForCovariates(
  outcome: number[],
  condition: number[], // 0 or 1 for A/B
  covariates: { name: string; values: number[] }[],
): CovariateAdjustedResult | null {
  if (outcome.length < 5 || covariates.length === 0) return null;

  const n = outcome.length;

  // Raw effect (mean diff)
  const aValues = outcome.filter((_, i) => condition[i] === 0);
  const bValues = outcome.filter((_, i) => condition[i] === 1);
  if (aValues.length < 2 || bValues.length < 2) return null;
  const rawEffect = ss.mean(aValues) - ss.mean(bValues);

  // Simple approach: regress outcome on first covariate, use residuals
  // For multiple covariates, we chain residualization (sequential regression)
  let residuals = [...outcome];
  let totalR2 = 0;
  const usedCovariates: string[] = [];

  for (const cov of covariates) {
    if (cov.values.length !== n) continue;

    const reg = performLinearRegression(cov.values, residuals);
    if (!reg) continue;

    // Subtract predicted values to get residuals
    residuals = residuals.map((val, i) => val - reg.predict(cov.values[i]));
    totalR2 = 1 - (1 - totalR2) * (1 - reg.r2);
    usedCovariates.push(cov.name);
  }

  // Calculate adjusted effect from residuals
  const adjA = residuals.filter((_, i) => condition[i] === 0);
  const adjB = residuals.filter((_, i) => condition[i] === 1);
  const adjustedEffect = ss.mean(adjA) - ss.mean(adjB);

  return {
    adjustedEffect,
    rawEffect,
    covariatesUsed: usedCovariates,
    r2: totalR2,
  };
}

// ========================================
// BANG INDEX (BLINDING INTEGRITY)
// ========================================

/**
 * Calculates the Bang Blinding Index.
 * 0 = perfect blinding, 1 = complete unblinding.
 * If the user guesses correctly, check if this was better than chance.
 */
export function calculateBangIndex(
  userGuess: 'A' | 'B',
  actualCondition: 'A' | 'B',
): BangIndexResult {
  const guessedCorrectly = userGuess === actualCondition;

  // Bang Index: proportion correct - 0.5 (chance), scaled to 0-1
  // For a single trial this is binary; for multiple trials you'd aggregate.
  // Here we return 1 if correct, 0 if wrong, and flag if correct.
  const bangIndex = guessedCorrectly ? 1.0 : 0.0;

  return {
    guessedCorrectly,
    bangIndex,
    integrityWarning: guessedCorrectly
      ? 'You correctly identified the active condition. This suggests blinding may have been compromised, and results should be interpreted with caution.'
      : null,
  };
}

// ========================================
// BLOCK-MEAN ANALYSIS
// ========================================

/**
 * Performs block-mean analysis for BLOCKED randomization experiments.
 * Groups observations by blockIndex, computes within-block A-B differences,
 * then runs a one-sample t-test on those differences (H0: μ_diff = 0).
 */
export function performBlockAnalysis(
  chartData: { date: string; dependent: number | null; condition: string | null; isWashout: boolean }[],
  assignments: { date: string; condition: string; blockIndex: number; isWashout: boolean }[],
): BlockAnalysisResult | null {
  if (!assignments || assignments.length === 0) return null;

  // Build date→assignment map
  const assignmentMap = new Map<string, { condition: string; blockIndex: number }>();
  for (const a of assignments) {
    if (!a.isWashout && a.blockIndex >= 0) {
      assignmentMap.set(a.date, { condition: a.condition, blockIndex: a.blockIndex });
    }
  }

  // Collect unique non-washout conditions
  const conditionSet = new Set<string>();
  for (const a of assignments) {
    if (!a.isWashout && a.blockIndex >= 0) conditionSet.add(a.condition);
  }
  const condLabels = Array.from(conditionSet);
  if (condLabels.length < 2) return null;

  // Group values by block and condition
  const blocks = new Map<number, Map<string, number[]>>();
  for (const d of chartData) {
    if (d.dependent === null || d.isWashout) continue;
    const asgn = assignmentMap.get(d.date);
    if (!asgn) continue;
    if (!blocks.has(asgn.blockIndex)) blocks.set(asgn.blockIndex, new Map());
    const block = blocks.get(asgn.blockIndex)!;
    if (!block.has(asgn.condition)) block.set(asgn.condition, []);
    block.get(asgn.condition)!.push(d.dependent);
  }

  // For block analysis use first two conditions (A-B difference generalization)
  const cA = condLabels[0];
  const cB = condLabels[1];

  // Compute within-block differences, skip blocks missing a condition
  const blockDifferences: number[] = [];
  let imbalancedCount = 0;
  for (const [, block] of blocks) {
    const valsA = block.get(cA) ?? [];
    const valsB = block.get(cB) ?? [];
    if (valsA.length === 0 || valsB.length === 0) {
      imbalancedCount++;
      continue;
    }
    const total = valsA.length + valsB.length;
    const ratio = Math.min(valsA.length, valsB.length) / total;
    if (ratio < 0.2) imbalancedCount++;
    blockDifferences.push(ss.mean(valsA) - ss.mean(valsB));
  }

  if (blockDifferences.length < 2) return null;

  const meanBlockDiff = ss.mean(blockDifferences);
  const stdBlockDiff = ss.sampleStandardDeviation(blockDifferences);
  const effectSize = stdBlockDiff === 0 ? 0 : meanBlockDiff / stdBlockDiff;

  // One-sample t-test: H0 μ_diff = 0
  let tTest: BlockAnalysisResult['tTest'] = null;
  if (stdBlockDiff > 0) {
    const t = meanBlockDiff / (stdBlockDiff / Math.sqrt(blockDifferences.length));
    const df = blockDifferences.length - 1;
    const pValue = tTestPValue(t, df);
    tTest = { tStatistic: t, pValue, significant: pValue < 0.05 };
  }

  const imbalanceRate = imbalancedCount / blocks.size;
  const missingDataWarning = imbalanceRate > 0.3
    ? `${(imbalanceRate * 100).toFixed(0)}% of blocks had imbalanced or missing conditions.`
    : null;

  return {
    nBlocks: blockDifferences.length,
    blockDifferences,
    meanBlockDiff,
    tTest,
    effectSize,
    missingDataWarning,
  };
}

// ========================================
// CARRYOVER EFFECT TEST
// ========================================

/**
 * Tests for carryover effects by splitting each condition's observations
 * within blocks into first-half and second-half, then running Welch's t-test.
 */
export function testCarryoverEffect(
  chartData: { date: string; dependent: number | null; condition: string | null; isWashout: boolean }[],
  assignments: { date: string; condition: string; blockIndex: number; isWashout: boolean }[],
): CarryoverTestResult | null {
  if (!assignments || assignments.length === 0) return null;

  const assignmentMap = new Map<string, { condition: string; blockIndex: number }>();
  for (const a of assignments) {
    if (!a.isWashout && a.blockIndex >= 0) {
      assignmentMap.set(a.date, { condition: a.condition, blockIndex: a.blockIndex });
    }
  }

  // Collect unique non-washout conditions
  const conditionSet = new Set<string>();
  for (const a of assignments) {
    if (!a.isWashout && a.blockIndex >= 0) conditionSet.add(a.condition);
  }
  const condLabels = Array.from(conditionSet);
  if (condLabels.length < 2) return null;

  // Collect per-block values for each condition
  const condBlocks = new Map<string, Map<number, number[]>>();
  for (const label of condLabels) condBlocks.set(label, new Map());
  for (const d of chartData) {
    if (d.dependent === null || d.isWashout) continue;
    const asgn = assignmentMap.get(d.date);
    if (!asgn || !condBlocks.has(asgn.condition)) continue;
    const map = condBlocks.get(asgn.condition)!;
    if (!map.has(asgn.blockIndex)) map.set(asgn.blockIndex, []);
    map.get(asgn.blockIndex)!.push(d.dependent);
  }

  function splitAndTest(blockMap: Map<number, number[]>) {
    const firstHalf: number[] = [];
    const secondHalf: number[] = [];
    for (const [, vals] of blockMap) {
      if (vals.length < 2) continue;
      const mid = Math.floor(vals.length / 2);
      firstHalf.push(...vals.slice(0, mid));
      secondHalf.push(...vals.slice(mid));
    }
    if (firstHalf.length < 3 || secondHalf.length < 3) return null;
    return welchTTest(firstHalf, secondHalf);
  }

  // Use first two conditions for backward-compatible carryover test
  const cA = condLabels[0];
  const cB = condLabels[1];
  const aResult = splitAndTest(condBlocks.get(cA)!);
  const bResult = splitAndTest(condBlocks.get(cB)!);
  const hasCarryover = (aResult?.significant ?? false) || (bResult?.significant ?? false);

  return {
    conditionACarryover: aResult,
    conditionBCarryover: bResult,
    hasCarryover,
    warning: hasCarryover
      ? 'Carryover effect detected: observations within blocks show systematic early-vs-late differences. Consider increasing washout periods.'
      : null,
  };
}

// ========================================
// PERIOD/SEQUENCE EFFECT TEST
// ========================================

/**
 * Tests whether block differences change over time (period effect).
 * Splits block differences chronologically into early/late halves.
 */
export function testPeriodEffect(
  blockDifferences: number[],
): PeriodEffectResult | null {
  if (blockDifferences.length < 4) return null;

  const mid = Math.floor(blockDifferences.length / 2);
  const early = blockDifferences.slice(0, mid);
  const late = blockDifferences.slice(mid);

  if (early.length < 2 || late.length < 2) return null;

  const earlyMeanDiff = ss.mean(early);
  const lateMeanDiff = ss.mean(late);
  const tTest = welchTTest(early, late);
  const hasPeriodEffect = tTest?.significant ?? false;

  return {
    earlyMeanDiff,
    lateMeanDiff,
    tTest,
    hasPeriodEffect,
    warning: hasPeriodEffect
      ? 'Period effect detected: the treatment difference changed significantly between early and late blocks. Results may reflect adaptation or learning rather than a true effect.'
      : null,
  };
}

// ========================================
// SEQUENTIAL TESTING (O'Brien-Fleming)
// ========================================

/**
 * Calculates the O'Brien-Fleming sequential testing boundary.
 * Critical value = z_{α/2} / √t where t = data fraction (current/planned looks).
 */
export function calculateSequentialBoundary(
  currentZ: number,
  currentLook: number,
  totalLooks: number = 5,
  alpha: number = 0.05,
): SequentialBoundary {
  const t = currentLook / totalLooks; // data fraction
  const zAlphaHalf = zFromP(alpha / 2);
  const criticalValue = zAlphaHalf / Math.sqrt(t);
  const alphaSpent = 2 * (1 - normalCDF(criticalValue));

  return {
    currentZ: Math.abs(currentZ),
    criticalValue,
    alphaSpent,
    dataFraction: t,
    nLooks: totalLooks,
    canRejectNull: Math.abs(currentZ) >= criticalValue,
    canStopForFutility: t >= 0.5 && Math.abs(currentZ) < 0.5,
  };
}

// ========================================
// CORE N=1 ANALYSIS
// ========================================

/**
 * Main analysis function for a completed N=1 trial.
 * Takes the outcome values for each condition (excluding washout days)
 * and returns a comprehensive result.
 */
export function performN1Stats(
  conditionA: number[],
  conditionB: number[],
  temporalValues?: number[],
  blockAnalysis?: BlockAnalysisResult | null,
  carryoverTest?: CarryoverTestResult | null,
  periodEffect?: PeriodEffectResult | null,
  sequentialBoundary?: SequentialBoundary | null,
): N1TrialResult | null {
  if (conditionA.length < 3 || conditionB.length < 3) return null;

  const meanA = ss.mean(conditionA);
  const meanB = ss.mean(conditionB);
  const stdA = ss.standardDeviation(conditionA);
  const stdB = ss.standardDeviation(conditionB);

  // Cohen's d (pooled)
  const pooledStd = Math.sqrt(
    ((conditionA.length - 1) * stdA * stdA + (conditionB.length - 1) * stdB * stdB) /
    (conditionA.length + conditionB.length - 2)
  );
  const effectSize = pooledStd === 0 ? 0 : (meanA - meanB) / pooledStd;

  // Effect label
  const absD = Math.abs(effectSize);
  let effectLabel: string;
  if (absD < 0.2) effectLabel = 'Negligible';
  else if (absD < 0.5) effectLabel = 'Small';
  else if (absD < 0.8) effectLabel = 'Medium';
  else effectLabel = 'Large';

  // T-test
  let tTest: N1TrialResult['tTest'] = null;
  const seA = stdA / Math.sqrt(conditionA.length);
  const seB = stdB / Math.sqrt(conditionB.length);
  const seDiff = Math.sqrt(seA * seA + seB * seB);
  if (seDiff > 0) {
    const t = (meanA - meanB) / seDiff;
    const dfNum = Math.pow(seA * seA + seB * seB, 2);
    const dfDen = Math.pow(seA * seA, 2) / (conditionA.length - 1) +
      Math.pow(seB * seB, 2) / (conditionB.length - 1);
    const df = dfNum / dfDen;
    const pValue = tTestPValue(t, df);
    tTest = { tStatistic: t, pValue, significant: pValue < 0.05 };
  }

  // Bayesian
  const bayesian = calculateBayesianPosterior(conditionA, conditionB);
  if (!bayesian) return null;

  // Autocorrelation on chronologically ordered series (not grouped by condition)
  const allValues = temporalValues ?? [...conditionA, ...conditionB];
  const autocorrelation = calculateAutocorrelation(allValues);

  return {
    effectSize,
    effectLabel,
    tTest,
    bayesian,
    autocorrelation,
    conditionAMean: meanA,
    conditionBMean: meanB,
    conditionAStd: stdA,
    conditionBStd: stdB,
    nA: conditionA.length,
    nB: conditionB.length,
    blockAnalysis: blockAnalysis ?? null,
    carryoverTest: carryoverTest ?? null,
    periodEffect: periodEffect ?? null,
    sequentialBoundary: sequentialBoundary ?? null,
  };
}

// ========================================
// AUDIT REPORT & EXPORT
// ========================================

/**
 * Compiles all statistics into a standardized scientific summary
 * for transparency and peer review.
 */
export function generateAuditReport(params: {
  experimentName: string;
  hypothesis: string;
  hypothesisLockedAt: string | null;
  startDate: string;
  endDate: string;
  randomizationType: string;
  washoutPeriod: number;
  isBlind: boolean;
  conditionA: number[];
  conditionB: number[];
  blindGuess?: 'A' | 'B';
  actualBlindCondition?: 'A' | 'B';
  covariates?: { name: string; values: number[] }[];
  analysisModifiedAfterLock?: boolean;
}): AuditReport | null {
  const results = performN1Stats(params.conditionA, params.conditionB);
  if (!results) return null;

  let bangIndex: BangIndexResult | null = null;
  if (params.blindGuess && params.actualBlindCondition) {
    bangIndex = calculateBangIndex(params.blindGuess, params.actualBlindCondition);
  }

  let covariateAdjustment: CovariateAdjustedResult | null = null;
  if (params.covariates && params.covariates.length > 0) {
    const allOutcome = [...params.conditionA, ...params.conditionB];
    const allCondition = [
      ...Array(params.conditionA.length).fill(0),
      ...Array(params.conditionB.length).fill(1),
    ];
    covariateAdjustment = adjustForCovariates(allOutcome, allCondition, params.covariates);
  }

  return {
    experimentName: params.experimentName,
    hypothesis: params.hypothesis,
    hypothesisLockedAt: params.hypothesisLockedAt,
    startDate: params.startDate,
    endDate: params.endDate,
    randomizationType: params.randomizationType,
    washoutPeriod: params.washoutPeriod,
    isBlind: params.isBlind,
    results,
    bangIndex,
    covariateAdjustment,
    analysisModifiedAfterLock: params.analysisModifiedAfterLock ?? false,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Formats trial data for CSV export.
 */
export function exportRawData(
  assignments: { date: string; condition: string; isWashout: boolean }[],
  outcomeByDate: Record<string, number>,
): string {
  const header = 'date,condition,is_washout,outcome_value';
  const rows = assignments.map((a) => {
    const val = outcomeByDate[a.date] ?? '';
    return `${a.date},${a.condition},${a.isWashout},${val}`;
  });
  return [header, ...rows].join('\n');
}

// ========================================
// HELPERS
// ========================================

/** Welch's t-test between two independent samples. */
function welchTTest(a: number[], b: number[]): { tStatistic: number; pValue: number; significant: boolean } | null {
  if (a.length < 2 || b.length < 2) return null;
  const meanA = ss.mean(a);
  const meanB = ss.mean(b);
  const varA = ss.sampleVariance(a);
  const varB = ss.sampleVariance(b);
  const seA = varA / a.length;
  const seB = varB / b.length;
  const seDiff = Math.sqrt(seA + seB);
  if (seDiff === 0) return null;
  const t = (meanA - meanB) / seDiff;
  const dfNum = Math.pow(seA + seB, 2);
  const dfDen = Math.pow(seA, 2) / (a.length - 1) + Math.pow(seB, 2) / (b.length - 1);
  const df = dfNum / dfDen;
  const pValue = tTestPValue(t, df);
  return { tStatistic: t, pValue, significant: pValue < 0.05 };
}

/** Approximate inverse normal (z from p) using Abramowitz & Stegun rational approx. */
export function zFromP(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p > 0.5) return -zFromP(1 - p);

  const t = Math.sqrt(-2 * Math.log(p));
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;

  return t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
}

/** Standard normal CDF approximation. */
export function normalCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/** Add days to a YYYY-MM-DD string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Seeded PRNG (mulberry32). */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ========================================
// MULTI-ARM ANALYSIS (3+ CONDITIONS)
// ========================================

/**
 * Chi-squared CDF approximation for Kruskal-Wallis p-value calculation.
 * Uses Wilson-Hilferty normal approximation for large df.
 */
function chiSquaredCDF(x: number, df: number): number {
  if (x <= 0) return 0;
  if (df <= 0) return 1;

  // Wilson-Hilferty approximation
  const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
  const se = Math.sqrt(2 / (9 * df));
  return normalCDF(z / se);
}

/**
 * Performs Kruskal-Wallis H test for comparing 3+ groups.
 * Non-parametric alternative to one-way ANOVA.
 * 
 * H = (12 / N(N+1)) * Σ(Rᵢ²/nᵢ) - 3(N+1)
 */
export function performKruskalWallisTest(
  groups: number[][],
): { H: number; pValue: number; significant: boolean } | null {
  if (groups.length < 2) return null;

  // Remove empty groups
  const validGroups = groups.filter(g => g.length > 0);
  if (validGroups.length < 2) return null;

  // Combine all values with group labels
  const allValues: { value: number; group: number }[] = [];
  validGroups.forEach((group, groupIdx) => {
    group.forEach(value => {
      allValues.push({ value, group: groupIdx });
    });
  });

  const N = allValues.length;
  if (N < 5) return null;

  // Rank all values (handling ties with average ranks)
  allValues.sort((a, b) => a.value - b.value);
  const ranks: number[] = new Array(N);

  let i = 0;
  while (i < N) {
    let j = i;
    // Find tie group
    while (j < N && allValues[j].value === allValues[i].value) {
      j++;
    }
    // Average rank for tie group
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      ranks[k] = avgRank;
    }
    i = j;
  }

  // Reassign ranks to original data structure
  allValues.forEach((item, idx) => {
    (item as { value: number; group: number; rank?: number }).rank = ranks[idx];
  });

  // Sum of ranks for each group
  const rankSums: number[] = new Array(validGroups.length).fill(0);
  const groupSizes: number[] = validGroups.map(g => g.length);

  allValues.forEach((item, idx) => {
    rankSums[item.group] += ranks[idx];
  });

  // Calculate H statistic
  let H = 0;
  for (let g = 0; g < validGroups.length; g++) {
    H += (rankSums[g] * rankSums[g]) / groupSizes[g];
  }
  H = (12 / (N * (N + 1))) * H - 3 * (N + 1);

  // Degrees of freedom = k - 1
  const df = validGroups.length - 1;

  // p-value from chi-squared distribution
  const pValue = 1 - chiSquaredCDF(H, df);

  return {
    H,
    pValue,
    significant: pValue < 0.05,
  };
}

/**
 * Performs linear dose-response regression.
 * If conditions have numeric doses, fits Y = a + b*dose.
 */
export function performDoseResponseRegression(
  doses: number[],
  outcomes: number[],
): DoseResponseResult | null {
  if (doses.length < 3 || doses.length !== outcomes.length) return null;

  // Check if doses have variance
  const uniqueDoses = new Set(doses);
  if (uniqueDoses.size < 2) return null;

  const n = doses.length;
  const meanDose = ss.mean(doses);
  const meanOutcome = ss.mean(outcomes);

  // Calculate slope and intercept
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (doses[i] - meanDose) * (outcomes[i] - meanOutcome);
    denominator += (doses[i] - meanDose) * (doses[i] - meanDose);
  }

  if (denominator === 0) return null;

  const slope = numerator / denominator;
  const intercept = meanOutcome - slope * meanDose;

  // Calculate R²
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * doses[i];
    ssRes += (outcomes[i] - predicted) ** 2;
    ssTot += (outcomes[i] - meanOutcome) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  // F-test for significance
  const dfReg = 1;
  const dfRes = n - 2;
  const msReg = (ssTot - ssRes) / dfReg;
  const msRes = ssRes / dfRes;
  const fStat = msRes === 0 ? 0 : msReg / msRes;

  // Approximate p-value from F distribution (using normal approximation)
  // For simple regression, t = slope / SE(slope), and F = t²
  const t = Math.sqrt(fStat);
  const pValue = dfRes > 0 ? tTestPValue(t, dfRes) : 1;

  // Find optimal dose (within observed range)
  const minDose = Math.min(...doses);
  const maxDose = Math.max(...doses);

  // Generate curve points
  const curve: { dose: number; predicted: number }[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const dose = minDose + (maxDose - minDose) * (i / steps);
    curve.push({ dose, predicted: intercept + slope * dose });
  }

  // Optimal dose: if slope > 0, max dose; if slope < 0, min dose
  // (This is a simple heuristic; real optimization would consider constraints)
  const optimalDose = slope > 0 ? maxDose : minDose;

  return {
    slope,
    intercept,
    r2,
    pValue,
    optimalDose: pValue < 0.05 ? optimalDose : null,
    curve,
  };
}

/**
 * Main orchestrator for multi-arm (3+) condition analysis.
 * 
 * @param conditionData Map of condition label → outcome values
 * @param conditionDoses Optional map of condition label → numeric dose
 * @param temporalValues Optional chronologically ordered values for autocorrelation
 */
export function performMultiArmAnalysis(
  conditionData: Map<string, number[]>,
  conditionDoses?: Map<string, number>,
  temporalValues?: number[],
): MultiArmResult | null {
  const conditions = Array.from(conditionData.keys());
  if (conditions.length < 2) return null;

  // Calculate stats for each condition
  const conditionStats: ConditionStats[] = conditions.map(label => {
    const values = conditionData.get(label) || [];
    return {
      label,
      mean: values.length > 0 ? ss.mean(values) : 0,
      std: values.length > 1 ? ss.standardDeviation(values) : 0,
      n: values.length,
      dose: conditionDoses?.get(label),
    };
  }).filter(cs => cs.n > 0);

  if (conditionStats.length < 2) return null;

  // Prepare groups for Kruskal-Wallis
  const groups = conditionStats.map(cs => conditionData.get(cs.label) || []);
  const kruskalWallis = performKruskalWallisTest(groups);

  // Pairwise comparisons with Bonferroni correction
  const pairwiseComparisons: PairwiseComparison[] = [];
  const nComparisons = (conditionStats.length * (conditionStats.length - 1)) / 2;
  const bonferroniAlpha = 0.05 / nComparisons;

  for (let i = 0; i < conditionStats.length; i++) {
    for (let j = i + 1; j < conditionStats.length; j++) {
      const valuesA = conditionData.get(conditionStats[i].label) || [];
      const valuesB = conditionData.get(conditionStats[j].label) || [];

      if (valuesA.length < 2 || valuesB.length < 2) continue;

      // Welch's t-test for pairwise comparison
      const meanA = ss.mean(valuesA);
      const meanB = ss.mean(valuesB);
      const seA = ss.standardDeviation(valuesA) / Math.sqrt(valuesA.length);
      const seB = ss.standardDeviation(valuesB) / Math.sqrt(valuesB.length);
      const seDiff = Math.sqrt(seA * seA + seB * seB);

      if (seDiff > 0) {
        const t = (meanA - meanB) / seDiff;
        const dfNum = Math.pow(seA * seA + seB * seB, 2);
        const dfDen = Math.pow(seA * seA, 2) / (valuesA.length - 1) +
          Math.pow(seB * seB, 2) / (valuesB.length - 1);
        const df = dfNum / dfDen;
        const pValue = tTestPValue(t, df);

        pairwiseComparisons.push({
          conditionA: conditionStats[i].label,
          conditionB: conditionStats[j].label,
          meanDiff: meanA - meanB,
          pValue,
          significant: pValue < bonferroniAlpha,
        });
      }
    }
  }

  // Dose-response regression (if doses provided)
  let doseResponse: DoseResponseResult | null = null;
  if (conditionDoses && conditionDoses.size > 0) {
    const doses: number[] = [];
    const outcomes: number[] = [];

    for (const [label, values] of conditionData) {
      const dose = conditionDoses.get(label);
      if (dose !== undefined) {
        for (const v of values) {
          doses.push(dose);
          outcomes.push(v);
        }
      }
    }

    if (doses.length >= 3) {
      doseResponse = performDoseResponseRegression(doses, outcomes);
    }
  }

  // Autocorrelation on temporal values
  const allValues = temporalValues ?? Array.from(conditionData.values()).flat();
  const autocorrelation = calculateAutocorrelation(allValues);

  return {
    nConditions: conditionStats.length,
    conditionStats,
    kruskalWallis,
    pairwiseComparisons,
    doseResponse,
    autocorrelation,
  };
}
