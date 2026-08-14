import { useMemo, useState } from 'react'
import type { MatchPair } from '../lib/content'
import { playClip } from '../lib/audio'

/** 짝맞추기: 왼쪽(영어) ↔ 오른쪽(뜻/이모지) */
export function MatchGame(props: { pairs: MatchPair[]; onDone: (wrongTries: number) => void }) {
  const pairs = props.pairs
  const rights = useMemo(() => shuffle(pairs.map((p, i) => ({ text: p.right, idx: i }))), [pairs])
  const [selLeft, setSelLeft] = useState<number | null>(null)
  const [matched, setMatched] = useState<Set<number>>(new Set())
  const [wrongTries, setWrongTries] = useState(0)
  const [flash, setFlash] = useState<{ side: 'L' | 'R'; idx: number; ok: boolean } | null>(null)

  function pickLeft(i: number) {
    if (matched.has(i)) return
    setSelLeft(i)
    const p = pairs[i]
    if (p.audio_url || p.tts) playClip(p)
  }

  function pickRight(idx: number) {
    if (selLeft === null || matched.has(idx)) return
    if (idx === selLeft) {
      const next = new Set(matched); next.add(idx)
      setMatched(next)
      setFlash({ side: 'R', idx, ok: true })
      setSelLeft(null)
      if (next.size === pairs.length) setTimeout(() => props.onDone(wrongTries), 500)
    } else {
      setWrongTries(w => w + 1)
      setFlash({ side: 'R', idx, ok: false })
      setTimeout(() => setFlash(null), 400)
    }
  }

  return (
    <div className="match">
      <div className="match-col">
        {pairs.map((p, i) => (
          <button key={i}
            className={`match-btn ${matched.has(i) ? 'done' : ''} ${selLeft === i ? 'sel' : ''}`}
            onClick={() => pickLeft(i)} disabled={matched.has(i)}>
            {p.left} {p.tts ? '🔊' : ''}
          </button>
        ))}
      </div>
      <div className="match-col">
        {rights.map(r => (
          <button key={r.idx}
            className={`match-btn ${matched.has(r.idx) ? 'done' : ''} ${flash && flash.idx === r.idx ? (flash.ok ? 'correct' : 'wrong') : ''}`}
            onClick={() => pickRight(r.idx)} disabled={matched.has(r.idx)}>
            {r.text}
          </button>
        ))}
      </div>
    </div>
  )
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
