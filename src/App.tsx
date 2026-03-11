import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useShallow } from 'zustand/shallow'
import './App.css'
import { KeyboardMap } from './components/KeyboardMap'
import {
  formatFreeCorpusTier,
  FREE_CORPUS_TIERS,
  UNLOCK_TARGET_LIMITS,
} from './lib/constants'
import {
  ALPHABET,
  type FreeCorpusTier,
  type UnlockMetric,
  type GeneratedLesson,
  type Letter,
  type SessionRecord,
} from './lib/types'
import {
  getUnlockStatus,
} from './lib/progression'
import { getAccuracy, getWpm } from './lib/session-metrics'
import { indexedDbStorage } from './lib/storage'
import { setTypingStoreSaving, useTypingStore } from './lib/store'

function truncate(value: number, fractionDigits: number) {
  const factor = 10 ** fractionDigits
  return Math.trunc(value * factor) / factor
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value)
}

function formatPercent(value: number) {
  return `${formatNumber(truncate(value, 2), 2)}%`
}

function formatWpm(value: number) {
  return `${Math.round(value)}`
}

function getSessionDetail(session: SessionRecord) {
  if (session.mode === 'free') {
    return session.freeTier ? formatFreeCorpusTier(session.freeTier) : '—'
  }

  return session.targetLetter?.toUpperCase() ?? session.focusLetter?.toUpperCase() ?? '—'
}

function getUnlockTargetError(metric: UnlockMetric, rawValue: string) {
  const { min, max, step } = UNLOCK_TARGET_LIMITS[metric]
  const trimmed = rawValue.trim()

  if (trimmed.length === 0) {
    return 'Enter a value.'
  }

  if (!/^\d+$/.test(trimmed)) {
    return 'Use whole numbers only.'
  }

  const value = Number(trimmed)

  if (!Number.isInteger(value)) {
    return 'Use whole numbers only.'
  }

  if (value < min || value > max) {
    return metric === 'accuracy' ? `Use ${min}-${max}%.` : `Use ${min}-${max}.`
  }

  if ((value - min) % step !== 0) {
    return step === 1 ? null : `Use steps of ${step}.`
  }

  return null
}

function getUnlockTargetHelper(metric: UnlockMetric) {
  const { min, max, step } = UNLOCK_TARGET_LIMITS[metric]
  const range = metric === 'accuracy' ? `${min}-${max}%` : `${min}-${max}`
  const stepText = step === 1 ? 'whole numbers' : `steps of ${step}`
  return `${range}, ${stepText}. Enter to save, Esc to cancel.`
}

function renderPracticeWords(
  lesson: Pick<GeneratedLesson, 'id' | 'text'>,
  currentIndex?: number,
  errorIndices?: Set<number>,
) {
  const elements: ReactNode[] = []
  const text = lesson.text
  let i = 0

  while (i < text.length) {
    const wordStart = i
    const wordChars: ReactNode[] = []

    while (i < text.length && text[i] !== ' ') {
      const cls = ['practice-text__char']
      if (typeof currentIndex === 'number' && i < currentIndex) cls.push('practice-text__char--done')
      if (typeof currentIndex === 'number' && i === currentIndex) cls.push('practice-text__char--current')
      if (errorIndices?.has(i)) cls.push('practice-text__char--error')
      wordChars.push(
        <span className={cls.join(' ')} key={`${lesson.id}-${i}`}>{text[i]}</span>,
      )
      i += 1
    }

    if (i < text.length && text[i] === ' ') {
      const cls = ['practice-text__char', 'practice-text__char--space']
      if (typeof currentIndex === 'number' && i < currentIndex) cls.push('practice-text__char--done')
      if (typeof currentIndex === 'number' && i === currentIndex) cls.push('practice-text__char--current')
      if (errorIndices?.has(i)) cls.push('practice-text__char--error')
      wordChars.push(
        <span className={cls.join(' ')} key={`${lesson.id}-${i}`}> </span>,
      )
      i += 1
    }

    elements.push(
      <span className="practice-text__word" key={`${lesson.id}-w${wordStart}`}>
        {wordChars}
      </span>,
    )
  }

  return elements
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => void) => {
    finished: Promise<void>
  }
}

export default function App() {
  const {
    progress,
    lesson,
    currentIndex,
    attempts,
    metricAttempts,
    lessonStartedAt,
    clock,
    isLoaded,
    hydrate,
    setMode,
    setFocusLetter,
    setFreeTier,
    setUnlockTarget,
    queueFreshLesson,
    resetCurrentLetter,
    handleTypedKey,
    handleBackspace,
    resetProgress,
    tickClock,
    setHasFocus,
    hasFocus,
  } = useTypingStore(
    useShallow((state) => ({
      progress: state.progress,
      lesson: state.lesson,
      currentIndex: state.currentIndex,
      attempts: state.attempts,
      metricAttempts: state.metricAttempts,
      lessonStartedAt: state.lessonStartedAt,
      clock: state.clock,
      isLoaded: state.isLoaded,
      hydrate: state.hydrate,
      setMode: state.setMode,
      setFocusLetter: state.setFocusLetter,
      setFreeTier: state.setFreeTier,
      setUnlockTarget: state.setUnlockTarget,
      queueFreshLesson: state.queueFreshLesson,
      resetCurrentLetter: state.resetCurrentLetter,
      handleTypedKey: state.handleTypedKey,
      handleBackspace: state.handleBackspace,
      resetProgress: state.resetProgress,
      tickClock: state.tickClock,
      setHasFocus: state.setHasFocus,
      hasFocus: state.hasFocus,
    })),
  )
  const [isPending, startTransition] = useTransition()
  const practiceRef = useRef<HTMLDivElement | null>(null)
  const unlockInputRef = useRef<HTMLInputElement | null>(null)
  const [editingMetric, setEditingMetric] = useState<UnlockMetric | null>(null)
  const [unlockDraft, setUnlockDraft] = useState('')
  const [unlockTargetError, setUnlockTargetError] = useState<string | null>(null)

  const unlockStatus = getUnlockStatus(progress)
  const elapsedMs = lessonStartedAt === null ? 0 : Math.max(1, clock - lessonStartedAt)
  const liveWpm = getWpm(currentIndex, elapsedMs)
  const liveAccuracy = getAccuracy(currentIndex, metricAttempts.length)

  const errorIndices = useMemo(() => {
    const indices = new Set<number>()
    for (let i = 0; i < attempts.length; i++) {
      if (!attempts[i].correct) {
        indices.add(attempts[i].index)
      }
    }
    return indices
  }, [attempts])

  const recentSessions = progress.sessions.slice(0, 5)
  const isAdaptiveMode = progress.settings.mode === 'adaptive'
  const isFocusMode = progress.settings.mode === 'focus'
  const isFreeMode = progress.settings.mode === 'free'
  const unlockTargets = progress.settings.unlockTargets
  const freeTierLabel = formatFreeCorpusTier(progress.settings.freeTier)
  const practicePrompt = 'Click here to start typing'

  const currentLetter = isFreeMode ? null : lesson.targetLetters[0] ?? (isFocusMode ? progress.settings.focusLetter : unlockStatus.bottleneckLetter)
  const unlockMetricCards: Array<{
    metric: UnlockMetric
    label: string
    letter: Letter | null
    currentValue: string
    targetValue: string
    statusClassName: string
  }> = [
    {
      metric: 'hits',
      label: 'hits',
      letter: unlockStatus.sampleLetter,
      currentValue: formatNumber(unlockStatus.sampleHits),
      targetValue: formatNumber(unlockTargets.hits),
      statusClassName: unlockStatus.sampleProgress >= 1 ? 'metric--met' : 'metric--unmet',
    },
    {
      metric: 'accuracy',
      label: 'acc',
      letter: unlockStatus.accuracyLetter,
      currentValue: formatPercent(unlockStatus.accuracyValue),
      targetValue: `${unlockTargets.accuracy}%`,
      statusClassName: unlockStatus.accuracyProgress >= 1 ? 'metric--met' : 'metric--unmet',
    },
    {
      metric: 'wpm',
      label: 'wpm',
      letter: unlockStatus.speedLetter,
      currentValue: formatNumber(truncate(unlockStatus.speedWpm, 2), 2),
      targetValue: formatNumber(unlockTargets.wpm),
      statusClassName: unlockStatus.speedProgress >= 1 ? 'metric--met' : 'metric--unmet',
    },
  ]
  useEffect(() => { void hydrate() }, [hydrate])

  useEffect(() => {
    if (!isLoaded) return
    let active = true
    setTypingStoreSaving(true)
    void indexedDbStorage.save(progress).finally(() => {
      if (active) setTypingStoreSaving(false)
    })
    return () => { active = false }
  }, [progress, isLoaded])

  useEffect(() => {
    const interval = window.setInterval(() => tickClock(), 1000)
    return () => window.clearInterval(interval)
  }, [tickClock])

  useEffect(() => {
    if (isLoaded && !editingMetric) {
      practiceRef.current?.focus()
    }
  }, [lesson.id, isLoaded, editingMetric])

  useEffect(() => {
    if (!editingMetric) {
      return
    }

    unlockInputRef.current?.focus()
    unlockInputRef.current?.select()
  }, [editingMetric])

  async function handleResetProgress() {
    const confirmed = window.confirm('Reset all local typing progress?')
    if (!confirmed) return
    await resetProgress()
  }

  function handleResetCurrentLetter() {
    const label = currentLetter ? currentLetter.toUpperCase() : 'current letter'
    const confirmed = window.confirm(`Reset progress for ${label}?`)
    if (!confirmed) return
    runUiTransition(() => resetCurrentLetter())
  }

  function runUiTransition(update: () => void) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const documentWithTransition = document as DocumentWithViewTransition

    if (!documentWithTransition.startViewTransition || reducedMotion) {
      startTransition(() => update())
      return
    }

    documentWithTransition.startViewTransition(() => {
      flushSync(() => {
        update()
      })
    })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!isLoaded || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'Tab') return
    if (event.key === 'Backspace') {
      event.preventDefault()
      handleBackspace()
      return
    }
    const key = event.key === ' ' ? ' ' : event.key.toLowerCase()
    if (key.length !== 1 || !/[a-z ]/.test(key)) return
    event.preventDefault()
    handleTypedKey(key)
  }

  function beginUnlockTargetEdit(metric: UnlockMetric) {
    setEditingMetric(metric)
    setUnlockDraft(String(unlockTargets[metric]))
    setUnlockTargetError(null)
  }

  function cancelUnlockTargetEdit() {
    setEditingMetric(null)
    setUnlockDraft('')
    setUnlockTargetError(null)
  }

  function commitUnlockTarget(metric: UnlockMetric) {
    const validationError = getUnlockTargetError(metric, unlockDraft)

    if (validationError) {
      setUnlockTargetError(validationError)
      return false
    }

    setUnlockTarget(metric, Number(unlockDraft))
    cancelUnlockTargetEdit()
    return true
  }

  if (!isLoaded) {
    return (
      <main className="loading-shell">
        <div className="loading-panel">loading progress…</div>
      </main>
    )
  }

  return (
    <>
      <div className="mobile-overlay">only available on desktop</div>
      <div className="app-shell">
        <main className="workspace">
          <div className="typing-container">
            <div className="control-stack">
              <div className="control-row control-row--modes">
                <button
                  aria-pressed={progress.settings.mode === 'adaptive'}
                  className={progress.settings.mode === 'adaptive' ? 'btn btn--minimal btn--active' : 'btn btn--minimal'}
                  onClick={() => runUiTransition(() => setMode('adaptive'))}
                  type="button"
                >
                  adaptive
                </button>
                <button
                  aria-pressed={progress.settings.mode === 'focus'}
                  className={progress.settings.mode === 'focus' ? 'btn btn--minimal btn--active' : 'btn btn--minimal'}
                  onClick={() => runUiTransition(() => setMode('focus'))}
                  type="button"
                >
                  focus
                </button>
                <button
                  aria-pressed={progress.settings.mode === 'free'}
                  className={progress.settings.mode === 'free' ? 'btn btn--minimal btn--active' : 'btn btn--minimal'}
                  onClick={() => runUiTransition(() => setMode('free'))}
                  type="button"
                >
                  free
                </button>
                {progress.settings.mode === 'focus' ? (
                  <label className="target-select" htmlFor="focus-letter">
                    <span>key</span>
                    <select
                      id="focus-letter"
                      value={progress.settings.focusLetter}
                      onChange={(e) => {
                        const nextLetter = e.target.value as Letter
                        runUiTransition(() => setFocusLetter(nextLetter))
                      }}
                    >
                      {ALPHABET.map((letter) => (
                        <option key={letter} value={letter}>{letter.toUpperCase()}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {progress.settings.mode === 'free' ? (
                  <label className="target-select" htmlFor="free-tier">
                    <span>english</span>
                    <select
                      id="free-tier"
                      value={progress.settings.freeTier}
                      onChange={(e) => {
                        const nextTier = Number(e.target.value) as FreeCorpusTier
                        runUiTransition(() => setFreeTier(nextTier))
                      }}
                    >
                      {FREE_CORPUS_TIERS.map((tier) => (
                        <option key={tier} value={tier}>{formatFreeCorpusTier(tier)}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <div className="control-row control-row--actions">
                <button className="btn btn--minimal" onClick={() => runUiTransition(() => queueFreshLesson())} type="button">
                  new lesson
                </button>
                {!isFreeMode ? (
                  <button className="btn btn--minimal" onClick={handleResetCurrentLetter} type="button">
                    reset letter
                  </button>
                ) : null}
                <button className="btn btn--minimal btn--danger" onClick={() => void handleResetProgress()} type="button">
                  reset all
                </button>
              </div>
            </div>

            <div className="live-metrics">
              <div className="metric-item">
                <span>wpm</span>
                <strong>{formatWpm(liveWpm)}</strong>
              </div>
              <div className="metric-item">
                <span>acc</span>
                <strong>{formatPercent(liveAccuracy)}</strong>
              </div>
              <div className="metric-item">
                <span>key</span>
                <strong>{isFreeMode ? 'A-Z' : currentLetter?.toUpperCase() ?? '—'}</strong>
              </div>
            </div>

            <div
              aria-label="Typing practice surface"
              className={hasFocus ? 'practice-surface practice-surface--focused' : 'practice-surface practice-surface--idle'}
              onBlur={() => setHasFocus(false)}
              onFocus={() => setHasFocus(true)}
              onKeyDown={handleKeyDown}
              onMouseDown={() => practiceRef.current?.focus()}
              ref={practiceRef}
              role="textbox"
              tabIndex={0}
            >
              <div className={hasFocus ? 'practice-text-stage practice-text-stage--focused' : 'practice-text-stage practice-text-stage--idle'}>
                <div className={hasFocus ? 'practice-text-layer' : 'practice-text-layer practice-text-layer--blurred'}>
                  {isPending ? (
                    <span style={{ color: 'var(--t-muted)' }}>Preparing lesson…</span>
                  ) : (
                    <div className="practice-text">
                      {renderPracticeWords(lesson, currentIndex, errorIndices)}
                    </div>
                  )}
                </div>
                {!hasFocus ? (
                  <div aria-hidden="true" className="practice-focus-hint">
                    <strong>{practicePrompt}</strong>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="unlock-progress-container">
              {isFreeMode ? (
                <>
                  <h3 className="unlock-progress-strip__title">
                    <span className="unlock-progress-strip__title-text">free practice</span>
                  </h3>
                  <div className="free-mode-panel">
                    <div className="metric-item">
                      <span>english</span>
                      <strong>{freeTierLabel}</strong>
                    </div>
                    <p className="free-mode-panel__copy">Free mode uses all letters and does not change unlock progress.</p>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="unlock-progress-strip__title">
                    <span className={isFocusMode ? 'unlock-progress-strip__title-text unlock-progress-strip__title-text--hidden' : 'unlock-progress-strip__title-text'}>
                      unlock progress
                    </span>
                    <span className={isFocusMode ? 'unlock-progress-strip__title-text' : 'unlock-progress-strip__title-text unlock-progress-strip__title-text--hidden'}>
                      mastery progress
                    </span>
                  </h3>
                  <div className="unlock-progress-strip">
                    <div className="unlock-progress-strip__core">
                      {unlockMetricCards.map(({ metric, label, letter, currentValue, targetValue, statusClassName }) => (
                        editingMetric === metric ? (
                          <div className="metric-item unlock-target-chip unlock-target-chip--editing" key={metric}>
                            <span>{letter ? `${label} ${letter.toUpperCase()}` : label}</span>
                            <div className="unlock-target-editor">
                              <strong className={statusClassName}>
                                {currentValue}/
                              </strong>
                              <input
                                aria-label={`Set ${label} unlock target`}
                                className={`unlock-target-editor__input ${unlockTargetError ? 'unlock-target-editor__input--error' : ''}`}
                                inputMode="numeric"
                                max={UNLOCK_TARGET_LIMITS[metric].max}
                                min={UNLOCK_TARGET_LIMITS[metric].min}
                                onBlur={() => { void commitUnlockTarget(metric) }}
                                onChange={(event) => {
                                  setUnlockDraft(event.target.value)
                                  if (unlockTargetError) {
                                    setUnlockTargetError(null)
                                  }
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault()
                                    commitUnlockTarget(metric)
                                  }
                                  if (event.key === 'Escape') {
                                    event.preventDefault()
                                    cancelUnlockTargetEdit()
                                  }
                                }}
                                ref={unlockInputRef}
                                step={UNLOCK_TARGET_LIMITS[metric].step}
                                type="number"
                                value={unlockDraft}
                              />
                              {metric === 'accuracy' ? <span className="unlock-target-editor__suffix">%</span> : null}
                            </div>
                          </div>
                        ) : (
                          <button
                            aria-label={`Edit ${label}${letter ? ` for ${letter.toUpperCase()}` : ''} unlock target`}
                            className="metric-item unlock-target-chip"
                            key={metric}
                            onClick={() => beginUnlockTargetEdit(metric)}
                            type="button"
                          >
                            <span>{letter ? `${label} ${letter.toUpperCase()}` : label}</span>
                            <strong className={statusClassName}>
                              {currentValue}/{targetValue}
                            </strong>
                          </button>
                        )
                      ))}
                    </div>
                    {!isFocusMode && unlockStatus.nextLetter ? (
                      <div className="metric-item metric-item--next-letter">
                        <span>next letter</span>
                        <strong>{unlockStatus.nextLetter.toUpperCase()}</strong>
                      </div>
                    ) : null}
                  </div>
                  {editingMetric ? (
                    <div
                      aria-live="polite"
                      className={unlockTargetError ? 'unlock-progress-strip__hint unlock-progress-strip__hint--error' : 'unlock-progress-strip__hint'}
                    >
                      {unlockTargetError ?? getUnlockTargetHelper(editingMetric)}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <section className="secondary-info">
            {isAdaptiveMode ? null : (
              <div className="session-history">
                <div className="session-history__header">
                  <h3 className="info-section-title">Session History</h3>
                  <button className="btn btn--minimal" onClick={resetProgress}>
                    Reset All
                  </button>
                </div>
                <div className="session-history__list">
                  {progress.sessions.length === 0 ? (
                    <div className="empty-state">No sessions recorded yet.</div>
                  ) : (
                    recentSessions.map((session) => (
                      <div className="session-row" key={session.id}>
                        <span className="session-row__cell session-row__mode">{session.mode}</span>
                        <span className="session-row__cell session-row__detail">{getSessionDetail(session)}</span>
                        <span className="session-row__cell session-row__stat">{formatWpm(session.wpm)} wpm</span>
                        <span className="session-row__cell session-row__stat">{formatPercent(session.accuracy)}</span>
                        <span className="session-row__cell session-row__time">
                          {new Date(session.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {isAdaptiveMode ? <KeyboardMap /> : null}
          </section>
        </main>

        <footer className="footer">
          <a href="https://github.com/SomeoneWithOptions/typing" target="_blank" rel="noopener noreferrer">github</a>
          <span className="footer__separator">·</span>
          made by <a href="https://www.sanetomore.com" target="_blank" rel="noopener noreferrer">@sanetomore</a>
        </footer>
      </div>
    </>
  )
}
