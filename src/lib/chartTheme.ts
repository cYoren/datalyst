// Literal colours for recharts: SVG presentation attributes can't resolve CSS variables.
// Mirrors the palette in globals.css.
export const chart = {
    grid: 'rgba(242, 241, 238, 0.08)',
    axis: '#8e8d8b',
    teal: '#5ed3b5',
    /** Same colour as an `r, g, b` triple, for the canvas dot charts. */
    tealRgb: '94, 211, 181',
    violet: '#9d9fff',
    amber: '#f5b54a',
    coral: '#ff8a6b',
    surface: '#17181c',
    tick: { fontSize: 11, fill: '#8e8d8b', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' },
    tooltip: {
        backgroundColor: '#1d1f24',
        border: '1px solid rgba(242, 241, 238, 0.2)',
        borderRadius: 2,
        boxShadow: 'none',
        color: '#f2f1ee',
        fontSize: 12,
    },
    tooltipCursor: { fill: 'rgba(242, 241, 238, 0.06)' },
} as const;
