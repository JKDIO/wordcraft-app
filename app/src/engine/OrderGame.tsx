import { useEffect, useMemo, useRef, useState } from 'react'
import type { OrderItem } from '../lib/content'
import { playClip } from '../lib/audio'

/** 단어(소리) 블록을 순서대로 배열해 문장/단어 만들기 */
export function OrderGame(props: { item: OrderItem; onDone: (correct: boolean, ms: number) => void; onNext: () => void }) {
  const { item } = props
  const [placed, setPlaced] = useState<number[]>([])
  const [result, setResult] = useState<null | boolean>(null)
  const [retried, setRetried] = useState(false)
  const [start, setStart] = useState(Date.now())
  const emittedRef = useRef(false)
  const pool = useMemo(() => shuffle(item.tokens.map((t, i) => ({ t, i }))), [item.id])

  useEffect(() => { setPlaced([]); setResult(null); setRetried(false); emittedRef.current = false; setStart(Date.now()) }, [item.id])

  function place(i: number) {
    if (result !== null || placed.includes(i)) return
    setPlaced([...placed, i])
  }
  function unplace(pos: number) {
    if (result !== null) return
    setPlaced(placed.filter((_, k) => k !== pos))
  }
  function check() {
    const built = placed.map(i => item.tokens[i]).join(' ')
    const ok = built.trim().toLowerCase() === item.answer.trim().toLowerCase()
    setResult(ok)
    if (item.tts || item.audio_url) playClip(item) // v1.3.0: 클립 우선, tts 폴백
    if (!emittedRef.current) {
      // 기록은 첫 시도 1회만 — 재도전은 학습용 리셋이라 데이터 중복 없음
      emittedRef.current = true
      props.onDone(ok, Date.now() - start)
    }
  }

  /** 오답 시 같은 문항 1회 리셋 (C-4/G-4 — 시안 "다시 도전 🔁" 준용) */
  function retry() {
    setRetried(true)
    setPlaced([])
    setResult(null)
  }

  return (
    <div className="ordergame">
      <p className="qcard-text">{item.prompt_ko}</p>
      {item.ko && <p className="order-ko">"{item.ko}"</p>}
      <div className="order-slots">
        {placed.length === 0 && <span className="order-hint">아래 블록을 눌러서 채워봐!</span>}
        {placed.map((i, pos) => (
          <button key={pos} className="token placed" onClick={() => unplace(pos)}>{item.tokens[i]}</button>
        ))}
      </div>
      <div className="order-pool">
        {pool.map(({ t, i }) => (
          <button key={i} className={`token ${placed.includes(i) ? 'used' : ''}`} onClick={() => place(i)} disabled={placed.includes(i)}>
            {t}
          </button>
        ))}
      </div>
      {result === null ? (
        <button className="btn primary wide" disabled={placed.length !== item.tokens.length} onClick={check}>
          완성! 확인하기
        </button>
      ) : (
        <>
          <div className={`feedback ${result ? 'ok' : 'no'}`}>
            <p className="feedback-meme">{result ? '✔ 나이스 채굴! ⛏️ +10 XP' : '⛏️ 리스폰! 한 번 더'}</p>
            {!result && <p className="feedback-explain">정답: "{item.answer}"</p>}
          </div>
          {result ? (
            <button className="btn primary wide" onClick={props.onNext}>다음 몹 잡으러 →</button>
          ) : retried ? (
            <button className="btn secondary wide" onClick={props.onNext}>오케이, 다음 →</button>
          ) : (
            <button className="btn secondary wide" onClick={retry}>다시 도전 🔁</button>
          )}
        </>
      )}
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
