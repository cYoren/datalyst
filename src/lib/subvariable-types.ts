export const SubvariableType = {
    NUMERIC: 'NUMERIC',
    SCALE_0_10: 'SCALE_0_10',
    BOOLEAN: 'BOOLEAN',
    CATEGORY: 'CATEGORY',
} as const;

export type SubvariableType = (typeof SubvariableType)[keyof typeof SubvariableType];
