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

/* ═══ ★v1.4.43 (N1) — 소리 훈련소가 하루짜리 XP 농장이었다★ ═══════════════════
   2026-08-17 실측: 세션 263에서 **서로 다른 문항 10개를 정확히 14바퀴** 돌아
   140문항·1,170 XP가 적립됐다. 원인 두 가지가 겹쳤다.
     ① 라운드 시드가 `cmd-${날짜}` — 하루 종일 같은 10개가 같은 순서로 나온다.
        (게다가 QuestionCard는 선택지를 섞지 않으므로 정답 위치까지 같다.)
     ② 라운드 횟수 제한도, 같은 문항 재정답에 대한 XP 제한도 없다.
   이 앱의 XP는 아빠가 건 실물 보상 사다리의 눈금이다 — 반복만으로 보상이 앞당겨진다.
   또 관제실은 이것을 「신규 학습 정답률 · 실력 신호」라고 부른다(14번째 만난 문항인데).
   봉합: (가) 같은 날 같은 문항의 정답 XP는 **최초 1회만** (기록은 그대로 남긴다)
        (나) 라운드 번호를 시드에 넣어 **판마다 새 조합**이 나오게 한다(40/96개 풀을 실제로 쓴다).
   ※ 라운드 횟수 자체는 막지 않는다 — 더 하고 싶은 아이를 막는 건 이 프로젝트 제1원칙에 어긋난다. */
const ARCADE_XP_KEY = 'wordcraft_arcade_xp_v1'
const ARCADE_ROUND_KEY = 'wordcraft_arcade_round_v1'

function arcadeXpDone(): Set<string> {
  try {
    const d = JSON.parse(localStorage.getItem(ARCADE_XP_KEY) || 'null') as { date: string; ids: string[] } | null
    return d && d.date === todayStr() ? new Set(d.ids) : new Set<string>()
  } catch { return new Set<string>() }
}
function markArcadeXp(key: string): void {
  try {
    const cur = arcadeXpDone(); cur.add(key)
    localStorage.setItem(ARCADE_XP_KEY, JSON.stringify({ date: todayStr(), ids: [...cur] }))
  } catch { /* 저장 실패해도 학습은 계속된다 */ }
}
/** 오늘 이 모드를 몇 번째 도는지 — 시드에 섞어 판마다 다른 문항이 나오게 한다. */
function nextRoundNo(mode: 'echo' | 'cmd'): number {
  try {
    const d = JSON.parse(localStorage.getItem(ARCADE_ROUND_KEY) || 'null') as { date: string; echo: number; cmd: number } | null
    const base = d && d.date === todayStr() ? d : { date: todayStr(), echo: 0, cmd: 0 }
    const n = (Number(base[mode]) || 0) + 1
    localStorage.setItem(ARCADE_ROUND_KEY, JSON.stringify({ ...base, date: todayStr(), [mode]: n }))
    return n
  } catch { return 1 }
}

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
  const [stats, setStats] = useState({ total: 0, correct: 0, xp: 0 })
  const [lastMode, setLastMode] = useState<'echo' | 'cmd'>('echo')

  useEffect(() => {
    loadListening().then(setContent).catch(() => setError(true))
    return () => stopClip()
  }, [])

  const echoCount = useMemo(() => content ? content.echo_sets.reduce((a, s) => a + s.items.length, 0) : 0, [content])

  function start(m: 'echo' | 'cmd') {
    if (!content) return
    const day = todayStr()
    const round = nextRoundNo(m)   // ★v1.4.43 (N1-나)★ 판마다 새 조합
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
      picked = seededPick(all, ROUND_SIZE, `echo-${day}-r${round}`)
    } else {
      const all = content.commands.map(it => ({
        id: it.id, q_ko: it.q_ko, tts: it.tts || it.play, audio_url: it.audio_url, voice: it.voice,
        choices: it.choices, answer_idx: it.answer_idx, explain_ko: it.explain_ko,
      } as ChoiceItem))
      picked = seededPick(all, ROUND_SIZE, `cmd-${day}-r${round}`)
    }
    setItems(picked)
    setIdx(0)
    setStats({ total: 0, correct: 0, xp: 0 })
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
          <p className="arcade-score">{stats.correct}/{stats.total} 명중 · +{stats.xp} XP</p>
          <p>{pct >= 80 ? '귀가 만렙이다 ㄷㄷ' : pct >= 50 ? '좋아, 귀가 점점 트인다!' : '괜찮아 — 들을수록 귀가 자란다. 내일 또 도전!'}</p>
          {/* ★v1.4.43 (N1)★ 반복 라운드는 XP가 0이다 — 화면이 거짓말하지 않게 그 사실을 적는다. */}
          {stats.xp < stats.correct * XP.correct && (
            <p className="arcade-note">🔁 오늘 이미 맞힌 지령은 XP가 다시 붙지 않아. 대신 <b>다음 판엔 새 문항</b>이 나와 — 계속 들어도 돼!</p>
          )}
          <button className="btn primary wide" onClick={() => start(lastMode)}>한 라운드 더 🔁</button>
          <button className="btn secondary wide" onClick={() => setMode('menu')}>훈련소 입구로</button>
        </div>
      </div>
    )
  }

  const it = items[idx]
  const modId: 'ECHO' | 'CMD' = mode === 'echo' ? 'ECHO' : 'CMD'
  // ★v1.4.43 (N1-가)★ 오늘 이미 XP를 받은 문항이면 이번 정답은 0 XP — 화면도 그렇게 말한다.
  const xpKey = `${modId}:${it.id}`
  const xpNow = arcadeXpDone().has(xpKey) ? 0 : XP.correct
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
        xpForCorrect={xpNow}
        onAnswer={r => {
          setStats(s => ({ total: s.total + 1, correct: s.correct + (r.correct ? 1 : 0), xp: s.xp + (r.correct ? xpNow : 0) }))
          // ★v1.4.43 (N1-가)★ 같은 날 같은 문항의 정답 XP는 최초 1회만.
          //   answer_events 기록은 그대로 남긴다(무삭제 원칙 — CONTRACT).
          const gained = r.correct ? xpNow : 0
          if (r.correct && xpNow > 0) markArcadeXp(xpKey)
          props.onEvent(modId, {
            activity_type: 'game_listen_choice', question_id: it.id, question_text: it.q_ko,
            given_answer: it.choices[r.givenIdx], correct_answer: it.choices[it.answer_idx],
            is_correct: r.correct, response_ms: r.ms, xp: gained,
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
