// v1.3.0 유령 보스 리매치 (CONTRACT v1.3 §8) — 축약 보스전 8~10문항.
// 간격 인출 + 전이 측정: 모듈 클리어 D+2/D+7에 월드맵 👻로 진입. 진도 비차단, 오답=리스폰.
import { useEffect, useState } from 'react'
import { loadGhost, type GhostDef } from '../lib/content'
import { QuestionCard } from '../engine/QuestionCard'
import { playClip, stopClip } from '../lib/audio'
import { XP } from '../lib/xp'
import type { StepEvent } from '../engine/StepRunner'

/** 별 판정 (CONTRACT v1.3 §8): 60%↑ ★, 75%↑ ★★, 90%↑ ★★★ */
export function ghostStars(pct: number): number {
  if (pct >= 90) return 3
  if (pct >= 75) return 2
  if (pct >= 60) return 1
  return 0
}

function isListenQ(q: { tts?: string | null; q_ko: string }): boolean {
  return !!q.tts && /들어|듣고|소리/.test(q.q_ko)
}

export function GhostBattle(props: {
  moduleId: string
  moduleTitle?: string
  onEvent: (e: StepEvent) => void
  onComplete: (r: { correct: number; total: number; pct: number; stars: number }) => void
  onExit: () => void
}) {
  const [ghost, setGhost] = useState<GhostDef | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'intro' | 'battle' | 'result'>('intro')
  const [idx, setIdx] = useState(0)
  const [stats, setStats] = useState({ total: 0, correct: 0 })
  const [taunt, setTaunt] = useState<string | null>(null)

  useEffect(() => {
    loadGhost(props.moduleId).then(setGhost).catch(() => setError('유령이 아직 안 나타났어… (콘텐츠 없음)'))
    return () => stopClip()
  }, [props.moduleId])

  if (error) {
    return (
      <div className="ghost-screen">
        <p className="ghost-error">{error}</p>
        <button className="btn secondary wide" onClick={props.onExit}>월드맵으로</button>
      </div>
    )
  }
  if (!ghost) return <div className="ghost-screen"><p className="ghost-loading">👻 스멀스멀…</p></div>

  const qs = ghost.questions
  const pct = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0

  if (phase === 'intro') {
    return (
      <div className="ghost-screen">
        <div className="ghost-intro">
          <div className="ghost-emoji float">👻</div>
          <h2>{ghost.title_ko}</h2>
          <p className="ghost-line">"{ghost.intro_ko}"</p>
          <p className="ghost-sub">문항 {qs.length}개 · 2~4분 · 틀려도 감점 없음 (오답은 복습 광산에 리스폰!)</p>
          <button
            className="btn primary wide"
            onClick={() => {
              if (ghost.intro_audio_url) playClip({ audio_url: ghost.intro_audio_url }) // onyx 보스 목소리 (실패 시 무음)
              setPhase('battle')
            }}
          >⚔️ 유령의 시험 받아들이기</button>
          <button className="btn ghost-flee wide" onClick={props.onExit}>다음에 올게 (진도 손해 없음)</button>
        </div>
      </div>
    )
  }

  if (phase === 'result') {
    const stars = ghostStars(pct)
    const pass = stars >= 1
    return (
      <div className="ghost-screen">
        <div className="ghost-result">
          <div className="ghost-emoji">{pass ? '💨' : '👻'}</div>
          <h2>{pass ? '유령 퇴치 성공!' : '유령이 아직 남아있다…'}</h2>
          <p className="ghost-stars-big">
            {'★'.repeat(stars)}<span className="off">{'★'.repeat(3 - stars)}</span>
          </p>
          <p className="ghost-scoreline">{stats.correct}/{stats.total} 정답 · {pct}%</p>
          {pass
            ? <p className="ghost-line">"인정한다… 진짜 배웠구나. 이 모듈의 마스터로 임명하지!"{stars < 3 ? ' (7일 뒤 별 업그레이드 리매치 가능 👀)' : ' 퍼펙트 마스터 🏆'}</p>
            : <p className="ghost-line">"흐흐, 아직이야! 복습 광산에서 갈고닦고 언제든 다시 와라!"</p>}
          <button className="btn primary wide" onClick={() => props.onComplete({ ...stats, pct, stars })}>
            {pass ? `보상 받기 ${stats.total ? '' : ''}→` : '월드맵으로 →'}
          </button>
        </div>
      </div>
    )
  }

  const q = qs[idx]
  return (
    <div className="ghost-screen">
      <div className="ghost-topbar">
        <button onClick={props.onExit} aria-label="나가기"
          style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: '2px 8px' }}>←</button>
        <span className="ghost-chip">👻 {props.moduleTitle || props.moduleId} 리매치</span>
        <span className="q-count">{Math.min(idx + 1, qs.length)}/{qs.length}</span>
      </div>
      <div className="progressbar ghost"><div className="progressbar-fill" style={{ width: `${Math.round((idx / qs.length) * 100)}%` }} /></div>
      {taunt && <p className="ghost-taunt">👻 "{taunt}"</p>}
      <QuestionCard
        key={q.id}
        item={q}
        listen={isListenQ(q)}
        onAnswer={r => {
          setStats(s => ({ total: s.total + 1, correct: s.correct + (r.correct ? 1 : 0) }))
          const pool = r.correct ? ghost.taunt_correct : ghost.taunt_wrong
          if (pool && pool.length) setTaunt(pool[Math.floor(Math.random() * pool.length)])
          props.onEvent({
            activity_type: 'ghost', question_id: q.id, question_text: q.q_ko,
            given_answer: q.choices[r.givenIdx], correct_answer: q.choices[q.answer_idx],
            is_correct: r.correct, response_ms: r.ms, xp: r.correct ? XP.correct : 0,
          })
        }}
        onNext={() => {
          setTaunt(null)
          if (idx + 1 >= qs.length) setPhase('result')
          else setIdx(idx + 1)
        }}
      />
    </div>
  )
}
