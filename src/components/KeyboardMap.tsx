import { KEYBOARD_ROWS, MASTERY_ACCURACY_TARGET, MASTERY_WPM_TARGET } from '../lib/constants'
import { getLetterAccuracy, getLetterWpm } from '../lib/progression'
import { useTypingStore } from '../lib/store'

export function KeyboardMap() {
  const progress = useTypingStore((state) => state.progress)
  const lessonTarget = useTypingStore((state) => state.lesson.targetLetters[0] ?? state.progress.nextUnlockLetter)
  const unlockedSet = new Set(progress.unlockedLetters)
  const rowOffsets = [0, 1, 3]

  return (
    <div className="kbd" aria-label="Adaptive keyboard progress">
      <div className="kbd__board">
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <div className="kbd__row" key={row.join('')} style={{ paddingLeft: `${rowOffsets[rowIndex] * 1.6}rem` }}>
            {row.map((letter) => {
              const stats = progress.letterStats[letter]
              const accuracy = getLetterAccuracy(stats)
              const wpm = getLetterWpm(stats)
              const bestWpm = Math.round(stats.fastestWpm)
              const unlocked = unlockedSet.has(letter)
              const isCurrentTarget = lessonTarget === letter
              const isNextUnlock = progress.nextUnlockLetter === letter
              const isMastered = stats.attempts > 0 && accuracy >= MASTERY_ACCURACY_TARGET && wpm >= MASTERY_WPM_TARGET
              const classes = ['kbd__key']

              if (isCurrentTarget) classes.push('kbd__key--active')
              else if (!unlocked && isNextUnlock) classes.push('kbd__key--next')
              else if (!unlocked) classes.push('kbd__key--locked')
              else if (isMastered) classes.push('kbd__key--mastered')
              else classes.push('kbd__key--unlocked')

              const status = isCurrentTarget
                ? 'working'
                : !unlocked
                  ? isNextUnlock ? 'next' : 'locked'
                  : isMastered ? 'mastered' : 'unlocked'

              return (
                <div
                  aria-label={`${letter.toUpperCase()} key, ${status}, best ${bestWpm > 0 ? `${bestWpm} wpm` : 'not recorded yet'}`}
                  className={classes.join(' ')}
                  key={letter}
                >
                  <span className="kbd__letter">{letter.toUpperCase()}</span>
                  <span className="kbd__wpm">{bestWpm > 0 ? bestWpm : '\u2014'}</span>
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
          Current
        </span>
        <span className="kbd__legend-item">
          <span className="kbd__dot kbd__dot--next" />
          Next
        </span>
      </div>
    </div>
  )
}
