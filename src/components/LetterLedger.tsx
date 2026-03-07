import { getLetterAccuracy, getLetterWpm, getWeakLetters } from '../lib/progression'
import { useTypingStore } from '../lib/store'

export function LetterLedger() {
  const progress = useTypingStore((state) => state.progress)
  const weakLetters = getWeakLetters(progress, 3)

  return (
    <section className="panel ledger-panel">
      <div className="panel__header">
        <h2>Letter progress</h2>
        <span>Weak letters stay in rotation until they hit mastery.</span>
      </div>
      <div className="ledger-table" role="table" aria-label="Letter progress table">
        <div className="ledger-row ledger-row--head" role="row">
          <span role="columnheader">Key</span>
          <span role="columnheader">WPM</span>
          <span role="columnheader">Accuracy</span>
          <span role="columnheader">Samples</span>
        </div>
        {progress.unlockedLetters.map((letter) => {
          const stats = progress.letterStats[letter]
          const classes = ['ledger-row']
          if (weakLetters.includes(letter)) {
            classes.push('ledger-row--weak')
          }

          return (
            <div className={classes.join(' ')} role="row" key={letter}>
              <span role="cell">{letter.toUpperCase()}</span>
              <span role="cell">{Math.round(getLetterWpm(stats))}</span>
              <span role="cell">{Math.round(getLetterAccuracy(stats))}%</span>
              <span role="cell">{stats.correctHits}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
