// v1.4.24 문장 소환 — 모듈 안의 한 스텝 (옛 월드 6 전용 화면 ForgeScreen을 대체)
//
// 왜 옮겼나 (Dio님 지시 2026-08-14):
//   독립 기능으로 두면 커리큘럼이 늘 때마다 그 화면 하나가 끝없이 길어지고, 결국 안 들어가는 방이 된다.
//   "배운 문법을 그 자리에서 조립해 실행해 본다"가 원래 이 기능이 하려던 일이므로 배운 직후에 둔다.
//
// 이 파일이 반드시 지키는 두 가지 (둘 다 v1.4.2에서 고쳤다가 소스 재구성 때 유실된 것들 — L27):
//   ① ⚡소환 버튼과 피드백은 **조립 슬롯 바로 아래**. 블록 풀은 그 아래.
//      아이가 버튼을 누른 뒤 무대를 보려고 화면을 되감아 올리는 일이 없어야 한다.
//   ② 화면에 나오는 애니메이션은 **아이가 조립한 문장 그대로**여야 한다.
//      재현할 수 없는 문장에 아무 연출이나 붙이지 않는다 — 그건 거짓말이다. 대신 '문장 각인'으로 간다.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SummonItem } from '../lib/content'
import { validate, normalize, type ForgeVerdict } from '../lib/forge'
import { mountForgeStage, type ForgeStageHandle } from '../lib/forgeStage'
import { playClip, stopClip } from '../lib/audio'
import { loadLocal, saveLocal } from '../lib/store'
import { XP } from '../lib/xp'

/** 발견 XP — 문장당 평생 1회 (localStorage forgeFound, v1.4.0부터의 additive 필드 그대로) */
function tryDiscover(sentence: string): boolean {
  const s = loadLocal()
  const found = s.forgeFound || []
  const key = normalize(sentence)
  if (found.includes(key)) return false
  saveLocal({ ...s, forgeFound: [...found, key].slice(-500) })
  return true
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  // xorshift — LCG 하위 비트 편향을 쓰지 않는다 (L24)
  let s = (seed * 2654435761) >>> 0 || 1
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/** 정답과 비교해 "어디까지 맞았는지"를 알려주는 정직한 진단.
 *  문법 엔진이 못 보는 문장(월드 7~10의 긴 문장 등)에서도 아이에게 다음 수를 준다. */
function positionalHint(built: string[], answer: string, focus?: string): string {
  const want = answer.trim().split(/\s+/)
  const okUpto = (() => {
    let n = 0
    while (n < built.length && n < want.length &&
      built.slice(0, n + 1).join(' ').toLowerCase() === want.slice(0, n + 1).join(' ').toLowerCase()) n++
    return n
  })()
  const tail = focus ? ` — ${focus}` : ''
  if (okUpto === 0) return `첫 블록부터 다시 봐. 이 문장은 누가/무엇으로 시작할까?${tail}`
  if (okUpto >= built.length && built.length < want.length) return `여기까지는 완벽해! 블록이 아직 남았어${tail}`
  return `앞에서 ${okUpto}칸까지는 딱 맞았어. 그다음 자리를 바꿔볼까?${tail}`
}

type FB =
  | null
  | { kind: 'broken'; brokenIdx: number; hint_ko: string; law_ko: string }
  | { kind: 'mismatch'; mine: string; target: string; discovered: boolean; ran: boolean }
  | { kind: 'off'; hint: string }
  | { kind: 'success'; sentence: string; discovered: boolean }

export function SummonExercise(props: {
  items: SummonItem[]
  prompt_ko?: string
  onAnswer: (item: SummonItem, correct: boolean, given: string, ms: number) => void
  onDiscover: (sentence: string) => void
  onFinish: () => void
}) {
  const [mi, setMi] = useState(0)
  const [placed, setPlaced] = useState<number[]>([])
  const [feedback, setFeedback] = useState<FB>(null)
  const firstTryRef = useRef(true)
  const startRef = useRef(Date.now())
  const busyRef = useRef(false)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const stage = useRef<ForgeStageHandle | null>(null)

  const item = props.items[mi] || null
  const pool = useMemo(() => item ? shuffle(item.tokens.map((t, i) => ({ t, i })), mi + 1) : [], [item?.id])

  // 무대 마운트 — 스텝이 살아 있는 동안 1회
  useEffect(() => {
    if (boxRef.current && !stage.current) stage.current = mountForgeStage(boxRef.current, { pixel: 4 })
    return () => { stopClip(); stage.current?.destroy(); stage.current = null }
  }, [])

  // 문항이 바뀌면 배역을 미리 세워 둔다(장면이 있는 문항만)
  useEffect(() => {
    setPlaced([]); setFeedback(null); firstTryRef.current = true; startRef.current = Date.now()
    if (item?.scene && stage.current) stage.current.summon(item.scene.actor)
  }, [item?.id])

  if (!item) return null

  const built = placed.map(i => item.tokens[i])
  const builtStr = built.join(' ')

  /** 장면이 선언된 문항은 무대에서 그대로 재현, 아니면 문장을 새긴다 */
  function runScene(sentence: string): number {
    const st = stage.current
    if (!st) return 900
    if (item.scene) {
      st.summon(item.scene.actor)
      return st.play(item.scene.verb, {
        speed: item.scene.speed ?? 1,
        partner: item.scene.object,
        prey: item.scene.object,
      })
    }
    return st.engrave(built)
  }

  function emit(correct: boolean, given: string) {
    if (!firstTryRef.current) return
    firstTryRef.current = false
    props.onAnswer(item, correct, given, Date.now() - startRef.current)
  }

  function summon() {
    if (busyRef.current || !placed.length) return
    const isRight = normalize(builtStr) === normalize(item.answer)

    // ── 정답 ──
    if (isRight) {
      emit(true, builtStr)
      const discovered = tryDiscover(builtStr)
      if (discovered) props.onDiscover(builtStr)
      busyRef.current = true
      const dur = runScene(builtStr)
      const wait = stage.current?.wait() ?? 0
      // 성공 연출은 동사 애니메이션이 **시작된 뒤** 겹쳐 얹는다 (소환 대기 중이면 그만큼 늦춘다)
      window.setTimeout(() => stage.current?.successFx(XP.correct), wait + 120)
      if (item.tts || item.audio_url) window.setTimeout(() => playClip(item), Math.min(dur, 1600))
      window.setTimeout(() => {
        busyRef.current = false
        setFeedback({ kind: 'success', sentence: builtStr, discovered })
      }, Math.min(dur, 2000))
      return
    }

    // ── 오답 ── 문법 엔진이 아는 어휘면 "왜 비문인지"까지 짚어 준다
    const v: ForgeVerdict | null = item.scene ? validate(built) : null
    if (v && v.kind === 'broken') {
      emit(false, builtStr)
      stage.current?.failFx()
      setFeedback({ kind: 'broken', brokenIdx: v.brokenIdx, hint_ko: v.hint_ko, law_ko: v.law_ko })
      return
    }
    if (v && v.kind === 'ok') {
      // 문법은 맞는데 미션과 다르다 — 실행은 시켜 준다(시행착오 안전지대). 새 문장이면 발견 보상.
      emit(false, v.sentence)
      const discovered = tryDiscover(v.sentence)
      if (discovered) props.onDiscover(v.sentence)
      busyRef.current = true
      const st = stage.current
      let dur = 900
      if (st) {
        st.summon(v.parse.subject.actor)
        dur = st.play(v.parse.verb.key, {
          speed: v.parse.adverb?.speed ?? 1,
          partner: v.parse.object?.actor,
          prey: v.parse.object?.actor,
        })
      }
      window.setTimeout(() => {
        busyRef.current = false
        setFeedback({ kind: 'mismatch', mine: v.sentence, target: item.answer, discovered, ran: true })
      }, Math.min(dur, 1800))
      return
    }

    // 문법 엔진 범위 밖 — 정직하게 "어디까지 맞았는지"만 말한다
    emit(false, builtStr)
    stage.current?.failFx()
    setFeedback({ kind: 'off', hint: positionalHint(built, item.answer, item.focus_ko) })
  }

  function next() {
    if (mi + 1 >= props.items.length) props.onFinish()
    else setMi(mi + 1)
  }

  const locked = busyRef.current || feedback?.kind === 'success'

  return (
    <div className="forge-root summon-step">
      <div className="quiz-top">
        <span className="q-count">🔮 {mi + 1}/{props.items.length}</span>
        <span className="arcade-mode-chip">문장 소환</span>
      </div>

      {props.prompt_ko && <p className="qcard-text">{props.prompt_ko}</p>}

      {/* 무대 */}
      <div className="forge-stage-box" ref={boxRef} />

      <div className="forge-mission">
        <p className="forge-mission-ko">📜 미션: <b>"{item.ko}"</b></p>
      </div>

      {/* ① 조립 슬롯 */}
      <div className="order-slots forge-slots">
        {built.length === 0 && <span className="order-hint">아래 블록을 눌러 마법진에 올려봐!</span>}
        {built.map((t, pos) => {
          const broken = feedback?.kind === 'broken' && feedback.brokenIdx === pos
          return (
            <button key={pos} className={`token placed ${broken ? 'forge-broken' : ''}`}
              onClick={() => {
                if (busyRef.current || feedback?.kind === 'success') return
                setFeedback(null)
                setPlaced(placed.filter((_, k) => k !== pos))
              }}>{t}</button>
          )
        })}
      </div>

      {/* ② ⚡소환 버튼 — 슬롯 바로 아래 (v1.4.2에서 올렸던 자리. 다시는 내리지 않는다) */}
      {feedback?.kind !== 'success' && (
        <button className="btn gold wide forge-summon" disabled={placed.length === 0 || busyRef.current} onClick={summon}>
          ⚡ 소환!
        </button>
      )}

      {/* ③ 피드백 — 버튼 바로 아래, 무대와 한 화면 안에 */}
      {feedback?.kind === 'broken' && (
        <div className="feedback no forge-fb">
          <p className="feedback-meme">💥 파직! 소환 실패 — 깨진 블록을 찾았어</p>
          <p className="feedback-explain">{feedback.hint_ko}{feedback.law_ko ? ` (${feedback.law_ko})` : ''}</p>
          <p className="forge-fb-sub">블록을 다시 배열하고 ⚡ 소환! — 리스폰은 무한이야</p>
        </div>
      )}
      {feedback?.kind === 'off' && (
        <div className="feedback no forge-fb">
          <p className="feedback-meme">🌀 마법진이 흔들렸어 — 거의 다 왔는데!</p>
          <p className="feedback-explain">{feedback.hint}</p>
          <p className="forge-fb-sub">블록을 다시 배열하고 ⚡ 소환! — 리스폰은 무한이야</p>
        </div>
      )}
      {feedback?.kind === 'mismatch' && (
        <div className="feedback forge-fb forge-compare">
          <p className="feedback-meme">✨ 오… 문법은 완벽해서 실행됐어!{feedback.discovered ? ' (+2 XP 새 문장 발견!)' : ''} 근데 미션이랑 달라</p>
          <div className="forge-diff">
            <p><span className="forge-diff-tag">내 문장</span> {feedback.mine}</p>
            <p><span className="forge-diff-tag gold">미션 뜻</span> {item.ko}</p>
          </div>
          <p className="forge-fb-sub">둘의 차이를 찾아서 다시 소환해봐!</p>
        </div>
      )}
      {feedback?.kind === 'success' && (
        <div className="feedback ok forge-fb">
          <p className="feedback-meme">🌟 완벽 소환! "{feedback.sentence}" +{XP.correct} XP{feedback.discovered ? ' · 새 문장 발견 +2 🧪' : ''}</p>
          {item.explain_ko && <p className="feedback-explain">{item.explain_ko}</p>}
          <button className="btn primary wide" onClick={next}>
            {mi + 1 >= props.items.length ? '소환 완료! 🏆' : '다음 설계도 →'}
          </button>
        </div>
      )}

      {/* ④ 블록 풀 — 맨 아래 */}
      {feedback?.kind !== 'success' && (
        <>
          <span className="summon-pool-label">블록 창고</span>
          <div className="order-pool">
            {pool.map(({ t, i }) => (
              <button key={i} className={`token ${placed.includes(i) ? 'used' : ''}`} disabled={placed.includes(i) || locked}
                onClick={() => { if (!busyRef.current) { setFeedback(null); setPlaced([...placed, i]) } }}>{t}</button>
            ))}
          </div>
          {item.focus_ko && <p className="summon-focus">🔍 이번 단원 포인트 — {item.focus_ko}</p>}
        </>
      )}
    </div>
  )
}
