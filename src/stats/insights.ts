import { CorrelationResult } from './correlations';
import { TTestResult, ChiSquareResult } from './tests';

/**
 * Generates natural language insights from statistical results
 */
export class InsightGenerator {

    static interpretCorrelation(
        var1Name: string,
        var2Name: string,
        result: CorrelationResult
    ): string {
        const strength = Math.abs(result.coefficient);
        const direction = result.coefficient > 0 ? 'positive' : 'negative';
        const isSignificant = result.pValue < 0.05;

        if (!isSignificant) {
            return `No statistically significant relationship found between ${var1Name} and ${var2Name} in the current data.`;
        }

        let strengthText = '';
        if (strength > 0.7) strengthText = 'very strong';
        else if (strength > 0.5) strengthText = 'strong';
        else if (strength > 0.3) strengthText = 'moderate';
        else strengthText = 'weak';

        const action = result.coefficient > 0 ? 'increase' : 'decrease';

        return `The data shows a ${strengthText} ${direction} association between ${var1Name} and ${var2Name}. When ${var1Name} is higher, ${var2Name} also tends to ${action}. This is a pattern in the current data, not proof that one causes the other.`;
    }

    static interpretTTest(
        group1Name: string,
        group2Name: string,
        variableName: string,
        result: TTestResult
    ): string {
        if (!result.significant) {
            return `The difference in ${variableName} between ${group1Name} days and ${group2Name} days is not statistically significant.`;
        }

        const diff = Math.abs(result.meanDiff).toFixed(1);
        const higherGroup = result.meanDiff > 0 ? group1Name : group2Name;

        return `On ${higherGroup} days, your ${variableName} level is on average ${diff} points higher than on ${higherGroup === group1Name ? group2Name : group1Name} days.`;
    }

    static interpretChiSquare(
        var1Name: string,
        var2Name: string,
        result: ChiSquareResult
    ): string {
        if (!result.significant) {
            return `There doesn't appear to be a direct connection between ${var1Name} and ${var2Name}.`;
        }

        return `There is a significant association between ${var1Name} and ${var2Name}. These habits tend to occur (or not occur) together more often than chance would explain.`;
    }
}
