import { KEYBOARD_ROWS, MASTERY_ACCURACY_TARGET, MASTERY_WPM_TARGET } from '../lib/constants'
import { getLetterAccuracy, getLetterWpm, getWeakLetters } from '../lib/progression'
import { useTypingStore } from '../lib/store'

export function KeyboardMap() {
  const progress = useTypingStore((state) => state.progress)
  const weakLetters = getWeakLetters(progress, 3)
  const unlockedSet = new Set(progress.unlockedLetters)

  return (
    <div className="keyboard-section">
      <div className="keyboard-header">
        <span>keyboard</span>
        <span>{progress.unlockedLetters.length} / 26 unlocked</span>
      </div>
      <div className="keyboard-map" aria-label="Keyboard progress">
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <div className={`keyboard-map__row keyboard-map__row--${rowIndex + 1}`} key={row.join('')}>
            {row.map((letter) => {
              const stats = progress.letterStats[letter]
              const accuracy = getLetterAccuracy(stats)
              const wpm = getLetterWpm(stats)
              const locked = !unlockedSet.has(letter)
              const classes = ['keycap']

              if (locked) {
                classes.push('keycap--locked')
              } else if (weakLetters.includes(letter)) {
                classes.push('keycap--weak')
              } else if (accuracy >= MASTERY_ACCURACY_TARGET && wpm >= MASTERY_WPM_TARGET) {
                classes.push('keycap--mastered')
              } else {
                classes.push('keycap--active')
              }

              if (progress.nextUnlockLetter === letter) {
                classes.push('keycap--next')
              }

              return (
                <div className={classes.join(' ')} key={letter}>
                  <span className="keycap__letter">{letter.toUpperCase()}</span>
                  <span className="keycap__meta">{locked ? '···' : `${Math.round(wpm)}`}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
