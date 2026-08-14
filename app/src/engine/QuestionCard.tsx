import { useEffect, useRef, useState } from 'react'
import type { ChoiceItem } from '../lib/content'
import { playClip, stopAudio } from '../lib/audio'

// 시안 10 승인 밈 풀 원문 그대로 (D-1) — 문구 추가는 Critic 밈 감수 통과 후
const CORRECT_MEMES = ['ㄹㅇ 실력자', 'GG', '미쳤다 진짜 ㄷㄷ', '이걸 맞히네?', '만렙 각', '나이스 채굴! ⛏️', '+10 XP 획득!']
const WRONG_MEMES = ['리스폰! 한 번 더', '아깝!! 거의 다 왔어', '괜찮아, 몹은 또 나와', '한 번 더 파보자 ⛏️', '오답도 채굴의 일부임 ㅋㅋ']

// 같은 문구 연속 2회 금지 (D-2) — 직전 인덱스 제외 후 랜덤
let lastOk = -1
let lastNo = -1
function pickIdx(len: number, last: number): number {
  if (len <= 1) return 0
  let i = Math.floor(Math.random() * len)
  while (i === last) i = Math.floor(Math.random() * len)
  return i
}

export interface AnswerResult { correct: boolean; givenIdx: number; ms: number }

/** 선택(selected) 상태를 먼저 보여준 뒤 채점 표시 (B-3 — 즉시 채점 UX 유지) */
const GRADE_DELAY_MS = 250

export function QuestionCard(props: {
  item: ChoiceItem
  listen?: boolean
  onAnswer: (r: AnswerResult) => void
  onNext: () => void
}) {
  const { item, listen } = props
  const [picked, setPicked] = useState<number | null>(null)
  const [graded, setGraded] = useState(false)
  const [retried, setRetried] = useState(false)
  const [slow, setSlow] = useState(false) // v1.3.0 듣기 0.75x 토글 (CONTRACT v1.3 §9)
  const slowRef = useRef(false)
  const [meme] = useState(() => {
    const oi = pickIdx(CORRECT_MEMES.length, lastOk); lastOk = oi
    const ni = pickIdx(WRONG_MEMES.length, lastNo); lastNo = ni
    return {
      ok: item.meme_correct || CORRECT_MEMES[oi],
      no: item.meme_wrong || WRONG_MEMES[ni],
    }
  })
  const startRef = useRef(Date.now())
  const emittedRef = useRef(false)
  const timerRef = useRef<number | undefined>(undefined)

  // v1.3.0: audio_url 우선 재생(진짜 음성), 실패/부재 시 tts 폴백 — 기존 speak 호출을 playClip으로 일원화
  const hasSound = !!(item.audio_url || item.tts)
  function play(rate?: number) {
    playClip(item, rate ?? (slowRef.current ? 0.75 : 1))
  }

  useEffect(() => {
    startRef.current = Date.now()
    setPicked(null)
    setGraded(false)
    setRetried(false)
    emittedRef.current = false
    if (listen && hasSound) {
      const t = setTimeout(() => play(), 350)
      return () => clearTimeout(t)
    }
  }, [item.id])
  // v1.4.14: 문항 카드를 벗어날 때 소리도 함께 끈다(다음 화면 소리와 겹침 방지)
  useEffect(() => () => { clearTimeout(timerRef.current); stopAudio() }, [])

  const correct = graded && picked === item.answer_idx

  function pick(i: number) {
    if (picked !== null) return
    setPicked(i) // 선택 상태 먼저 (B-3)
    timerRef.current = window.setTimeout(() => {
      setGraded(true)
      if (!emittedRef.current) {
        // 기록은 첫 시도 1회만 — 재도전은 학습용 리셋이라 데이터 중복 없음
        emittedRef.current = true
        props.onAnswer({ correct: i === item.answer_idx, givenIdx: i, ms: Date.now() - startRef.current })
      }
    }, GRADE_DELAY_MS)
  }

  /** 오답 시 같은 문항 1회 리셋 (C-4 — 시안 "다시 도전 🔁" 채택) */
  function retry() {
    setRetried(true)
    setPicked(null)
    setGraded(false)
  }

  return (
    <div className="qcard">
      <div className="qcard-q">
        {listen && hasSound && (
          <button className="tts-btn big" onClick={() => play()} aria-label="다시 듣기">🔊</button>
        )}
        <p className="qcard-text">
          {item.q_ko}
          {listen && hasSound && <small className="qcard-sub">눌러서 다시 들을 수 있어</small>}
        </p>
        {!listen && hasSound && (
          <button className="tts-btn" onClick={() => play()} aria-label="듣기">🔊</button>
        )}
      </div>
      {listen && hasSound && (
        <button
          className={`slow-toggle ${slow ? 'on' : ''}`}
          onClick={() => {
            const next = !slow
            slowRef.current = next
            setSlow(next)
            playClip(item, next ? 0.75 : 1)
          }}
        >
          🐢 천천히 {slow ? 'ON' : 'OFF'}
        </button>
      )}
      <div className="choices">
        {item.choices.map((c, i) => {
          let cls = 'choice-btn'
          let mark: string | null = null
          if (!graded && picked === i) { cls += ' selected'; mark = '◆' }
          else if (graded && i === item.answer_idx) {
            if (picked === item.answer_idx) { cls += ' correct'; mark = '✔' }
            else { cls += ' answer-reveal'; mark = '정답' } // B-6: 오답 시 정답은 dashed + "정답"
          } else if (graded && i === picked) { cls += ' wrong'; mark = '✕' }
          return (
            <button key={i} className={cls} onClick={() => pick(i)} disabled={picked !== null}>
              <span className="key">{String.fromCharCode(65 + i)}</span>
              {c}
              {mark && <span className="mark">{mark}</span>}
            </button>
          )
        })}
      </div>
      {graded && (
        <>
          <div className={`feedback ${correct ? 'ok' : 'no'}`}>
            <p className="feedback-meme">
              {correct
                ? `✔ ${meme.ok}${meme.ok.includes('+10 XP') ? '' : ' +10 XP'}`
                : `⛏️ ${meme.no}`}
            </p>
            <p className="feedback-explain">{item.explain_ko}</p>
          </div>
          {correct ? (
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
