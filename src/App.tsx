import { useEffect, useRef, useTransition, type KeyboardEvent, type ReactNode } from 'react'
import { useShallow } from 'zustand/shallow'
import './App.css'
import { KeyboardMap } from './components/KeyboardMap'
import { ProgressMeter } from './components/ProgressMeter'
import {
  ALPHABET,
  type Letter,
  type SessionKeyAttempt,
} from './lib/types'
import {
  MASTERY_ACCURACY_TARGET,
  MASTERY_WPM_TARGET,
  UNLOCK_ACCURACY_TARGET,
  UNLOCK_SAMPLE_TARGET,
  UNLOCK_WPM_TARGET,
} from './lib/constants'
import {
  getLetterAccuracy,
  getLetterWpm,
  getUnlockStatus,
  getWeakLetters,
} from './lib/progression'
import { indexedDbStorage } from './lib/storage'
import { setTypingStoreSaving, useTypingStore } from './lib/store'

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function formatWpm(value: number) {
  return `${Math.round(value)} wpm`
}

function getLiveAccuracy(attempts: SessionKeyAttempt[]) {
  if (attempts.length === 0) return 100
  const correct = attempts.filter((a) => a.correct).length
  return (correct / attempts.length) * 100
}

function getLiveWpm(attempts: SessionKeyAttempt[], elapsedMs: number) {
  if (attempts.length === 0 || elapsedMs <= 0) return 0
  const correct = attempts.filter((a) => a.correct).length
  return (correct / 5) * (60000 / elapsedMs)
}

export default function App() {
  const {
    progress,
    lesson,
    currentIndex,
    attempts,
    lessonStartedAt,
    clock,
    statusMessage,
    isLoaded,
    isSaving,
    hasFocus,
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
      lessonStartedAt: state.lessonStartedAt,
      clock: state.clock,
      statusMessage: state.statusMessage,
      isLoaded: state.isLoaded,
      isSaving: state.isSaving,
      hasFocus: state.hasFocus,
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

  const weakLetters = getWeakLetters(progress, 3)
  const unlockStatus = getUnlockStatus(progress)
  const elapsedMs = Math.max(1, clock - lessonStartedAt)
  const liveWpm = getLiveWpm(attempts, elapsedMs)
  const liveAccuracy = getLiveAccuracy(attempts)
  const lastAttempt = attempts[attempts.length - 1] ?? null
  const errorIndex = lastAttempt && !lastAttempt.correct ? lastAttempt.index : null
  const recentSessions = progress.sessions.slice(0, 3)

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
    const confirmed = window.confirm('Reset all local typing progress and return to the starter letters?')
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
        <div className="loading-panel">Loading local progress…</div>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">typing</span>
        <div className="topbar-sep" />
        <div className="topbar-mid">
          <div className="mode-switch" role="tablist" aria-label="Practice mode">
            <button
              className={progress.settings.mode === 'adaptive' ? 'btn btn--active' : 'btn'}
              onClick={() => startTransition(() => setMode('adaptive'))}
              type="button"
            >
              Adaptive
            </button>
            <button
              className={progress.settings.mode === 'focus' ? 'btn btn--active' : 'btn'}
              onClick={() => startTransition(() => setMode('focus'))}
              type="button"
            >
              Focus
            </button>
          </div>
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
          <button className="btn btn--ghost" onClick={() => startTransition(() => queueFreshLesson())} type="button">
            New lesson
          </button>
        </div>
        <div className="topbar-end">
          <span className="letter-count">{progress.unlockedLetters.length}/26 letters</span>
          <button className="btn btn--danger" onClick={() => void handleResetProgress()} type="button">
            Reset
          </button>
        </div>
      </header>

      <main className="workspace">
        {/* ── Left: Practice ── */}
        <section className="practice-col">
          <div
            className={hasFocus ? 'practice-panel practice-panel--focused' : 'practice-panel'}
            onClick={() => practiceRef.current?.focus()}
          >
            <div className="practice-header">
              <span>{statusMessage}</span>
              <span className="focus-badge">{hasFocus ? 'typing' : 'click to focus'}</span>
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
              {(() => {
                const elements: ReactNode[] = []
                const text = lesson.text
                let i = 0

                while (i < text.length) {
                  if (text[i] === ' ') {
                    const cls = ['practice-text__char', 'practice-text__char--space']
                    if (i < currentIndex) cls.push('practice-text__char--done')
                    if (i === currentIndex) cls.push('practice-text__char--current')
                    if (errorIndex === i) cls.push('practice-text__char--error')
                    elements.push(<span className={cls.join(' ')} key={`${lesson.id}-${i}`}>{' '}</span>)
                    i += 1
                    continue
                  }

                  const wordStart = i
                  const wordChars: ReactNode[] = []

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

                  elements.push(
                    <span className="practice-text__word" key={`${lesson.id}-w${wordStart}`}>{wordChars}</span>
                  )
                }

                return elements
              })()}
            </div>
            <div className="practice-footer">
              {isPending ? 'Preparing next lesson…' : isSaving ? 'Saving…' : ''}
            </div>
          </div>

          {/* Live stats */}
          <div className="metrics-row">
            <div className="metric">
              <span className="metric-label">speed</span>
              <strong className="metric-value">{formatWpm(liveWpm)}</strong>
            </div>
            <div className="metric">
              <span className="metric-label">accuracy</span>
              <strong className="metric-value">{formatPercent(liveAccuracy)}</strong>
            </div>
            <div className="metric">
              <span className="metric-label">next unlock</span>
              <strong className="metric-value">{unlockStatus.nextLetter ? unlockStatus.nextLetter.toUpperCase() : '—'}</strong>
            </div>
            <div className="metric">
              <span className="metric-label">mastery target</span>
              <strong className="metric-value">{MASTERY_WPM_TARGET}w · {MASTERY_ACCURACY_TARGET}%</strong>
            </div>
          </div>

          {/* Unlock progress */}
          <div className="unlock-section">
            <div className="section-label">unlock progress</div>
            <div className="unlock-bars">
              <ProgressMeter label="Samples" text={`${UNLOCK_SAMPLE_TARGET} hits`} value={unlockStatus.sampleProgress} />
              <ProgressMeter label="Accuracy" text={`${UNLOCK_ACCURACY_TARGET}% req.`} value={unlockStatus.accuracyProgress} />
              <ProgressMeter label="Speed" text={`${UNLOCK_WPM_TARGET} wpm req.`} value={unlockStatus.speedProgress} />
            </div>
          </div>

          {/* Recent sessions */}
          <div className="sessions-section">
            <div className="sessions-header">
              <span>recent sessions</span>
              <span>{progress.sessions.length} stored</span>
            </div>
            {recentSessions.length === 0 ? (
              <div className="session-row--empty">Complete a lesson to see history.</div>
            ) : (
              recentSessions.map((session) => (
                <div className="session-row" key={session.id}>
                  <span>{session.mode === 'focus' && session.focusLetter ? `Focus ${session.focusLetter.toUpperCase()}` : 'Adaptive'}</span>
                  <span>{formatWpm(session.wpm)}</span>
                  <span>{formatPercent(session.accuracy)}</span>
                  <span>{new Date(session.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── Right: Sidebar ── */}
        <aside className="sidebar">
          <KeyboardMap />

          {weakLetters.length > 0 && (
            <div className="weak-section">
              <div className="weak-header">priority letters</div>
              <div className="weak-list">
                {weakLetters.map((letter) => (
                  <div className="weak-card" key={letter}>
                    <span className="weak-card-letter">{letter.toUpperCase()}</span>
                    <span className="weak-card-wpm">{formatWpm(getLetterWpm(progress.letterStats[letter]))}</span>
                    <span className="weak-card-acc">{formatPercent(getLetterAccuracy(progress.letterStats[letter]))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="kb-legend">
            <div className="kb-legend-item">
              <div className="kb-dot kb-dot--mastered" />
              <span>mastered</span>
            </div>
            <div className="kb-legend-item">
              <div className="kb-dot kb-dot--weak" />
              <span>needs work</span>
            </div>
            <div className="kb-legend-item">
              <div className="kb-dot kb-dot--locked" />
              <span>locked</span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
