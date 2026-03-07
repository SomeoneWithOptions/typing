import { useEffect, useRef, useTransition, type KeyboardEvent, type ReactNode } from 'react'
import { useShallow } from 'zustand/shallow'
import './App.css'
import { KeyboardMap } from './components/KeyboardMap'
import { ProgressMeter } from './components/ProgressMeter'
import {
  ALPHABET,
  type Letter,
} from './lib/types'
import {
  MASTERY_ACCURACY_TARGET,
  MASTERY_WPM_TARGET,
  UNLOCK_ACCURACY_TARGET,
  UNLOCK_SAMPLE_TARGET,
  UNLOCK_WPM_TARGET,
} from './lib/constants'
import {
  getUnlockStatus,
} from './lib/progression'
import { getAccuracy, getWpm } from './lib/session-metrics'
import { indexedDbStorage } from './lib/storage'
import { setTypingStoreSaving, useTypingStore } from './lib/store'

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function formatWpm(value: number) {
  return `${Math.round(value)}`
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
    queueFreshLesson,
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
      queueFreshLesson: state.queueFreshLesson,
      handleTypedKey: state.handleTypedKey,
      handleBackspace: state.handleBackspace,
      resetProgress: state.resetProgress,
      tickClock: state.tickClock,
      setHasFocus: state.setHasFocus,
    })),
  )
  const [isPending, startTransition] = useTransition()
  const practiceRef = useRef<HTMLDivElement | null>(null)

  const unlockStatus = getUnlockStatus(progress)
  const elapsedMs = Math.max(1, clock - lessonStartedAt)
  const liveWpm = getWpm(currentIndex, elapsedMs)
  const liveAccuracy = getAccuracy(currentIndex, metricAttempts.length)
  const lastAttempt = attempts[attempts.length - 1] ?? null
  const errorIndex = lastAttempt && !lastAttempt.correct ? lastAttempt.index : null
  const recentSessions = progress.sessions.slice(0, 5)

  const currentLetter =
    progress.settings.mode === 'focus' ? progress.settings.focusLetter : unlockStatus.bottleneckLetter

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

  async function handleResetProgress() {
    const confirmed = window.confirm('Reset all local typing progress?')
    if (!confirmed) return
    await resetProgress()
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

  if (!isLoaded) {
    return (
      <main className="loading-shell">
        <div className="loading-panel">loading progress…</div>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-mid">
          <span className="brand">typing</span>
          <button
            className={progress.settings.mode === 'adaptive' ? 'btn btn--active' : 'btn'}
            onClick={() => startTransition(() => setMode('adaptive'))}
            type="button"
          >
            adaptive
          </button>
          <button
            className={progress.settings.mode === 'focus' ? 'btn btn--active' : 'btn'}
            onClick={() => startTransition(() => setMode('focus'))}
            type="button"
          >
            focus
          </button>
          <label className="target-select">
            <span>key</span>
            <select
              value={progress.settings.focusLetter}
              onChange={(e) => startTransition(() => setFocusLetter(e.target.value as Letter))}
            >
              {ALPHABET.map((letter) => (
                <option key={letter} value={letter}>{letter.toUpperCase()}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="topbar-end">
          <button className="btn" onClick={() => startTransition(() => queueFreshLesson())} type="button">
            new lesson
          </button>
          <button className="btn btn--danger" onClick={() => void handleResetProgress()} type="button">
            reset
          </button>
        </div>
      </header>

      <main className="workspace">
        <div className="typing-container">
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
            <div className="metric-item">
              <span>next</span>
              <strong>{unlockStatus.nextLetter?.toUpperCase() ?? '—'}</strong>
            </div>
            <div className="metric-item">
              <span>{unlockStatus.nextLetter ? 'unlock' : 'mastery'}</span>
              <strong>
                {unlockStatus.nextLetter
                  ? `${UNLOCK_WPM_TARGET}w · ${UNLOCK_ACCURACY_TARGET}%`
                  : `${MASTERY_WPM_TARGET}w · ${MASTERY_ACCURACY_TARGET}%`}
              </strong>
            </div>
          </div>

          <div
            aria-label="Typing practice surface"
            className="practice-text"
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
              (() => {
                const elements: ReactNode[] = []
                const text = lesson.text
                let i = 0

                while (i < text.length) {
                  const wordStart = i
                  const wordChars: ReactNode[] = []

                  // Collect word letters
                  while (i < text.length && text[i] !== ' ') {
                    const cls = ['practice-text__char']
                    if (i < currentIndex) cls.push('practice-text__char--done')
                    if (i === currentIndex) cls.push('practice-text__char--current')
                    if (errorIndex === i) cls.push('practice-text__char--error')
                    wordChars.push(
                      <span className={cls.join(' ')} key={`${lesson.id}-${i}`}>{text[i]}</span>
                    )
                    i += 1
                  }

                  // Collect following space (if any) and attach to the word
                  if (i < text.length && text[i] === ' ') {
                    const cls = ['practice-text__char', 'practice-text__char--space']
                    if (i < currentIndex) cls.push('practice-text__char--done')
                    if (i === currentIndex) cls.push('practice-text__char--current')
                    if (errorIndex === i) cls.push('practice-text__char--error')
                    wordChars.push(
                      <span className={cls.join(' ')} key={`${lesson.id}-${i}`}> </span>
                    )
                    i += 1
                  }

                  elements.push(
                    <span className="practice-text__word" key={`${lesson.id}-w${wordStart}`}>
                      {wordChars}
                    </span>
                  )
                }

                return elements
              })()
            )}
          </div>
        </div>

        <section className="secondary-info">
          <div className="progress-section">
            <div className="unlock-group">
              <h3 className="info-section-title">Unlock Progress</h3>
              <div className="unlock-bars">
                <ProgressMeter label="Hits" text={`${UNLOCK_SAMPLE_TARGET} hits`} value={unlockStatus.sampleProgress} />
                <ProgressMeter label="Accuracy" text={`${UNLOCK_ACCURACY_TARGET}%`} value={unlockStatus.accuracyProgress} />
                <ProgressMeter label="Speed" text={`${UNLOCK_WPM_TARGET} wpm`} value={unlockStatus.speedProgress} />
              </div>
            </div>

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
  )
}
