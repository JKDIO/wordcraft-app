import { useEffect, useState } from 'react'
import { loadDiag, type DiagDef, type DiagQuestion } from '../lib/content'
import { QuestionCard } from '../engine/QuestionCard'
import { OrderGame } from '../engine/OrderGame'
import { ttsAvailable } from '../lib/tts'

/* kind 필드가 없는 콘텐츠에도 강건하게 — 구조로 유형 추론 (D4 크래시 봉합) */
function isOrderQ(q: DiagQuestion): boolean {
  return q.kind === 'order' || (Array.isArray(q.tokens) && q.tokens.length > 0 && !!q.answer)
}
function isListenQ(q: DiagQuestion): boolean {
  return q.kind === 'listen_choice' || (!!q.tts && /들어|듣고|소리|들리/.test(q.q_ko || ''))
}

export function DiagnosticRun(props: {
  diagId: string
  onEvent: (e: { question_id: string; question_text?: string; given_answer?: string; correct_answer?: string; is_correct: boolean; response_ms?: number }) => void
  onComplete: (r: { diagId: string; pct: number; band: { label_ko: string; start_module: string } }) => void
  onExit: () => void
}) {
  const [diag, setDiag] = useState<DiagDef | null>(null)
  const [idx, setIdx] = useState(-1) // -1 = 인트로
  const [stats, setStats] = useState({ total: 0, correct: 0 })

  useEffect(() => { loadDiag(props.diagId).then(setDiag).catch(() => {}) }, [props.diagId])

  if (!diag) return <div className="center-box"><p className="loading-msg">📡 스캐너 부팅 중…</p></div>

  if (idx === -1) {
    return (
      <div className="center-box diag-intro">
        <div className="diag-big">{diag.emoji}</div>
        <h2>{diag.title_ko}</h2>
        <p>{diag.intro_ko}</p>
        <button className="btn primary wide" onClick={() => setIdx(0)}>스캔 시작! ({diag.questions.length}문제)</button>
        <button className="btn ghost" onClick={props.onExit}>나중에 할래</button>
      </div>
    )
  }

  if (idx >= diag.questions.length) {
    const pct = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0
    const bands = [...diag.scoring.bands].sort((a, b) => b.min_pct - a.min_pct)
    const band = bands.find(b => pct >= b.min_pct) || bands[bands.length - 1]
    return (
      <div className="center-box diag-result">
        <div className="diag-big">✅</div>
        <h2>스캔 완료!</h2>
        <p className="diag-pct">싱크로율 {pct}%</p>
        <p className="diag-band">{band.label_ko}</p>
        <button className="btn primary wide" onClick={() => props.onComplete({ diagId: diag.diag_id, pct, band })}>결과 저장 →</button>
      </div>
    )
  }

  const q: DiagQuestion = diag.questions[idx]
  const progress = `${idx + 1}/${diag.questions.length}`

  function record(is_correct: boolean, given?: string, ms?: number) {
    setStats(s => ({ total: s.total + 1, correct: s.correct + (is_correct ? 1 : 0) }))
    props.onEvent({
      question_id: q.id, question_text: q.q_ko || q.prompt_ko,
      given_answer: given, correct_answer: q.kind === 'order' ? q.answer : q.choices?.[q.answer_idx],
      is_correct, response_ms: ms,
    })
  }

  return (
    <div className="session">
      <div className="session-head">
        <button className="exit-btn" onClick={props.onExit} aria-label="나가기">✕</button>
        <span className="session-title">{diag.emoji} {diag.title_ko} <span className="diag-progress">{progress}</span></span>
      </div>
      {isOrderQ(q) ? (
        <OrderGame
          item={{ id: q.id, prompt_ko: q.prompt_ko || q.q_ko, tokens: q.tokens!, answer: q.answer!, tts: q.tts, ko: undefined }}
          onDone={(ok, ms) => record(ok, ok ? q.answer : '(오답 배열)', ms)}
          onNext={() => setIdx(idx + 1)}
        />
      ) : Array.isArray(q.choices) && q.choices.length > 0 && !(isListenQ(q) && !ttsAvailable()) ? (
        <QuestionCard
          item={q}
          listen={isListenQ(q)}
          onAnswer={r => record(r.correct, q.choices[r.givenIdx], r.ms)}
          onNext={() => setIdx(idx + 1)}
        />
      ) : (
        /* 방어 가드: 렌더 불가 문항은 채점 제외 스킵 (앱 전체 크래시 방지) */
        <div className="center-box">
          <p>이 문제는 건너뛸게! 🙌</p>
          <button className="btn primary" onClick={() => setIdx(idx + 1)}>다음 →</button>
        </div>
      )}
    </div>
  )
}
