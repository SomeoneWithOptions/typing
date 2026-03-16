import { useMemo, useState } from 'react'
import { KEYBOARD_ROWS } from '../lib/constants'
import { computeHeatmapData, type KeyErrorStats } from '../lib/heatmap'
import type { Letter, SessionRecord } from '../lib/types'

/**
 * Maps an error rate to a hue value for the accent bar.
 * 0% -> 160 (teal/accent), ~5% -> 40 (amber), 10%+ -> 340 (pink/error)
 * Returns both the hue and a normalized intensity (0..1).
 */
function getHeatValues(errorRate: number, maxErrorRate: number): { hue: number; intensity: number } {
  if (maxErrorRate <= 0 || errorRate <= 0) return { hue: 160, intensity: 0 }

  const t = Math.min(errorRate / Math.max(maxErrorRate, 0.5), 1)

  // Piecewise hue: teal(160) -> amber(40) -> pink(340)
  const hue = t < 0.5
    ? 160 - t * 2 * 120
    : 40 - (t - 0.5) * 2 * 60
  const normalizedHue = ((hue % 360) + 360) % 360

  return { hue: normalizedHue, intensity: t }
}

function formatRate(rate: number): string {
  if (rate === 0) return '0%'
  if (rate < 0.1) return '<0.1%'
  if (rate < 10) return `${rate.toFixed(1)}%`
  return `${Math.round(rate)}%`
}

interface ErrorHeatmapProps {
  sessions: SessionRecord[]
}

export function ErrorHeatmap({ sessions }: ErrorHeatmapProps) {
  const [activeKey, setActiveKey] = useState<Letter | null>(null)

  const { data, sessionCount, maxErrorRate } = useMemo(
    () => computeHeatmapData(sessions),
    [sessions],
  )

  const rowOffsets = [0, 1, 3]

  if (!data) {
    return (
      <div className="ehm">
        <h3 className="info-section-title">Error Heatmap</h3>
        <div className="ehm__empty">
          {sessionCount === 0
            ? 'Complete a few sessions to see your error patterns.'
            : `${sessionCount} of 3 sessions needed. Keep typing.`}
        </div>
      </div>
    )
  }

  const activeStats: KeyErrorStats | null = activeKey ? data[activeKey] ?? null : null

  return (
    <div className="ehm">
      <div className="ehm__header">
        <h3 className="info-section-title">Error Heatmap</h3>
        <span className="ehm__session-count">last {sessionCount} sessions</span>
      </div>

      <div className="ehm__board" onMouseLeave={() => setActiveKey(null)}>
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <div
            className="ehm__row"
            key={row.join('')}
            style={{ paddingLeft: `${rowOffsets[rowIndex] * 1.8}rem` }}
          >
            {row.map((letter) => {
              const stats = data[letter]
              const errorRate = stats?.errorRate ?? 0
              const hasData = stats && stats.totalAttempts > 0
              const isActive = activeKey === letter
              const { hue, intensity } = hasData
                ? getHeatValues(errorRate, maxErrorRate)
                : { hue: 160, intensity: 0 }

              const barColor = hasData && errorRate > 0
                ? `hsl(${hue}, 75%, 58%)`
                : hasData
                  ? 'var(--accent)'
                  : 'var(--t-dim)'

              const barOpacity = hasData
                ? errorRate > 0
                  ? 0.4 + intensity * 0.6
                  : 0.2
                : 0.08

              const bgTint = hasData && errorRate > 0
                ? `hsla(${hue}, 70%, 50%, ${0.04 + intensity * 0.08})`
                : undefined

              return (
                <div
                  className={[
                    'ehm__key',
                    isActive && 'ehm__key--active',
                    !hasData && 'ehm__key--no-data',
                  ].filter(Boolean).join(' ')}
                  key={letter}
                  onMouseEnter={() => setActiveKey(letter)}
                  style={{ background: bgTint }}
                >
                  <span className="ehm__letter">{letter.toUpperCase()}</span>
                  <span
                    className="ehm__bar"
                    style={{ background: barColor, opacity: barOpacity }}
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="ehm__detail-container">
        {activeStats && activeStats.totalAttempts > 0 ? (
          <div className="ehm__detail" key={activeStats.letter}>
            <div className="ehm__detail-header">
              <span className="ehm__detail-letter">{activeStats.letter.toUpperCase()}</span>
              <span className="ehm__detail-rate">
                {formatRate(activeStats.errorRate)}
              </span>
              <span className="ehm__detail-summary">
                {activeStats.errors === 0
                  ? `${activeStats.totalAttempts} hits, no errors`
                  : `${activeStats.errors}/${activeStats.totalAttempts} mistyped`}
              </span>
            </div>
            {activeStats.confusions.length > 0 ? (
              <div className="ehm__confusions">
                <span className="ehm__confusions-label">confused with</span>
                {activeStats.confusions.map(({ actual, count }) => (
                  <div className="ehm__confusion-row" key={actual}>
                    <span className="ehm__confusion-key">
                      {actual === ' ' ? 'SPC' : actual.toUpperCase()}
                    </span>
                    <div className="ehm__confusion-bar-track">
                      <div
                        className="ehm__confusion-bar"
                        style={{
                          width: `${Math.max(Math.min((count / activeStats.confusions[0].count) * 100, 100), 6)}%`,
                        }}
                      />
                    </div>
                    <span className="ehm__confusion-count">
                      {count}x
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="ehm__detail ehm__detail--placeholder">
            hover a key to inspect
          </div>
        )}
      </div>

      <div className="ehm__legend">
        <span className="ehm__legend-label">accurate</span>
        <div className="ehm__legend-gradient" />
        <span className="ehm__legend-label">error-prone</span>
      </div>
    </div>
  )
}
