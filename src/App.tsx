import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useShallow } from 'zustand/shallow'
import './App.css'
import { KeyboardMap } from './components/KeyboardMap'
import {
  ALPHABET,
  type UnlockMetric,
  type GeneratedLesson,
  type Letter,
} from './lib/types'
import { UNLOCK_TARGET_LIMITS } from './lib/constants'
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
  errorIndex?: number | null,
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
      if (errorIndex === i) cls.push('practice-text__char--error')
      wordChars.push(
        <span className={cls.join(' ')} key={`${lesson.id}-${i}`}>{text[i]}</span>,
      )
      i += 1
    }

    if (i < text.length && text[i] === ' ') {
      const cls = ['practice-text__char', 'practice-text__char--space']
      if (typeof currentIndex === 'number' && i < currentIndex) cls.push('practice-text__char--done')
      if (typeof currentIndex === 'number' && i === currentIndex) cls.push('practice-text__char--current')
      if (errorIndex === i) cls.push('practice-text__char--error')
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
    setUnlockTarget,
    queueFreshLesson,
    resetCurrentLetter,
    handleTypedKey,
    handleBackspace,
    resetProgress,
    tickClock,
    setHasFocus,
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
      setUnlockTarget: state.setUnlockTarget,
      queueFreshLesson: state.queueFreshLesson,
      resetCurrentLetter: state.resetCurrentLetter,
      handleTypedKey: state.handleTypedKey,
      handleBackspace: state.handleBackspace,
      resetProgress: state.resetProgress,
      tickClock: state.tickClock,
      setHasFocus: state.setHasFocus,
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
  const lastAttempt = attempts[attempts.length - 1] ?? null
  const errorIndex = lastAttempt && !lastAttempt.correct ? lastAttempt.index : null
  const recentSessions = progress.sessions.slice(0, 5)
  const isFocusMode = progress.settings.mode === 'focus'
  const unlockTargets = progress.settings.unlockTargets

  const currentLetter = lesson.targetLetters[0] ?? (isFocusMode ? progress.settings.focusLetter : unlockStatus.bottleneckLetter)
  const unlockMetricCards: Array<{
    metric: UnlockMetric
    label: string
    currentValue: string
    targetValue: string
    statusClassName: string
  }> = [
    {
      metric: 'hits',
      label: 'hits',
      currentValue: formatNumber(unlockStatus.sampleHits),
      targetValue: formatNumber(unlockTargets.hits),
      statusClassName: unlockStatus.sampleProgress >= 1 ? 'metric--met' : 'metric--unmet',
    },
    {
      metric: 'accuracy',
      label: 'acc',
      currentValue: formatPercent(unlockStatus.accuracyValue),
      targetValue: `${unlockTargets.accuracy}%`,
      statusClassName: unlockStatus.accuracyProgress >= 1 ? 'metric--met' : 'metric--unmet',
    },
    {
      metric: 'wpm',
      label: 'wpm',
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
    if (!isLoaded) return
    practiceRef.current?.focus()
  }, [isLoaded, lesson.id])

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
              </div>

              <div className="control-row control-row--actions">
                <button className="btn btn--minimal" onClick={() => runUiTransition(() => queueFreshLesson())} type="button">
                  new lesson
                </button>
                <button className="btn btn--minimal" onClick={handleResetCurrentLetter} type="button">
                  reset letter
                </button>
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
                <strong>{currentLetter?.toUpperCase() ?? '—'}</strong>
              </div>
            </div>

            <div
              aria-label="Typing practice surface"
              className="practice-surface"
              onBlur={() => setHasFocus(false)}
              onFocus={() => setHasFocus(true)}
              onKeyDown={handleKeyDown}
              ref={practiceRef}
              role="textbox"
              tabIndex={0}
            >
              {isPending ? (
                <span style={{ color: 'var(--t-muted)' }}>Preparing lesson…</span>
              ) : (
                <div className="practice-text-stage">
                  <div className="practice-text">
                    {renderPracticeWords(lesson, currentIndex, errorIndex)}
                  </div>
                </div>
              )}
            </div>
            <div className="unlock-progress-container">
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
                  {unlockMetricCards.map(({ metric, label, currentValue, targetValue, statusClassName }) => (
                    editingMetric === metric ? (
                      <div className="metric-item unlock-target-chip unlock-target-chip--editing" key={metric}>
                        <span>{label}</span>
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
                        aria-label={`Edit ${label} unlock target`}
                        className="metric-item unlock-target-chip"
                        key={metric}
                        onClick={() => beginUnlockTargetEdit(metric)}
                        type="button"
                      >
                        <span>{label}</span>
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
            </div>
          </div>

          <section className="secondary-info">
            <div className="sessions-group">
              <h3 className="info-section-title">Recent Sessions</h3>
              <div className="sessions-list">
                {recentSessions.length === 0 ? (
                  <div className="session-row--empty">Finish a lesson to see your history.</div>
                ) : (
                  recentSessions.map((session) => (
                    <div className="session-row" key={session.id}>
                      <span>{session.mode === 'focus' && session.focusLetter ? `focus ${session.focusLetter.toUpperCase()}` : 'adaptive'}</span>
                      <span>{formatWpm(session.wpm)} wpm</span>
                      <span>{formatPercent(session.accuracy)}</span>
                      <span>{new Date(session.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <aside className="keyboard-section">
              <h3 className="info-section-title">Keyboard Map</h3>
              <KeyboardMap />
              <div style={{ marginTop: '2rem' }}>
                <span className="letter-count" style={{ color: 'var(--t-muted)', fontSize: '0.8rem' }}>
                  {progress.unlockedLetters.length}/26 letters unlocked
                </span>
              </div>
            </aside>
          </section>
        </main>
      </div>
    </>
  )
}
