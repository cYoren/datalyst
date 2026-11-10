Status: current

# Charts

One chart draws every quantity over time in Datalyst: `src/components/charts/DotAreaChart.tsx`.
It is not a wrapper around a chart library, and there is no chart library on those
screens.

## The look, and why

Borrowed from the dot-matrix planners, measured rather than guessed: an 8 px dot
pitch, a 4 px dot, and a faint dot on every cell of the whole plot so an empty
range still looks like paper.

- The field reaches the **stacked** total, not each series' own height.
- Each dot's alpha ramps fast from its column's top down to a dim floor on the
  baseline: brightest on the curve, dark by the middle, still faintly present on
  the axis. `cellAlpha` in `src/lib/dotMatrix.ts`.
- A slightly brighter row marks where each series' own top edge lands. That step
  is what keeps several stacked things readable as several things.
- Chrome is only: a baseline, bare tick labels, dotted reference lines labelled
  once at the right, optional callouts hanging off hairlines, and markers sitting
  on the axis. No gridlines, no y axis, no stroke on the curve.

Canvas for the matrix, because the fade is per cell and neither a pattern fill nor
an area gradient can vary with each cell's height inside its own column. SVG on
top for text, leaders, markers and the dotted rules.

## Using it

```tsx
<DotAreaChart
  series={[{ id: 'sleep', color: '94, 211, 181', points: [{ x: 0, y: 6 }] }]}
  min={0}
  max={29}
  axisLabels={[{ x: 0, text: '10/16' }]}
  rules={[{ y: 5.7, label: 'avg 5.7' }]}
  callouts={[{ x: 21, title: 'BEST 8.2', detail: '11/06', to: 8.2 }]}
  markers={[{ x: 12 }]}
  ariaLabel="Sleep quality over thirty days"
/>
```

- `series` stack bottom to top in array order, so a composition is just more
  series. Colours are `r, g, b` triples so the painter can build any alpha.
- Callouts place themselves: left to right, first row that does not overlap the
  previous block, and the plot box shrinks to make room for the rows used. Never
  position them by hand.
- `yMax` pins the scale (a 0 to 10 survey), otherwise it comes from the stacked
  totals with a little headroom.
- `verticals` is a hairline at an x (now, an intervention, a cut-off).

## Who uses it

- `/levels` (`LevelCurve` adapter): one series per dose, logged in bone, planned
  in the accent, the floor as a rule, peak and bedtime as callouts.
- The Data page (`DataDashboard`): one series per numeric tracker, the mean as the
  rule, dates along the axis.

`src/lib/dotMatrix.ts` holds the geometry (`columnAt`, `buildColumns`, `valueAt`,
`cellAlpha`, `niceCeiling`) and `dotMatrix.test.ts` covers it. Keep the drawing
dumb and the maths tested: if a chart needs a new shape, add it there first.
