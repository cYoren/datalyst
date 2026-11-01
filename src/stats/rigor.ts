/**
 * Rigor Score Algorithm
 * 
 * Gamifies scientific quality by scoring experiments on methodology.
 * Score range: 0-100
 */

export interface RigorScoreInput {
    // Pre-registration
    hypothesisLockedAt: Date | null;

    // Blinding
    isBlind: boolean;

    // Autocorrelation (from N1 stats)
    autocorrelationIsProblematic: boolean;

    // Sample sizes
    nA: number;
    nB: number;

    // Experiment type
    type: 'OBSERVATIONAL' | 'RANDOMIZED' | 'BLIND_RCT';
}

export interface RigorScoreResult {
    score: number;
    grade: string;
    breakdown: {
        preRegistration: number;
        blinding: number;
        autocorrelation: number;
        sampleSize: number;
        balancedDesign: number;
    };
    tips: string[];
}

/**
 * Calculate the Rigor Score for an experiment
 */
export function calculateRigorScore(input: RigorScoreInput): RigorScoreResult {
    const breakdown = {
        preRegistration: 0,
        blinding: 0,
        autocorrelation: 0,
        sampleSize: 0,
        balancedDesign: 0,
    };
    const tips: string[] = [];

    // Pre-registration (+20)
    if (input.hypothesisLockedAt) {
        breakdown.preRegistration = 20;
    } else {
        tips.push('Lock your hypothesis before starting to earn +20 points.');
    }

    // Blinding (+20)
    if (input.isBlind) {
        breakdown.blinding = 20;
    } else if (input.type !== 'OBSERVATIONAL') {
        tips.push('Enable blinding to reduce expectation bias (+20 points).');
    }

    // Low Autocorrelation (+20)
    if (!input.autocorrelationIsProblematic) {
        breakdown.autocorrelation = 20;
    } else {
        tips.push('High day-to-day drift detected. Results may reflect trends rather than your intervention.');
    }

    // Sample Size: ≥14 days total (+20)
    const totalDays = input.nA + input.nB;
    if (totalDays >= 14) {
        breakdown.sampleSize = 20;
    } else {
        const daysNeeded = 14 - totalDays;
        tips.push(`Add ${daysNeeded} more day${daysNeeded > 1 ? 's' : ''} to reach the recommended sample size (+20 points).`);
    }

    // Balanced Design: ratio ≥0.7 (+20)
    if (totalDays > 0) {
        const ratio = Math.min(input.nA, input.nB) / Math.max(input.nA, input.nB);
        if (ratio >= 0.7) {
            breakdown.balancedDesign = 20;
        } else {
            tips.push('Unbalanced conditions. Aim for roughly equal days in each condition (+20 points).');
        }
    }

    const score =
        breakdown.preRegistration +
        breakdown.blinding +
        breakdown.autocorrelation +
        breakdown.sampleSize +
        breakdown.balancedDesign;

    return {
        score,
        grade: getRigorGrade(score),
        breakdown,
        tips,
    };
}

/**
 * Convert score to letter grade
 */
export function getRigorGrade(score: number): string {
    if (score >= 100) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B+';
    if (score >= 60) return 'B';
    if (score >= 50) return 'C+';
    if (score >= 40) return 'C';
    return 'D';
}

/**
 * Get color class for grade display
 */
export function getRigorGradeColor(grade: string): string {
    switch (grade) {
        case 'A+':
        case 'A':
            return 'text-green-600';
        case 'B+':
        case 'B':
            return 'text-blue-600';
        case 'C+':
        case 'C':
            return 'text-amber-600';
        default:
            return 'text-red-600';
    }
}
