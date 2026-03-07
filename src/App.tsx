import { useEffect, useRef, useState, useTransition } from 'react'
import './App.css'
import { KeyboardMap } from './components/KeyboardMap'
import { LetterLedger } from './components/LetterLedger'
import { ProgressMeter } from './components/ProgressMeter'
import {
  ALPHABET,
  type GeneratedLesson,
  type Letter,
  type PracticeMode,
  type ProgressState,
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
  createInitialProgressState,
  getLetterAccuracy,
  getLetterWpm,
  getUnlockStatus,
  getWeakLetters,
  updateProgressFromSession,
} from './lib/progression'
import { generateLesson } from './lib/lesson-engine'
import { indexedDbStorage } from './lib/storage'

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function formatWpm(value: number) {
  return `${Math.round(value)} wpm`
}

function getLiveAccuracy(attempts: SessionKeyAttempt[]) {
  if (attempts.length === 0) {
    return 100
  }

  const correct = attempts.filter((attempt) => attempt.correct).length
  return (correct / attempts.length) * 100
}

function getLiveWpm(attempts: SessionKeyAttempt[], elapsedMs: number) {
  if (attempts.length === 0 || elapsedMs <= 0) {
    return 0
  }

  const correct = attempts.filter((attempt) => attempt.correct).length
  return (correct / 5) * (60000 / elapsedMs)
}

function createLesson(progress: ProgressState) {
  return generateLesson(
    progress,
    progress.settings.mode,
    progress.settings.mode === 'focus' ? progress.settings.focusLetter : null,
  )
}

export default function App() {
  const [progress, setProgress] = useState<ProgressState>(() => createInitialProgressState())
  const [lesson, setLesson] = useState<GeneratedLesson>(() => createLesson(createInitialProgressState()))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [attempts, setAttempts] = useState<SessionKeyAttempt[]>([])
  const [backspaces, setBackspaces] = useState(0)
  const [lessonStartedAt, setLessonStartedAt] = useState<number>(() => Date.now())
  const [lastInputAt, setLastInputAt] = useState<number | null>(null)
  const [clock, setClock] = useState<number>(() => Date.now())
  const [statusMessage, setStatusMessage] = useState('Press into the practice area and start typing.')
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [hasFocus, setHasFocus] = useState(false)
  const [isPending, startTransition] = useTransition()
  const practiceRef = useRef<HTMLDivElement | null>(null)

  const weakLetters = getWeakLetters(progress, 3)
  const unlockStatus = getUnlockStatus(progress)
  const elapsedMs = Math.max(1, clock - lessonStartedAt)
  const liveWpm = getLiveWpm(attempts, elapsedMs)
  const liveAccuracy = getLiveAccuracy(attempts)
  const lastAttempt = attempts[attempts.length - 1] ?? null
  const errorIndex = lastAttempt && !lastAttempt.correct ? lastAttempt.index : null

  useEffect(() => {
    let active = true

    void indexedDbStorage.load().then((storedProgress) => {
      if (!active) {
        return
      }

      const hydrated = storedProgress ?? createInitialProgressState()
      setProgress(hydrated)
      setLesson(createLesson(hydrated))
      setCurrentIndex(0)
      setAttempts([])
      setLessonStartedAt(Date.now())
      setLastInputAt(null)
      setIsLoaded(true)
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!isLoaded) {
      return
    }

    let active = true
    setIsSaving(true)

    void indexedDbStorage.save(progress).finally(() => {
      if (active) {
        setIsSaving(false)
      }
    })

    return () => {
      active = false
    }
  }, [progress, isLoaded])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClock(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!isLoaded) {
      return
    }

    practiceRef.current?.focus()
  }, [isLoaded, lesson.id])

  function resetActiveLesson(nextLesson: GeneratedLesson) {
    setLesson(nextLesson)
    setCurrentIndex(0)
    setAttempts([])
    setBackspaces(0)
    setLessonStartedAt(Date.now())
    setLastInputAt(null)
    setClock(Date.now())
  }

  function queueFreshLesson(nextProgress = progress) {
    startTransition(() => {
      resetActiveLesson(createLesson(nextProgress))
    })
  }

  function updateSettings(mode: PracticeMode, focusLetter = progress.settings.focusLetter) {
    const nextProgress: ProgressState = {
      ...progress,
      settings: {
        mode,
        focusLetter,
      },
    }

    setProgress(nextProgress)
    setStatusMessage(mode === 'focus' ? `Focus drill: ${focusLetter.toUpperCase()}` : 'Adaptive lesson ready.')
    queueFreshLesson(nextProgress)
  }

  function completeLesson(nextAttempts: SessionKeyAttempt[], finishedAt: number) {
    const endedAt = new Date(finishedAt).toISOString()
    const correctChars = nextAttempts.filter((attempt) => attempt.correct).length
    const sessionWpm = getLiveWpm(nextAttempts, Math.max(1, finishedAt - lessonStartedAt))
    const sessionAccuracy = getLiveAccuracy(nextAttempts)
    const nextProgress = updateProgressFromSession(progress, nextAttempts, {
      id: crypto.randomUUID(),
      mode: progress.settings.mode,
      focusLetter: progress.settings.mode === 'focus' ? progress.settings.focusLetter : null,
      startedAt: new Date(lessonStartedAt).toISOString(),
      endedAt,
      words: lesson.words,
      attempts: nextAttempts.length,
      correctChars,
      accuracy: sessionAccuracy,
      wpm: sessionWpm,
      backspaces,
      weakLetters,
    })
    const newUnlock = nextProgress.unlockedLetters.find((letter) => !progress.unlockedLetters.includes(letter))

    setProgress(nextProgress)
    setStatusMessage(newUnlock ? `${newUnlock.toUpperCase()} unlocked.` : 'Lesson complete. New set ready.')
    startTransition(() => {
      resetActiveLesson(createLesson(nextProgress))
    })
  }

  function handleBackspace() {
    if (attempts.length === 0) {
      setBackspaces((value) => value + 1)
      return
    }

    const nextAttempts = attempts.slice(0, -1)
    const removedAttempt = attempts[attempts.length - 1]

    setAttempts(nextAttempts)
    setBackspaces((value) => value + 1)
    setLastInputAt(nextAttempts[nextAttempts.length - 1]?.timestamp ?? null)

    if (removedAttempt.correct) {
      setCurrentIndex((value) => Math.max(0, value - 1))
      setStatusMessage('Last correct key removed.')
      return
    }

    setStatusMessage('Last attempt removed.')
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!isLoaded || event.metaKey || event.ctrlKey || event.altKey) {
      return
    }

    if (event.key === 'Tab') {
      return
    }

    if (event.key === 'Backspace') {
      event.preventDefault()
      handleBackspace()
      return
    }

    const key = event.key === ' ' ? ' ' : event.key.toLowerCase()

    if (key.length !== 1 || !/[a-z ]/.test(key)) {
      return
    }

    event.preventDefault()

    const expected = lesson.text[currentIndex]
    if (!expected) {
      return
    }

    const timestamp = Date.now()
    const deltaMs = Math.min(Math.max(timestamp - (lastInputAt ?? lessonStartedAt), 80), 2400)
    const attempt: SessionKeyAttempt = {
      expected,
      actual: key,
      correct: key === expected,
      deltaMs,
      index: currentIndex,
      timestamp,
    }
    const nextAttempts = [...attempts, attempt]

    setAttempts(nextAttempts)
    setLastInputAt(timestamp)

    if (!attempt.correct) {
      setStatusMessage(`Retry ${expected === ' ' ? 'space' : expected.toUpperCase()}.`)
      return
    }

    const nextIndex = currentIndex + 1
    setCurrentIndex(nextIndex)
    setStatusMessage(nextIndex === lesson.text.length ? 'Finishing lesson.' : 'Keep a steady pace.')

    if (nextIndex === lesson.text.length) {
      completeLesson(nextAttempts, timestamp)
    }
  }

  async function handleResetProgress() {
    const confirmed = window.confirm('Reset all local typing progress and return to the starter letters?')
    if (!confirmed) {
      return
    }

    await indexedDbStorage.reset()
    const nextProgress = createInitialProgressState()
    setProgress(nextProgress)
    setStatusMessage('Progress reset. Starter lesson ready.')
    queueFreshLesson(nextProgress)
  }

  const recentSessions = progress.sessions.slice(0, 4)

  if (!isLoaded) {
    return (
      <main className="loading-shell">
        <div className="loading-panel">
          <span>Loading local progress…</span>
        </div>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__title">
          <span className="brand-mark">typing</span>
          <span className="topbar__meta">{progress.unlockedLetters.length}/26 letters</span>
        </div>
        <div className="toolbar">
          <div className="mode-switch" role="tablist" aria-label="Practice mode">
            <button
              className={progress.settings.mode === 'adaptive' ? 'toolbar-button toolbar-button--active' : 'toolbar-button'}
              onClick={() => updateSettings('adaptive')}
              type="button"
            >
              Adaptive
            </button>
            <button
              className={progress.settings.mode === 'focus' ? 'toolbar-button toolbar-button--active' : 'toolbar-button'}
              onClick={() => updateSettings('focus')}
              type="button"
            >
              Focus
            </button>
          </div>
          <label className="focus-control">
            <span>Target key</span>
            <select
              value={progress.settings.focusLetter}
              onChange={(event) => updateSettings(progress.settings.mode, event.target.value as Letter)}
            >
              {ALPHABET.map((letter) => (
                <option key={letter} value={letter}>
                  {letter.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <button className="toolbar-button" onClick={() => queueFreshLesson()} type="button">
            New lesson
          </button>
          <button className="toolbar-button toolbar-button--danger" onClick={() => void handleResetProgress()} type="button">
            Reset
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="practice-column">
          <section
            className={hasFocus ? 'panel practice-panel practice-panel--focused' : 'panel practice-panel'}
            onClick={() => practiceRef.current?.focus()}
          >
            <div className="practice-panel__status">
              <span>{statusMessage}</span>
              <span>{hasFocus ? 'Typing' : 'Click to focus'}</span>
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
                const elements: React.ReactNode[] = []
                const text = lesson.text
                let i = 0

                while (i < text.length) {
                  if (text[i] === ' ') {
                    const classes = ['practice-text__char', 'practice-text__char--space']
                    if (i < currentIndex) classes.push('practice-text__char--done')
                    if (i === currentIndex) classes.push('practice-text__char--current')
                    if (errorIndex === i) classes.push('practice-text__char--error')

                    elements.push(
                      <span className={classes.join(' ')} key={`${lesson.id}-${i}`}>
                        {' '}
                      </span>,
                    )
                    i++
                  } else {
                    const wordStart = i
                    const wordChars: React.ReactNode[] = []

                    while (i < text.length && text[i] !== ' ') {
                      const charClasses = ['practice-text__char']
                      if (i < currentIndex) charClasses.push('practice-text__char--done')
                      if (i === currentIndex) charClasses.push('practice-text__char--current')
                      if (errorIndex === i) charClasses.push('practice-text__char--error')

                      wordChars.push(
                        <span className={charClasses.join(' ')} key={`${lesson.id}-${i}`}>
                          {text[i]}
                        </span>,
                      )
                      i++
                    }

                    elements.push(
                      <span className="practice-text__word" key={`${lesson.id}-w${wordStart}`}>
                        {wordChars}
                      </span>,
                    )
                  }
                }

                return elements
              })()}
            </div>
            <div className="practice-panel__footer">
              <span>{isPending ? 'Preparing next lesson…' : isSaving ? 'Saving…' : ''}</span>
            </div>
          </section>

          <section className="panel metrics-panel">
            <div className="metric-grid">
              <div className="metric-card">
                <span>Session speed</span>
                <strong>{formatWpm(liveWpm)}</strong>
              </div>
              <div className="metric-card">
                <span>Session accuracy</span>
                <strong>{formatPercent(liveAccuracy)}</strong>
              </div>
              <div className="metric-card">
                <span>Next unlock</span>
                <strong>{unlockStatus.nextLetter ? unlockStatus.nextLetter.toUpperCase() : 'Complete'}</strong>
              </div>
              <div className="metric-card">
                <span>Mastery target</span>
                <strong>
                  {MASTERY_WPM_TARGET} wpm · {MASTERY_ACCURACY_TARGET}%
                </strong>
              </div>
            </div>
            <div className="progress-grid">
              <ProgressMeter label="Samples" text={`${UNLOCK_SAMPLE_TARGET} correct hits`} value={unlockStatus.sampleProgress} />
              <ProgressMeter label="Accuracy" text={`${UNLOCK_ACCURACY_TARGET}% required`} value={unlockStatus.accuracyProgress} />
              <ProgressMeter label="Speed" text={`${UNLOCK_WPM_TARGET} wpm required`} value={unlockStatus.speedProgress} />
            </div>
          </section>

          <section className="panel sessions-panel">
            <div className="panel__header">
              <h2>Recent sessions</h2>
              <span>{progress.sessions.length} stored locally</span>
            </div>
            <div className="session-list">
              {recentSessions.length === 0 ? (
                <div className="session-row">
                  <span>Start the first lesson to build local history.</span>
                </div>
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
        </section>

        <section className="insights-column">
          <section className="panel weak-panel">
            <div className="panel__header">
              <h2>Priority</h2>
              <span>Weakest letters</span>
            </div>
            <div className="weak-list">
              {weakLetters.map((letter) => (
                <div className="weak-card" key={letter}>
                  <span>{letter.toUpperCase()}</span>
                  <strong>{formatWpm(getLetterWpm(progress.letterStats[letter]))}</strong>
                  <small>{formatPercent(getLetterAccuracy(progress.letterStats[letter]))}</small>
                </div>
              ))}
            </div>
          </section>

          <KeyboardMap progress={progress} weakLetters={weakLetters} />
          <LetterLedger progress={progress} weakLetters={weakLetters} />
        </section>
      </main>
    </div>
  )
}
