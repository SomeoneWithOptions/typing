import { useMemo, useState } from 'react'
import { KEYBOARD_ROWS } from '../lib/constants'
import { computeHeatmapData, type KeyErrorStats } from '../lib/heatmap'
import type { Letter, SessionRecord } from '../lib/types'

/**
 * Maps an error rate to a hue value for the key border.
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

type ConfirmState =
  | { type: 'all' }
  | { type: 'key'; letter: Letter }

interface ErrorHeatmapProps {
  sessions: SessionRecord[]
  onResetKey?: (letter: Letter) => void
  onResetAll?: () => void
}

export function ErrorHeatmap({ sessions, onResetKey, onResetAll }: ErrorHeatmapProps) {
  const [activeKey, setActiveKey] = useState<Letter | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const { data, sessionCount, maxErrorRate } = useMemo(
    () => computeHeatmapData(sessions),
    [sessions],
  )

  // Real QWERTY stagger: A-row ~½ key, Z-row ~1 key
  const rowPadding = ['0rem', '2.35rem', '5rem']

  const handleKeyClick = (letter: Letter) => {
    const stats = data?.[letter]
    if (!stats || stats.totalAttempts === 0) return
    setConfirm({ type: 'key', letter })
  }

  const handleConfirmYes = () => {
    if (!confirm) return
    if (confirm.type === 'all') {
      onResetAll?.()
    } else {
      onResetKey?.(confirm.letter)
    }
    setConfirm(null)
    setActiveKey(null)
  }

  const handleConfirmNo = () => {
    setConfirm(null)
  }

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

  const confirmLabel = confirm
    ? confirm.type === 'all'
      ? 'Reset all key data?'
      : `Reset key ${confirm.letter.toUpperCase()}?`
    : null

  return (
    <div className="ehm">
      <div className="ehm__header">
        <h3 className="info-section-title">Error Heatmap</h3>
        <div className="ehm__header-meta">
          <span className="ehm__session-count">last {sessionCount} sessions</span>
          {onResetAll && (
            <button
              className="ehm__reset-btn"
              onClick={() => setConfirm({ type: 'all' })}
              title="Reset all heatmap data"
            >
              reset
            </button>
          )}
        </div>
      </div>

      <div className="ehm__board" onMouseLeave={() => { if (!confirm) setActiveKey(null) }}>
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <div
            className="ehm__row"
            key={row.join('')}
            style={{ paddingLeft: rowPadding[rowIndex] }}
          >
            {row.map((letter) => {
              const stats = data[letter]
              const errorRate = stats?.errorRate ?? 0
              const hasData = stats && stats.totalAttempts > 0
              const isActive = activeKey === letter
              const isConfirmTarget = confirm?.type === 'key' && confirm.letter === letter
              const { hue, intensity } = hasData
                ? getHeatValues(errorRate, maxErrorRate)
                : { hue: 160, intensity: 0 }

              const borderColor = hasData
                ? errorRate > 0
                  ? `hsla(${hue}, 50%, 52%, ${0.18 + intensity * 0.42})`
                  : 'hsla(160, 45%, 48%, 0.12)'
                : undefined

              return (
                <div
                  className={[
                    'ehm__key',
                    isActive && 'ehm__key--active',
                    !hasData && 'ehm__key--no-data',
                    hasData && onResetKey && 'ehm__key--clickable',
                    isConfirmTarget && 'ehm__key--confirm-target',
                  ].filter(Boolean).join(' ')}
                  key={letter}
                  onMouseEnter={() => { if (!confirm) setActiveKey(letter) }}
                  onClick={() => handleKeyClick(letter)}
                  style={borderColor ? { borderColor } : undefined}
                >
                  <span className="ehm__letter">{letter.toUpperCase()}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="ehm__detail-container">
        {confirm ? (
          <div className="ehm__confirm" role="dialog" aria-label="Confirm reset">
            <span className="ehm__confirm-text">{confirmLabel}</span>
            <div className="ehm__confirm-actions">
              <button className="ehm__confirm-btn ehm__confirm-btn--yes" onClick={handleConfirmYes}>
                Yes
              </button>
              <button className="ehm__confirm-btn ehm__confirm-btn--no" onClick={handleConfirmNo}>
                No
              </button>
            </div>
          </div>
        ) : activeStats && activeStats.totalAttempts > 0 ? (
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
            hover a key to inspect · click to reset
          </div>
        )}
      </div>

      <div className="ehm__legend">
        <div className="ehm__legend-item">
          <span className="ehm__legend-dot ehm__legend-dot--accurate" />
          <span className="ehm__legend-label">accurate</span>
        </div>
        <div className="ehm__legend-item">
          <span className="ehm__legend-dot ehm__legend-dot--moderate" />
          <span className="ehm__legend-label">moderate</span>
        </div>
        <div className="ehm__legend-item">
          <span className="ehm__legend-dot ehm__legend-dot--error" />
          <span className="ehm__legend-label">error-prone</span>
        </div>
      </div>
    </div>
  )
}
