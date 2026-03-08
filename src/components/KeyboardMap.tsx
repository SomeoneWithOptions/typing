import { KEYBOARD_ROWS, MASTERY_ACCURACY_TARGET, MASTERY_WPM_TARGET } from '../lib/constants'
import { getLetterAccuracy, getLetterWpm } from '../lib/progression'
import { useTypingStore } from '../lib/store'
import type { Letter } from '../lib/types'

export function KeyboardMap() {
  const progress = useTypingStore((state) => state.progress)
  const toggleLetterLock = useTypingStore((state) => state.toggleLetterLock)
  const lessonTarget = useTypingStore((state) => state.lesson.targetLetters[0] ?? state.progress.nextUnlockLetter)
  const unlockedSet = new Set(progress.unlockedLetters)
  const rowOffsets = [0, 1, 3]

  function handleKeyClick(letter: Letter) {
    toggleLetterLock(letter)
  }

  return (
    <div className="kbd" aria-label="Large keyboard map">
      <div className="kbd__board">
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <div className="kbd__row" key={row.join('')} style={{ paddingLeft: `${rowOffsets[rowIndex] * 2.2}rem` }}>
            {row.map((letter) => {
              const stats = progress.letterStats[letter]
              const accuracy = getLetterAccuracy(stats)
              const wpm = getLetterWpm(stats)
              const unlocked = unlockedSet.has(letter)
              const isCurrentTarget = lessonTarget === letter
              const isMastered = stats.attempts > 0 && accuracy >= MASTERY_ACCURACY_TARGET && wpm >= MASTERY_WPM_TARGET
              
              const classes = ['kbd__key']
              if (isCurrentTarget) classes.push('kbd__key--active')
              
              if (!unlocked) {
                classes.push('kbd__key--locked')
              } else if (isMastered) {
                classes.push('kbd__key--mastered')
              } else {
                classes.push('kbd__key--unlocked')
              }

              return (
                <div
                  role="button"
                  tabIndex={0}
                  className={classes.join(' ')}
                  key={letter}
                  onClick={() => handleKeyClick(letter)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleKeyClick(letter)
                    }
                  }}
                >
                  <span className="kbd__letter">{letter.toUpperCase()}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="kbd__legend">
        <span className="kbd__legend-item">
          <span className="kbd__dot kbd__dot--unlocked" />
          Unlocked
        </span>
        <span className="kbd__legend-item">
          <span className="kbd__dot kbd__dot--active" />
          Target
        </span>
        <span className="kbd__legend-item">
          <span className="kbd__dot kbd__dot--locked" />
          Locked
        </span>
        <span className="kbd__legend-item kbd__legend-item--hint">
          Click key to toggle lock/unlock
        </span>
      </div>
    </div>
  )
}
