/**
 * One tiny dependency-free SVG line chart, used twice on the hover card
 * (balance trend and daily-spend trend). Unlike the pricing plugin's hit-rate
 * sparkline, the domain is DYNAMIC — balances do not live on a 0..1 scale —
 * with headroom so the polyline never rides the frame.
 *
 * @module dsh-openrouter-monitor/client/trend
 */

import { memo } from 'react'

export interface TrendProps {
  /** Numbers in display order (oldest first). At least 2 points to draw. */
  readonly values: readonly number[]
  /** Lower bound of a meaningful reading; below this shows the empty state. */
  readonly minPoints?: number
  readonly color: string
  readonly width?: number
  readonly height?: number
  /** Format the last-value callout. */
  readonly label: (value: number) => string
}

const PAD_Y = 8
const AXIS = 'rgba(139, 148, 158, 0.55)'

/**
 * Compute chart geometry for `values`: x positions evenly spaced by index,
 * y positions scaled to `[min - pad, max + pad]` with a degenerate range
 * (flat line) centered instead of exploding.
 */
function geometry(values: readonly number[], width: number, height: number): {
  xs: readonly number[]
  ys: readonly number[]
} {
  const n = values.length
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  // Flat series still deserve a visible band, not a single pixel row.
  const lo = span === 0 ? min - Math.abs(min) * 0.05 - 1 : min - span * 0.08
  const hi = span === 0 ? max + Math.abs(max) * 0.05 + 1 : max + span * 0.08
  const usable = hi - lo || 1
  return {
    xs: values.map((_, i) => 4 + ((width - TREND_LABEL_W - 8) * i) / Math.max(1, n - 1)),
    ys: values.map((v) => height - PAD_Y - ((v - lo) / usable) * (height - 2 * PAD_Y)),
  }
}

/** Right margin reserved for the latest-value callout text. */
const TREND_LABEL_W = 44

export const Trend = memo(function Trend({
  values,
  minPoints = 2,
  color,
  width = 280,
  height = 52,
  label,
}: TrendProps) {
  // Non-finite samples would turn the whole geometry into NaN paths.
  if (values.length < minPoints || !values.every(Number.isFinite)) return null
  const { xs, ys } = geometry(values, width, height)
  const points = xs.map((x, i) => `${x.toFixed(1)},${ys[i]!.toFixed(1)}`)
  const lastIdx = values.length - 1
  const lastX = xs[lastIdx]!
  const lastY = ys[lastIdx]!

  return (
    <svg aria-hidden="true" height={height} style={{ display: 'block', margin: '2px 0 10px' }} width={width}>
      <path
        d={`M ${xs[0]},${height - PAD_Y} L ${points.join(' L ')} L ${lastX},${height - PAD_Y} Z`}
        fill={`${color}22`}
      />
      <polyline
        fill="none"
        points={points.join(' ')}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      {/* A faint baseline helps eyes anchor without implying zero matters. */}
      <line stroke={AXIS} strokeDasharray="3 3" strokeWidth={1}
        x1={4} x2={width - TREND_LABEL_W} y1={height - PAD_Y} y2={height - PAD_Y} />
      <circle cx={lastX} cy={lastY} fill={color} r={2.5} />
      <text
        fill={color}
        fontSize={10}
        fontWeight={600}
        textAnchor="end"
        // Keep the callout inside the frame when the point rides high.
        y={lastY < PAD_Y + 12 ? lastY + 16 : lastY - 7}
        x={lastX}
      >
        {label(values[lastIdx]!)}
      </text>
    </svg>
  )
})
