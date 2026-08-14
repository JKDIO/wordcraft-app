// v1.3.0 소리 훈련소 (CONTRACT v1.3 §10) — 에코 사냥(HVPT 최소대립쌍·다중 음성) + 지령 미션(listen-and-do).
// 기록: module_id 'ECHO'/'CMD', activity_type 'game_listen_choice' (기존 XP 산식 그대로).
import { useEffect, useMemo, useState } from 'react'
import { loadListening, type ListeningDef, type ChoiceItem } from '../lib/content'
import { QuestionCard } from '../engine/QuestionCard'
import { stopClip } from '../lib/audio'
import { XP } from '../lib/xp'
import { todayStr } from '../lib/leitner'
import type { StepEvent } from '../engine/StepRunner'

const ROUND_SIZE = 10

/** 날짜 기반 결정적 셔플 — 매일 다른 라운드가 나오지만 같은 날엔 일정 (새로고침 어뷰징 방지 아님, 단순 다양화) */
function seededPick<T>(arr: T[], n: number, seedStr: string): T[] {
  let seed = 0
  for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0
    const j = seed % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, Math.min(n, a.length))
}

type Mode = 'menu' | 'echo' | 'cmd' | 'done'

export function ListenArcade(props: {
  onEvent: (moduleId: 'ECHO' | 'CMD', e: StepEvent) => void
  onExit: () => void
}) {
  const [content, setContent] = useState<ListeningDef | null>(null)
  const [error, setError] = useState(false)
  const [mode, setMode] = useState<Mode>('menu')
  const [items, setItems] = useState<ChoiceItem[]>([])
  const [idx, setIdx] = useState(0)
  const [stats, setStats] = useState({ total: 0, correct: 0 })
  const [lastMode, setLastMode] = useState<'echo' | 'cmd'>('echo')

  useEffect(() => {
    loadListening().then(setContent).catch(() => setError(true))
    return () => stopClip()
  }, [])

  const echoCount = useMemo(() => content ? content.echo_sets.reduce((a, s) => a + s.items.length, 0) : 0, [content])

  function start(m: 'echo' | 'cmd') {
    if (!content) return
    const day = todayStr()
    let picked: ChoiceItem[]
    if (m === 'echo') {
      const all = content.echo_sets.flatMap(s => s.items.map(it => ({
        id: it.id,
        q_ko: it.q_ko,
        tts: it.tts || it.play,
        audio_url: it.audio_url,
        voice: it.voice,
        choices: it.choices.map((c, i) => it.ko_map?.[i] ? `${c} (${it.ko_map[i]})` : c),
        answer_idx: it.answer_idx,
        explain_ko: it.explain_ko,
      } as ChoiceItem)))
      picked = seededPick(all, ROUND_SIZE, `echo-${day}`)
    } else {
      const all = content.commands.map(it => ({
        id: it.id, q_ko: it.q_ko, tts: it.tts || it.play, audio_url: it.audio_url, voice: it.voice,
        choices: it.choices, answer_idx: it.answer_idx, explain_ko: it.explain_ko,
      } as ChoiceItem))
      picked = seededPick(all, ROUND_SIZE, `cmd-${day}`)
    }
    setItems(picked)
    setIdx(0)
    setStats({ total: 0, correct: 0 })
    setLastMode(m)
    setMode(m)
  }

  if (error) {
    return (
      <div className="arcade">
        <p>리스닝 콘텐츠를 불러오지 못했어. 나중에 다시 열어줘!</p>
        <button className="btn secondary wide" onClick={props.onExit}>월드맵으로</button>
      </div>
    )
  }
  if (!content) return <div className="arcade"><p>🎧 소리 훈련소 문 여는 중…</p></div>

  if (mode === 'menu') {
    return (
      <div className="arcade">
        <header className="arcade-head">
          <h2>🎧 소리 훈련소</h2>
          <p>진짜 사람 목소리로 귀를 단련하는 곳! 하루 한 라운드씩 도전해봐.</p>
        </header>
        <button className="arcade-card" onClick={() => start('echo')}>
          <span className="arcade-emoji">📡</span>
          <span className="arcade-txt">
            <h3>에코 사냥</h3>
            <span>비슷한 소리 몹을 구별해서 잡아라! (ship vs sheep) · 여러 목소리 · 문항 풀 {echoCount}개</span>
          </span>
          <span className="arcade-go">▶</span>
        </button>
        <button className="arcade-card" onClick={() => start('cmd')}>
          <span className="arcade-emoji">🪖</span>
          <span className="arcade-txt">
            <h3>지령 미션</h3>
            <span>본부의 영어 지령을 듣고 그대로 실행! (몸으로 하면 XP 2배 기분) · 지령 {content.commands.length}개</span>
          </span>
          <span className="arcade-go">▶</span>
        </button>
        <p className="arcade-tip">💡 안 들리면 🐢 천천히 버튼! 오답은 복습 광산에 리스폰돼.</p>
        <button className="btn secondary wide" onClick={props.onExit}>월드맵으로</button>
      </div>
    )
  }

  if (mode === 'done') {
    const pct = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0
    return (
      <div className="arcade">
        <div className="arcade-result">
          <div className="arcade-emoji-big">{pct >= 80 ? '🏆' : pct >= 50 ? '🎯' : '🎧'}</div>
          <h2>라운드 클리어!</h2>
          <p className="arcade-score">{stats.correct}/{stats.total} 명중 · +{stats.correct * XP.correct} XP</p>
          <p>{pct >= 80 ? '귀가 만렙이다 ㄷㄷ' : pct >= 50 ? '좋아, 귀가 점점 트인다!' : '괜찮아 — 들을수록 귀가 자란다. 내일 또 도전!'}</p>
          <button className="btn primary wide" onClick={() => start(lastMode)}>한 라운드 더 🔁</button>
          <button className="btn secondary wide" onClick={() => setMode('menu')}>훈련소 입구로</button>
        </div>
      </div>
    )
  }

  const it = items[idx]
  const modId: 'ECHO' | 'CMD' = mode === 'echo' ? 'ECHO' : 'CMD'
  return (
    <div className="arcade">
      <div className="quiz-top">
        <button onClick={() => setMode('menu')} aria-label="나가기"
          style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: '2px 8px' }}>←</button>
        <span className="q-count">{Math.min(idx + 1, items.length)}/{items.length}</span>
        <div className="progressbar"><div className="progressbar-fill" style={{ width: `${Math.round((idx / items.length) * 100)}%` }} /></div>
        <span className="arcade-mode-chip">{mode === 'echo' ? '📡 에코' : '🪖 지령'}</span>
      </div>
      <QuestionCard
        key={it.id}
        item={it}
        listen={true}
        onAnswer={r => {
          setStats(s => ({ total: s.total + 1, correct: s.correct + (r.correct ? 1 : 0) }))
          props.onEvent(modId, {
            activity_type: 'game_listen_choice', question_id: it.id, question_text: it.q_ko,
            given_answer: it.choices[r.givenIdx], correct_answer: it.choices[it.answer_idx],
            is_correct: r.correct, response_ms: r.ms, xp: r.correct ? XP.correct : 0,
          })
        }}
        onNext={() => {
          if (idx + 1 >= items.length) setMode('done')
          else setIdx(idx + 1)
        }}
      />
    </div>
  )
}
