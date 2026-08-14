// v1.4.20 단어 대륙 🗺️ — 어휘 엔진 + 이야기 + 보스전.
//
// v1.4.16: 지도 → 사전 스캔 → 학습 카드 → 게임 → 결과
// v1.4.19: 워드몬 진화 · 글자 타일 · 소리 지르기 (탭 비율 83% → 50%)
// v1.4.20: ① **이야기가 실제로 존재한다** — 팩 도입/결말 + 티어 수호자 10명이 팩을 정복할수록 깨어난다
//          ② **분류 상자** — 네 번째 입력 방식(고르기/조립/말하기/분류). 12칩을 한 화면에서 견주며 품사를 스스로 발견
//          ③ **속사 사냥** — 45초 유창성 보너스(선택). 기록·XP 없음(지표 오염 방지)
//          ④ **단어 골렘** — 팩 5개마다 등장. 직전 5팩에서 뽑은 12단어, 틀리면 큐 뒤로 돌아오는 완전 학습
//
// 기록: activity_type='vocab', module_id=<pack_id> 또는 'GOLEM-T<티어>-<번호>' (스키마 변경 0 — L17)
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadVocab, buildSession, buildSortTask, buildRapidRound, buildGolemSession,
  packStates, isTierOpen, tierDoneCount, starsFor, reviewCardsFor,
  awakenStage, AWAKEN_ICON, AWAKEN_NAME, pendingGolem, golemId, golemPackIds,
  hasFeature, newUnlockAt, MODE_LABEL, MODE_EMOJI, MAX_QUESTIONS, MAX_QUESTIONS_WITH_SORT, RAPID_SECONDS,
  type VocabData, type VocabPack, type VocabQuestion, type VocabWord, type VocabTier,
  type SortTask, type RapidItem,
} from '../lib/vocab'
import { playClip, stopAudio } from '../lib/audio'
import type { LocalState } from '../lib/store'

export interface VocabResult {
  packId: string
  total: number
  correct: number
  pct: number
  stars: number
  known: string[]
  pack: VocabPack
}

const OPEN_KEY = 'wordcraft_vocab_tier_open_v1'
const MET_KEY = 'wordcraft_vocab_met_v1'   // 수호자를 이미 만난 티어 (소개는 한 번만)

/** 지금까지 정복한 단어 대륙 팩 수 — 해금 곡선의 기준(v1.4.20) */
function clearedPacks(state: LocalState): number {
  let n = 0
  for (const k of Object.keys(state.progress || {})) {
    if (!/^V\d{1,2}-\d{2}$/.test(k)) continue
    const st = state.progress[k]?.status
    if (st === 'completed' || st === 'mastered') n++
  }
  return n
}

function metTiers(): number[] {
  try { return JSON.parse(localStorage.getItem(MET_KEY) || '[]') as number[] } catch { return [] }
}
function markMet(tier: number) {
  try {
    const m = metTiers()
    if (!m.includes(tier)) localStorage.setItem(MET_KEY, JSON.stringify([...m, tier]))
  } catch { /* */ }
}

export function VocabContinent(props: {
  state: LocalState
  onAnswer: (moduleId: string, q: VocabQuestion, correct: boolean, ms: number) => void
  onPackDone: (r: VocabResult) => void
  onGolemDone: (golemModuleId: string, firstTryPct: number) => void
  /** v1.4.21 뱃지 카운터 — 서버 이벤트로 되짚을 수 없는 활동만 앱이 세어 둔다 */
  onSortPerfect: () => void
  onRapidResult: (hit: number) => void
  onExit: () => void
}) {
  const [data, setData] = useState<VocabData | null>(null)
  const [err, setErr] = useState(false)
  const [pack, setPack] = useState<VocabPack | null>(null)
  const [golem, setGolem] = useState<{ tier: VocabTier; k: number } | null>(null)

  useEffect(() => {
    loadVocab().then(setData).catch(() => setErr(true))
    return () => stopAudio()
  }, [])

  const cleared = clearedPacks(props.state)

  if (err) return (
    <div className="center-box">
      <div className="diag-big">🗺️</div>
      <h2>단어 대륙에 안개가 꼈어</h2>
      <p>지도를 못 불러왔어. 잠시 뒤에 다시 들어와 줘!</p>
      <button className="btn ghost wide" onClick={props.onExit}>← 월드맵으로</button>
    </div>
  )
  if (!data) return <div className="center-box"><div className="diag-big">🗺️</div><p>단어 대륙 지도를 펼치는 중…</p></div>

  if (golem) return (
    <GolemBattle
      tier={golem.tier} k={golem.k} data={data} cleared={cleared}
      onAnswer={props.onAnswer}
      onDone={pct => { props.onGolemDone(golemId(golem.tier.tier, golem.k), pct); setGolem(null) }}
      onExit={() => setGolem(null)}
    />
  )

  if (pack) return (
    <PackSession
      pack={pack} data={data} cleared={cleared}
      onAnswer={props.onAnswer}
      onSortPerfect={props.onSortPerfect}
      onRapidResult={props.onRapidResult}
      onDone={r => { props.onPackDone(r); setPack(null) }}
      onExit={() => setPack(null)}
    />
  )

  return <ContinentMap data={data} state={props.state} cleared={cleared} onPick={setPack} onGolem={(t, k) => setGolem({ tier: t, k })} onExit={props.onExit} />
}

// ── 대륙 지도 ────────────────────────────────────────────────
function ContinentMap(props: {
  data: VocabData; state: LocalState; cleared: number
  onPick: (p: VocabPack) => void
  onGolem: (t: VocabTier, k: number) => void
  onExit: () => void
}) {
  const { data, state } = props
  const [open, setOpen] = useState<Record<number, boolean>>(() => {
    try { const raw = localStorage.getItem(OPEN_KEY); if (raw) return JSON.parse(raw) as Record<number, boolean> } catch { /* */ }
    const init: Record<number, boolean> = {}
    let picked = false
    for (const t of data.tiers) {
      const done = tierDoneCount(state.progress, t)
      const isCur = !picked && isTierOpen(state.progress, data.tiers, t.tier) && done < t.packs.length
      if (isCur) picked = true
      init[t.tier] = isCur
    }
    return init
  })
  useEffect(() => { try { localStorage.setItem(OPEN_KEY, JSON.stringify(open)) } catch { /* */ } }, [open])

  const totalDone = data.tiers.reduce((a, t) => a + tierDoneCount(state.progress, t), 0)
  const totalWords = totalDone * 12
  const awakened = data.tiers.filter(t => awakenStage(tierDoneCount(state.progress, t)) >= 4).length

  return (
    <div className="worldmap" style={{ paddingBottom: 70 }}>
      <header className="topbar">
        <div className="topbar-left">
          <button className="btn ghost" style={{ padding: '4px 10px' }} onClick={props.onExit}>←</button>
          <div><b>🗺️ 단어 대륙</b><span className="level-tag">말잡이의 땅</span></div>
        </div>
        <div className="topbar-right" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn ghost" style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => { location.hash = '/dex' }}>🗂️ 도감</button>
          <span className="xp-chip">📚 {totalWords.toLocaleString()}</span>
        </div>
      </header>

      {/* 대륙 서사 — 처음 들어온 아이에게 "여기가 어디이고 나는 누구인가"를 준다 */}
      {data.story && (
        <div style={{ background: 'linear-gradient(180deg,#141024,#0f1a28)', border: '1px solid #3a2f5c', borderRadius: 14, padding: '12px 13px', margin: '8px 0 10px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#c9b8ff' }}>📜 {data.story.title_ko}</div>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.6, opacity: 0.9 }}>
            {totalDone === 0 ? data.story.intro_ko : data.story.role_ko}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 11.5, opacity: 0.65 }}>
            깨어난 수호자 {awakened}/10 · 되살린 말 {totalWords.toLocaleString()}개
          </p>
        </div>
      )}

      <div style={{ background: '#0f1a28', border: '1px solid #21324a', borderRadius: 14, padding: 12, margin: '0 0 12px' }}>
        <div style={{ height: 8, background: '#1b2a3d', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ width: `${Math.round((totalDone / 200) * 100)}%`, height: '100%', background: 'linear-gradient(90deg,#4a9eff,#3ddc84)' }} />
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.85 }}>
          {totalDone === 0
            ? '첫 발자국을 찍어보자! 티어 1은 네가 이미 아는 단어들이야 — 워밍업이지 시험이 아니야 😎'
            : `${totalDone}/200 구역 정복 · 잡은 단어 ${totalWords.toLocaleString()}개. 이 속도면 중학교 단어는 이미 네 거야.`}
        </p>
      </div>

      {data.tiers.map(t => {
        const unlocked = isTierOpen(state.progress, data.tiers, t.tier)
        const done = tierDoneCount(state.progress, t)
        const isOpen = open[t.tier] !== false && unlocked
        const st = packStates(state.progress, data.tiers, t)
        const g = t.guardian
        const stage = awakenStage(done)
        const pending = pendingGolem(state.progress, t)
        return (
          <section key={t.tier} className="world">
            <h2
              className="world-title"
              style={{ cursor: unlocked ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', opacity: unlocked ? 1 : 0.55 }}
              onClick={() => unlocked && setOpen(p => ({ ...p, [t.tier]: !isOpen }))}
            >
              <span style={{ display: 'inline-block', width: 14, transform: isOpen ? 'rotate(90deg)' : 'none', opacity: 0.8 }}>▶</span>
              {unlocked ? '🏳️' : '🔒'} T{t.tier} — {t.name_ko}
              <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.75 }}>{done}/{t.packs.length}</span>
              {g && unlocked && <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.9 }}>{AWAKEN_ICON[stage]} {g.name_ko}</span>}
              {pending > 0 && unlocked && <span style={{ fontSize: 11, fontWeight: 800, color: '#ffb45c' }}>⚔️ 골렘 출현</span>}
            </h2>

            {!unlocked && (
              <p className="world-locked-note">앞 구역을 {Math.ceil(t.packs.length * 0.8)}개 정복하면 열려! 지금 구역부터 차근차근 💪</p>
            )}

            {unlocked && !isOpen && (
              <button
                onClick={() => setOpen(p => ({ ...p, [t.tier]: true }))}
                style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', background: '#0f1a28', border: '1px solid #21324a', borderRadius: 14, padding: '10px 12px', margin: '4px 0 10px', color: '#eaf1fa', font: 'inherit' }}
              >
                <div style={{ height: 6, background: '#1b2a3d', borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ width: `${Math.round((done / t.packs.length) * 100)}%`, height: '100%', background: done === t.packs.length ? '#3ddc84' : '#4a9eff', borderRadius: 99 }} />
                </div>
                <span style={{ fontSize: 12, opacity: 0.85 }}>
                  {t.concept_ko} · {done * 12}단어 확보{g ? ` · ${g.emoji} ${g.name_ko} ${AWAKEN_NAME[stage]}` : ''}
                </span>
              </button>
            )}

            {unlocked && isOpen && (
              <>
                {/* 수호자 — 정복할수록 깨어난다 */}
                {g && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#101d2e', border: '1px solid #24374f', borderRadius: 14, padding: '10px 12px', margin: '4px 0 8px' }}>
                    <div style={{ fontSize: 30, lineHeight: 1, filter: stage === 0 ? 'grayscale(1)' : 'none', opacity: stage === 0 ? 0.5 : 1 }}>{g.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>
                        {g.name_ko} <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 11 }}>· {AWAKEN_ICON[stage]} {AWAKEN_NAME[stage]}</span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.55, opacity: 0.9 }}>{g.awaken_ko[stage]}</p>
                      <div style={{ height: 5, background: '#1b2a3d', borderRadius: 99, overflow: 'hidden', marginTop: 7 }}>
                        <div style={{ width: `${Math.min(100, Math.round((done / 20) * 100))}%`, height: '100%', background: stage >= 4 ? '#ffd35c' : '#7f6ad6', borderRadius: 99 }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* 단어 골렘 — 팩 5개마다. 막지 않는다. 하지만 잡아야 수호자가 한 단계 깨어난다 */}
                {pending > 0 && g && (
                  <button onClick={() => props.onGolem(t, pending)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                      background: 'linear-gradient(135deg,#2a1a12,#3a2416)', border: '2px solid #b5763a',
                      borderRadius: 14, padding: '12px 13px', margin: '0 0 10px', color: '#ffe9d2',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 26 }}>{g.golem.emoji}</span>
                      <b style={{ fontSize: 15 }}>{g.golem.name_ko} 출현!</b>
                      <span style={{ marginLeft: 'auto', fontSize: 12, background: '#5c3a1c', borderRadius: 99, padding: '3px 9px' }}>12칸 갑옷</span>
                    </div>
                    <p style={{ margin: '7px 0 0', fontSize: 12.5, lineHeight: 1.55, opacity: 0.92 }}>{g.golem.appear_ko}</p>
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: '#ffcf9a' }}>▶ 최근 5구역에서 잡은 단어로 붙는다 — 틀려도 실패는 없어</p>
                  </button>
                )}

                <p style={{ fontSize: 12, opacity: 0.7, margin: '2px 0 8px' }}>{t.concept_ko}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8 }}>
                  {t.packs.map(pid => {
                    const p = props.data.packs[pid]
                    if (!p) return null
                    const s = st[pid]
                    return (
                      <button
                        key={pid}
                        disabled={s === 'locked'}
                        onClick={() => props.onPick(p)}
                        style={{
                          textAlign: 'left', cursor: s === 'locked' ? 'default' : 'pointer', font: 'inherit',
                          background: s === 'done' ? '#0e2a1c' : s === 'open' ? '#12243a' : '#141c27',
                          border: `1px solid ${s === 'done' ? '#2c6b48' : s === 'open' ? '#2f5c8f' : '#232c3a'}`,
                          borderRadius: 12, padding: '10px 11px', color: s === 'locked' ? '#5d6b7d' : '#eaf1fa',
                        }}
                      >
                        <div style={{ fontSize: 20, lineHeight: 1.1 }}>{s === 'locked' ? '🔒' : p.emoji}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{p.title_ko}</div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{p.theme_ko} · 12단어</div>
                        <div style={{ fontSize: 11, marginTop: 6, opacity: 0.9 }}>
                          {s === 'done' ? '✅ 정복' : s === 'open' ? '▶ 도전' : '잠김'}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}

// ── 팩 세션 ──────────────────────────────────────────────────
type Phase = 'intro' | 'scan' | 'learn' | 'sort' | 'play' | 'rapid' | 'result'

function PackSession(props: {
  pack: VocabPack
  data: VocabData
  cleared: number
  onAnswer: (moduleId: string, q: VocabQuestion, correct: boolean, ms: number) => void
  onSortPerfect: () => void
  onRapidResult: (hit: number) => void
  onDone: (r: VocabResult) => void
  onExit: () => void
}) {
  const { pack, cleared } = props
  const tier = props.data.tiers.find(t => t.tier === pack.tier)
  const guardian = tier?.guardian
  const firstMeet = !!guardian && !metTiers().includes(pack.tier)

  const sortTask = useMemo(
    () => (hasFeature(cleared, 'sort') ? buildSortTask(pack) : null),
    [pack, cleared],
  )
  const qCap = sortTask ? MAX_QUESTIONS_WITH_SORT : MAX_QUESTIONS

  const [phase, setPhase] = useState<Phase>('intro')
  const [known, setKnown] = useState<string[]>([])
  const [scanIdx, setScanIdx] = useState(0)
  const [learnIdx, setLearnIdx] = useState(0)
  const [qs, setQs] = useState<VocabQuestion[]>([])
  const [qi, setQi] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [total, setTotal] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [tiles, setTiles] = useState<string[]>([])
  const [hintLv, setHintLv] = useState(0)
  const startedAt = useRef<number>(Date.now())

  useEffect(() => () => stopAudio(), [])

  const unknown = useMemo(() => pack.words.filter(w => !known.includes(w.w)), [pack, known])

  const startPlay = (kn: string[]) => {
    setQs(buildSession(pack, kn, cleared, qCap))
    setPhase('play')
    startedAt.current = Date.now()
  }
  const afterScan = (kn: string[]) => {
    const rest = pack.words.filter(x => !kn.includes(x.w))
    if (rest.length) setPhase('learn')
    else if (sortTask) setPhase('sort')
    else startPlay(kn)
  }
  const afterLearn = () => { if (sortTask) setPhase('sort'); else startPlay(known) }

  // ⓪ 도입 — 이 팩이 무슨 사건인지. 새로 열린 사냥법도 여기서 알려준다.
  if (phase === 'intro') {
    const unlock = newUnlockAt(cleared)
    return (
      <div className="center-box">
        <SessionTop pack={pack} onExit={props.onExit} label="새 구역" />
        {firstMeet && guardian && (
          <div style={{ display: 'flex', gap: 10, background: '#101d2e', border: '1px solid #3a5170', borderRadius: 14, padding: '11px 12px', margin: '6px 0 10px', textAlign: 'left' }}>
            <div style={{ fontSize: 30, lineHeight: 1 }}>{guardian.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800 }}>{guardian.name_ko} <span style={{ fontWeight: 400, opacity: .6 }}>— {tier?.name_ko} 수호자</span></div>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.6, opacity: .92 }}>{guardian.meet_ko}</p>
            </div>
          </div>
        )}
        <div style={{ background: '#0f1a28', border: '1px solid #21324a', borderRadius: 16, padding: '20px 16px', margin: '4px 0 12px' }}>
          <div style={{ fontSize: 40 }}>{pack.emoji}</div>
          <h2 style={{ margin: '6px 0 0', fontSize: 20 }}>{pack.title_ko}</h2>
          <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.65, opacity: 0.92 }}>{pack.intro_ko}</p>
        </div>
        {unlock && (
          <div style={{ background: '#241f10', border: '1px solid #6b5a15', borderRadius: 12, padding: '9px 12px', margin: '0 0 10px', fontSize: 13 }}>
            🔓 <b>새로운 사냥법 해금!</b> 이 구역부터 <b>{unlock.emoji} {unlock.name}</b>이(가) 나온다
          </div>
        )}
        <button className="btn primary wide" onClick={() => { if (firstMeet) markMet(pack.tier); setPhase('scan') }}>
          🏹 들어간다
        </button>
      </div>
    )
  }

  // ① 사전 스캔 — 아는 단어는 건너뛴다
  if (phase === 'scan') {
    const w = pack.words[scanIdx]
    const next = (isKnown: boolean) => {
      const kn = isKnown ? [...known, w.w] : known
      if (isKnown) setKnown(kn)
      if (scanIdx + 1 >= pack.words.length) afterScan(kn)
      else setScanIdx(scanIdx + 1)
    }
    return (
      <div className="center-box">
        <SessionTop pack={pack} onExit={props.onExit} label={`사전 스캔 ${scanIdx + 1}/${pack.words.length}`} />
        <p style={{ opacity: 0.8, marginTop: 4 }}>이미 아는 단어는 건너뛸 거야. <b>솔직하게</b> 골라 — 맞히기 시험 아니야!</p>
        <div style={{ background: '#0f1a28', border: '1px solid #21324a', borderRadius: 16, padding: '22px 16px', margin: '14px 0' }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 0.5 }}>{w.w}</div>
          <div style={{ opacity: 0.6, fontSize: 13, marginTop: 4 }}>/{w.ipa}/</div>
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => playClip({ audio_url: w.audio_url, tts: w.tts || w.w })}>🔊 소리</button>
        </div>
        <button className="btn primary wide" onClick={() => next(true)}>😎 알아요 — 넘어가기</button>
        <button className="btn secondary wide" onClick={() => next(false)}>🤔 몰라요 — 배울래</button>
      </div>
    )
  }

  // ② 학습 카드 — 모르는 단어만
  if (phase === 'learn') {
    const w = unknown[learnIdx]
    if (!w) { afterLearn(); return null }
    const last = learnIdx + 1 >= unknown.length
    return (
      <div className="center-box">
        <SessionTop pack={pack} onExit={props.onExit} label={`새 단어 ${learnIdx + 1}/${unknown.length}`} />
        <WordCard w={w} />
        <button className="btn primary wide" onClick={() => { if (last) afterLearn(); else setLearnIdx(learnIdx + 1) }}>
          {last ? (sortTask ? '🗃️ 분류 상자로!' : '⚔️ 사냥 시작!') : '다음 →'}
        </button>
      </div>
    )
  }

  // ②-B 분류 상자 — 네 번째 입력 방식. 12개를 한 화면에서 견주며 규칙을 스스로 찾는다.
  if (phase === 'sort' && sortTask) {
    return (
      <SortBox
        pack={pack} task={sortTask}
        onExit={props.onExit}
        onAnswer={(w, ok, ms) => {
          props.onAnswer(pack.pack_id, {
            id: `${pack.pack_id}:${w}:sort`, mode: 'sort', word: pack.words.find(x => x.w === w)!,
            prompt: w, options: sortTask.boxes, answer: 'sort', hints: [],
          }, ok, ms)
          setTotal(t => t + 1)
          if (ok) setCorrect(c => c + 1)
        }}
        onAllCorrect={props.onSortPerfect}
        onDone={() => startPlay(known)}
      />
    )
  }

  // ③ 게임
  if (phase === 'play') {
    const q = qs[qi]
    if (!q) { setPhase(hasFeature(cleared, 'rapid') ? 'rapid' : 'result'); return null }
    const answered = picked !== null
    const isRight = answered && picked === q.answer
    const submit = (choice: string) => {
      if (answered) return
      const ok = choice.trim().toLowerCase() === q.answer.trim().toLowerCase()
      setPicked(ok ? q.answer : choice)
      setTotal(t => t + 1)
      if (ok) setCorrect(c => c + 1)
      props.onAnswer(pack.pack_id, q, ok, Date.now() - startedAt.current)
      if (!ok) playClip({ audio_url: q.word.audio_url, tts: q.word.tts || q.word.w })
    }
    const advance = () => {
      setPicked(null); setTiles([]); setHintLv(0); startedAt.current = Date.now()
      if (qi + 1 >= qs.length) setPhase(hasFeature(cleared, 'rapid') ? 'rapid' : 'result')
      else setQi(qi + 1)
    }
    return (
      <div className="center-box">
        <SessionTop pack={pack} onExit={props.onExit} label={`${MODE_EMOJI[q.mode]} ${MODE_LABEL[q.mode]} ${qi + 1}/${qs.length}`} />
        <div style={{ height: 6, background: '#1b2a3d', borderRadius: 99, overflow: 'hidden', margin: '6px 0 12px' }}>
          <div style={{ width: `${Math.round((qi / qs.length) * 100)}%`, height: '100%', background: '#4a9eff' }} />
        </div>
        <QuestionBody q={q} answered={answered} picked={picked} tiles={tiles} setTiles={setTiles} submit={submit} />
        {!answered && (
          <div style={{ margin: '4px 0 10px' }}>
            {hintLv < 3 ? <button className="btn ghost" onClick={() => setHintLv(hintLv + 1)}>💡 힌트 {hintLv + 1}단계</button> : null}
            {hintLv > 0 && (
              <div style={{ background: '#241f10', border: '1px solid #5b4a15', borderRadius: 10, padding: '8px 10px', marginTop: 8, fontSize: 13, textAlign: 'left' }}>
                {q.hints.slice(0, hintLv).map((h, i) => <div key={i}>💡 {h}</div>)}
              </div>
            )}
          </div>
        )}
        {answered && (
          <div style={{ background: isRight ? '#0e2a1c' : '#241a1f', border: `1px solid ${isRight ? '#2c6b48' : '#5b2740'}`, borderRadius: 12, padding: '12px 12px', textAlign: 'left' }}>
            <b>{isRight ? '🎯 명중!' : '💫 리스폰! (감점 없어)'}</b>
            <div style={{ marginTop: 6, fontSize: 15 }}><b>{q.word.w}</b> <span style={{ opacity: 0.7 }}>/{q.word.ipa}/</span> — {q.word.ko}</div>
            <div style={{ marginTop: 4, fontSize: 14, opacity: 0.9 }}>{q.word.ex}</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>{q.word.ex_ko}</div>
            <button className="btn primary wide" style={{ marginTop: 10 }} onClick={advance}>{qi + 1 >= qs.length ? '결과 보기 →' : '다음 →'}</button>
          </div>
        )}
      </div>
    )
  }

  // ③-B 속사 사냥 (선택) — 기록·XP 없음. 순수 유창성 훈련.
  if (phase === 'rapid') {
    return <RapidHunt pack={pack} onResult={props.onRapidResult} onDone={() => setPhase('result')} />
  }

  // ④ 결과 — 여기서 이야기가 닫힌다
  const tot = total || 1
  const pct = Math.round((correct / tot) * 100)
  const stars = starsFor(pct)
  return (
    <div className="center-box">
      <div className="diag-big">{stars === 3 ? '👑' : stars === 2 ? '🏅' : '⛏️'}</div>
      <h2>{pack.emoji} {pack.title_ko} 정복!</h2>
      <div style={{ fontSize: 26, margin: '6px 0' }}>{'★'.repeat(stars)}<span style={{ opacity: 0.25 }}>{'★'.repeat(3 - stars)}</span></div>
      <p style={{ fontSize: 16 }}>{correct}/{tot} 정답 · {pct}%</p>

      {/* 팩 결말 — intro_ko가 던진 사건이 여기서 끝난다 */}
      {pack.outro_ko && (
        <div style={{ background: 'linear-gradient(180deg,#141024,#0f1a28)', border: '1px solid #3a2f5c', borderRadius: 14, padding: '13px 14px', margin: '10px 0', textAlign: 'left' }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#c9b8ff', marginBottom: 6 }}>📜 그래서 어떻게 됐냐면</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>{pack.outro_ko}</p>
        </div>
      )}
      {/* 수호자 한마디 */}
      {guardian && pack.guardian_ko && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#101d2e', border: '1px solid #24374f', borderRadius: 14, padding: '10px 12px', margin: '0 0 10px', textAlign: 'left' }}>
          <div style={{ fontSize: 26, lineHeight: 1.1 }}>{guardian.emoji}</div>
          <div>
            <div style={{ fontSize: 11.5, opacity: 0.65 }}>{guardian.name_ko}</div>
            <p style={{ margin: '2px 0 0', fontSize: 13.5, lineHeight: 1.6 }}>“{pack.guardian_ko}”</p>
          </div>
        </div>
      )}

      <p style={{ opacity: 0.7, fontSize: 13 }}>이 팩의 12단어가 복습 광산에 저장됐어{known.length ? ` (이미 알던 ${known.length}개는 건너뛰기 처리)` : ''}.</p>
      <button className="btn primary wide" onClick={() => props.onDone({ packId: pack.pack_id, total: tot, correct, pct, stars, known, pack })}>지도로 돌아가기 →</button>
    </div>
  )
}

// ── 문항 본문 (팩 세션·골렘전 공용) ───────────────────────────
function QuestionBody(props: {
  q: VocabQuestion; answered: boolean; picked: string | null
  tiles: string[]; setTiles: (t: string[]) => void
  submit: (choice: string) => void
}) {
  const { q, answered, picked, tiles, setTiles, submit } = props
  return (
    <>
      <div style={{ background: '#0f1a28', border: '1px solid #21324a', borderRadius: 16, padding: '20px 14px' }}>
        <div style={{ fontSize: q.mode === 'gap' ? 19 : 28, fontWeight: 800, lineHeight: 1.35 }}>{q.prompt}</div>
        {q.promptKo && <div style={{ opacity: 0.75, fontSize: 14, marginTop: 8 }}>{q.promptKo}</div>}
        {q.play && <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => playClip(q.play!)}>🔊 다시 듣기</button>}
      </div>

      {q.mode === 'spell' ? (
        <div style={{ margin: '14px 0' }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 3, minHeight: 38, color: tiles.length ? '#eaf1fa' : '#4a5768' }}>
            {tiles.length ? tiles.join(' ') : '· · ·'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', margin: '12px 0' }}>
            {q.options.map((ch, k) => (
              <button key={ch + k} disabled={answered}
                onClick={() => {
                  const next = [...tiles, ch]
                  setTiles(next)
                  if (next.length >= q.answer.length) submit(next.join(''))
                }}
                style={{
                  width: 48, height: 48, fontSize: 22, fontWeight: 800, font: 'inherit',
                  background: '#12243a', border: '2px solid #2f5c8f', borderRadius: 12,
                  color: '#eaf1fa', cursor: answered ? 'default' : 'pointer',
                }}>{ch}</button>
            ))}
          </div>
          {!answered && tiles.length > 0 && <button className="btn ghost" onClick={() => setTiles([])}>↩ 다시</button>}
        </div>
      ) : q.mode === 'speak' ? (
        <div style={{ margin: '14px 0' }}>
          <p style={{ fontSize: 13, opacity: .8 }}>🔊를 누르고 <b>세 번</b> 크게 따라 말해봐!</p>
          {!answered && (
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              <button className="btn primary" onClick={() => submit(q.answer)}>📣 말했어! 다음</button>
              <button className="btn ghost" onClick={() => submit('__skip__')}>지금은 소리 못 내 (조용히 넘기기)</button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8, margin: '14px 0' }}>
          {q.options.map(o => {
            const isAns = o === q.answer
            const chosen = picked === o
            const bg = !answered ? '#12243a' : isAns ? '#0e3a24' : chosen ? '#3a1420' : '#141c27'
            const bd = !answered ? '#2f5c8f' : isAns ? '#2c8b58' : chosen ? '#7a2740' : '#232c3a'
            return (
              <button key={o} disabled={answered} onClick={() => submit(o)}
                style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 12, padding: '13px 12px', fontSize: 16, color: '#eaf1fa', font: 'inherit', cursor: answered ? 'default' : 'pointer', textAlign: 'left' }}>
                {o}{answered && isAns ? '  ✓' : ''}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

// ── 분류 상자 🗃️ ─────────────────────────────────────────────
// 왜 이렇게 만들었나: 문항 하나하나를 맞히는 방식이 아니라 **12개를 한 화면에 늘어놓고 견주게** 한다.
// 아이가 "얘랑 얘는 왜 같은 상자지?"를 스스로 묻는 순간이 이 화면의 목적이다(귀납 학습).
function SortBox(props: {
  pack: VocabPack; task: SortTask
  onAnswer: (word: string, ok: boolean, ms: number) => void
  onAllCorrect: () => void
  onDone: () => void
  onExit: () => void
}) {
  const { task } = props
  const [placed, setPlaced] = useState<Record<string, string>>({})
  const [sel, setSel] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const startedAt = useRef(Date.now())

  const remaining = task.items.filter(i => !placed[i.w])
  const allPlaced = remaining.length === 0

  const check = () => {
    const now = Date.now()
    for (const it of task.items) props.onAnswer(it.w, placed[it.w] === it.box, Math.round((now - startedAt.current) / task.items.length))
    // v1.4.21 — 한 번에 전부 제자리에 넣었으면 뱃지 카운터(sort_perfect_5)
    if (task.items.every(i => placed[i.w] === i.box)) props.onAllCorrect()
    setChecked(true)
  }
  const okCount = task.items.filter(i => placed[i.w] === i.box).length

  return (
    <div className="center-box">
      <SessionTop pack={props.pack} onExit={props.onExit} label="🗃️ 분류 상자" />
      <p style={{ fontSize: 13.5, opacity: 0.9, margin: '6px 0 12px', lineHeight: 1.6 }}>{task.rule_ko}</p>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${task.boxes.length},1fr)`, gap: 8, marginBottom: 12 }}>
        {task.boxes.map(b => {
          const inBox = task.items.filter(i => placed[i.w] === b)
          // ⚠️ <button> 안에 <button>을 넣을 수 없고, disabled 버튼은 자식 클릭까지 막는다.
          //    (초기 구현은 상자를 button으로 만들어, 선택된 단어가 없을 때 "상자에서 도로 꺼내기"가 죽었다.)
          //    → 상자는 div, 상자 안의 단어 칩은 button 으로 분리한다.
          return (
            <div key={b} role="button" data-testid="sort-box"
              onClick={() => { if (!checked && sel) { setPlaced(p => ({ ...p, [sel]: b })); setSel(null) } }}
              style={{
                background: sel ? '#173254' : '#101d2e', border: `2px ${sel ? 'solid' : 'dashed'} ${sel ? '#4a9eff' : '#2a3b52'}`,
                borderRadius: 14, padding: '9px 7px', minHeight: 108, color: '#eaf1fa',
                cursor: !checked && sel ? 'pointer' : 'default', textAlign: 'center',
              }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, lineHeight: 1.3, opacity: 0.95 }}>{b}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 7 }}>
                {inBox.map(i => {
                  const right = i.box === b
                  return (
                    // ⚠️ 단어를 하나 집어 든 상태(sel)에서는 상자 안 칩이 클릭을 먹지 않게 한다.
                    //    상자가 차면 '상자 빈 곳'이 좁아져서, 넣으려고 누른 손가락이 이미 담긴 단어를
                    //    도로 꺼내 버린다(스모크에서 재현됨 — 아이 손가락은 더 굵다).
                    <button key={i.w} disabled={checked || !!sel}
                      onClick={(e: { stopPropagation: () => void }) => { e.stopPropagation(); setPlaced(p => { const n = { ...p }; delete n[i.w]; return n }) }}
                      style={{
                        fontSize: 11.5, padding: '3px 7px', borderRadius: 8, font: 'inherit',
                        pointerEvents: sel ? 'none' : 'auto',
                        cursor: checked || sel ? 'default' : 'pointer', color: '#eaf1fa',
                        background: !checked ? '#1e3450' : right ? '#0e3a24' : '#3a1420',
                        border: `1px solid ${!checked ? '#33507a' : right ? '#2c8b58' : '#7a2740'}`,
                      }}>{i.w}{checked ? (right ? ' ✓' : ' ✗') : ''}</button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {!checked && (
        <>
          <div data-testid="sort-pool" style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center', minHeight: 40 }}>
            {remaining.map(i => (
              <button key={i.w} onClick={() => { setSel(i.w); playClip({ audio_url: i.audio_url, tts: i.tts }) }}
                style={{
                  fontSize: 14, fontWeight: 700, padding: '8px 11px', borderRadius: 10, font: 'inherit', cursor: 'pointer',
                  background: sel === i.w ? '#2a4a76' : '#12243a',
                  border: `2px solid ${sel === i.w ? '#6cb0ff' : '#2f5c8f'}`, color: '#eaf1fa',
                }}>{i.w}</button>
            ))}
          </div>
          <p style={{ fontSize: 12, opacity: 0.6, margin: '10px 0' }}>
            {sel ? '이제 넣을 상자를 눌러!' : allPlaced ? '다 넣었어! 확인해 보자' : '단어를 먼저 누르고, 상자를 눌러 (상자 속 단어를 누르면 다시 꺼내져)'}
          </p>
          <button className="btn primary wide" disabled={!allPlaced} onClick={check}
            style={{ opacity: allPlaced ? 1 : 0.45 }}>✅ 확인!</button>
        </>
      )}

      {checked && (
        <div style={{ background: '#0f1a28', border: '1px solid #21324a', borderRadius: 12, padding: '12px 12px', textAlign: 'left' }}>
          <b>{okCount === task.items.length ? '🗃️ 전부 제자리!' : `🗃️ ${okCount}/${task.items.length} 제자리`}</b>
          <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.6, opacity: 0.9 }}>
            {okCount === task.items.length
              ? '단어를 하나씩 보지 않고 서로 견줘서 나눈 거야 — 이게 진짜 실력이 붙는 방식이야.'
              : '자리가 바뀐 건 지금 알았으니 이득이야. 이 단어들은 곧 다시 만날 거야 💫'}
          </p>
          <button className="btn primary wide" style={{ marginTop: 10 }} onClick={props.onDone}>⚔️ 사냥 시작! →</button>
        </div>
      )}
    </div>
  )
}

// ── 속사 사냥 🔥 ─────────────────────────────────────────────
// 45초 유창성 라운드. **기록하지 않는다** — 속도 게임을 점수에 넣으면 정답률이 오염되고,
// 아이는 '급하게 찍기'를 보상받는다. 순수하게 재미와 자동화를 위한 자리다.
function RapidHunt(props: { pack: VocabPack; onResult: (hit: number) => void; onDone: () => void }) {
  const [started, setStarted] = useState(false)
  const [items] = useState<RapidItem[]>(() => buildRapidRound(props.pack, props.pack.pack_id.length * 7 + 13))
  const [idx, setIdx] = useState(0)
  const [hit, setHit] = useState(0)
  const [left, setLeft] = useState(RAPID_SECONDS)
  const [flash, setFlash] = useState<'' | 'ok' | 'no'>('')
  const done = started && (left <= 0 || idx >= items.length)

  useEffect(() => {
    if (!started || done) return
    const t = setInterval(() => setLeft(v => Math.max(0, v - 1)), 1000)
    return () => clearInterval(t)
  }, [started, done])
  // 라운드가 끝나면 최고 기록을 한 번만 올린다 (뱃지 rapid_20)
  const reported = useRef(false)
  useEffect(() => { if (done && !reported.current) { reported.current = true; props.onResult(hit) } }, [done, hit, props])

  if (!started) return (
    <div className="center-box">
      <div className="diag-big">🔥</div>
      <h2>속사 사냥, 해 볼래?</h2>
      <p style={{ opacity: 0.9, lineHeight: 1.7 }}>
        {RAPID_SECONDS}초 동안 단어랑 뜻이 <b>맞는지 아닌지</b>만 빠르게 눌러.<br />
        점수에 안 들어가고 감점도 없어 — <b>순전히 재미</b>야.
      </p>
      <button className="btn primary wide" onClick={() => setStarted(true)}>🔥 간다!</button>
      <button className="btn ghost wide" onClick={props.onDone}>그냥 결과 볼래</button>
    </div>
  )

  if (done) return (
    <div className="center-box">
      <div className="diag-big">🔥</div>
      <h2>{hit}마리 순삭!</h2>
      <p style={{ opacity: 0.9 }}>
        {hit >= 18 ? '손이 머리보다 빨랐어. 이게 진짜 아는 거야 ⚡'
          : hit >= 10 ? '반응이 붙고 있어 — 다음 구역에서 더 빨라질걸? 💫'
            : '천천히 정확한 게 먼저야. 속도는 저절로 따라와 🙂'}
      </p>
      <button className="btn primary wide" onClick={props.onDone}>결과 보기 →</button>
    </div>
  )

  const it = items[idx]
  const tap = (say: boolean) => {
    const ok = say === it.isMatch
    if (ok) setHit(h => h + 1)
    setFlash(ok ? 'ok' : 'no')
    setTimeout(() => setFlash(''), 130)
    setIdx(i => i + 1)
  }
  return (
    <div className="center-box">
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 13, opacity: 0.85 }}>
        <span>🔥 속사 사냥</span><span>⏱️ {left}초</span><span>잡음 {hit}</span>
      </div>
      <div style={{ height: 6, background: '#1b2a3d', borderRadius: 99, overflow: 'hidden', margin: '8px 0 16px', width: '100%' }}>
        <div style={{ width: `${(left / RAPID_SECONDS) * 100}%`, height: '100%', background: left > 10 ? '#ffb45c' : '#ff6b6b', transition: 'width 1s linear' }} />
      </div>
      <div style={{
        background: flash === 'ok' ? '#0e3a24' : flash === 'no' ? '#3a1420' : '#0f1a28',
        border: '1px solid #21324a', borderRadius: 16, padding: '26px 16px', width: '100%',
      }}>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{it.w}</div>
        <div style={{ fontSize: 20, marginTop: 10, opacity: 0.92 }}>{it.ko}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', marginTop: 16 }}>
        <button className="btn secondary" style={{ fontSize: 26, padding: '16px 0' }} onClick={() => tap(false)}>❌</button>
        <button className="btn primary" style={{ fontSize: 26, padding: '16px 0' }} onClick={() => tap(true)}>⭕</button>
      </div>
    </div>
  )
}

// ── 단어 골렘 보스전 ⚔️ ───────────────────────────────────────
// 실패가 없다. 틀리면 골렘이 그 단어를 다시 삼키고 문항이 **큐 맨 뒤로** 돌아온다(완전 학습).
// 그래서 이 화면을 나가지 않는 한 아이는 반드시 12칸을 전부 깬다 — 처벌 없이 숙달만 남는다.
function GolemBattle(props: {
  tier: VocabTier; k: number; data: VocabData; cleared: number
  onAnswer: (moduleId: string, q: VocabQuestion, correct: boolean, ms: number) => void
  onDone: (firstTryPct: number) => void
  onExit: () => void
}) {
  const { tier, k, data } = props
  const g = tier.guardian!
  const moduleId = golemId(tier.tier, k)
  const packs = useMemo(
    () => golemPackIds(tier, k).map(id => data.packs[id]).filter(Boolean),
    [tier, k, data],
  )
  const [queue, setQueue] = useState<VocabQuestion[]>(
    () => buildGolemSession(packs, props.cleared, tier.tier * 100 + k),
  )
  const [broken, setBroken] = useState<string[]>([])   // 깨진 갑옷(= 맞힌 단어)
  const [firstTry, setFirstTry] = useState(0)          // 한 번에 맞힌 개수 (best_score 산출용)
  const [seen, setSeen] = useState<string[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [tiles, setTiles] = useState<string[]>([])
  const [phase, setPhase] = useState<'intro' | 'fight' | 'win'>('intro')
  const startedAt = useRef(Date.now())
  const TOTAL = 12

  useEffect(() => () => stopAudio(), [])

  if (phase === 'intro') return (
    <div className="center-box">
      <div className="diag-big">{g.golem.emoji}</div>
      <h2>{g.golem.name_ko}</h2>
      <p style={{ opacity: 0.92, lineHeight: 1.7, margin: '8px 0' }}>{g.golem.appear_ko}</p>
      <div style={{ background: '#101d2e', border: '1px solid #24374f', borderRadius: 14, padding: '11px 12px', textAlign: 'left', margin: '4px 0 12px' }}>
        <div style={{ fontSize: 12.5 }}>{g.emoji} <b>{g.name_ko}</b></div>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, lineHeight: 1.6, opacity: 0.9 }}>
          최근 다섯 구역에서 잡은 말들이 저 안에 박혀 있다. 틀려도 잃는 건 없어 — 삼켜진 단어가 다시 나올 뿐이야.
        </p>
      </div>
      <button className="btn primary wide" onClick={() => { setPhase('fight'); startedAt.current = Date.now() }}>⚔️ 붙는다!</button>
      <button className="btn ghost wide" onClick={props.onExit}>← 나중에 올게</button>
    </div>
  )

  if (phase === 'win') {
    const pct = Math.round((firstTry / TOTAL) * 100)
    return (
      <div className="center-box">
        <div className="diag-big">💥</div>
        <h2>{g.golem.name_ko} 격파!</h2>
        <p style={{ opacity: 0.92, lineHeight: 1.7, margin: '8px 0' }}>{g.golem.defeat_ko}</p>
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#101d2e', border: '1px solid #24374f', borderRadius: 14, padding: '10px 12px', margin: '4px 0 10px', textAlign: 'left' }}>
          <div style={{ fontSize: 26 }}>{g.emoji}</div>
          <div>
            <div style={{ fontSize: 11.5, opacity: 0.65 }}>{g.name_ko}</div>
            {/* 격파 = 그 수호자가 한 단계 깨어나는 순간. 총평이 아니라 **그 캐릭터의 목소리**로 말하게 한다. */}
            <p style={{ margin: '2px 0 0', fontSize: 13.5, lineHeight: 1.6 }}>“{g.awaken_ko[Math.min(4, k)]}”</p>
          </div>
        </div>
        <p style={{ fontSize: 13, opacity: 0.8 }}>한 번에 깬 갑옷 {firstTry}/{TOTAL}칸 · 나머지는 다시 붙어서 끝냈어 💪</p>
        <button className="btn primary wide" onClick={() => props.onDone(pct)}>지도로 돌아가기 →</button>
      </div>
    )
  }

  const q = queue[0]
  if (!q) { setPhase('win'); return null }
  const answered = picked !== null
  const isRight = answered && picked === q.answer

  const submit = (choice: string) => {
    if (answered) return
    const ok = choice.trim().toLowerCase() === q.answer.trim().toLowerCase()
    setPicked(ok ? q.answer : choice)
    props.onAnswer(moduleId, q, ok, Date.now() - startedAt.current)
    if (ok) {
      setBroken(b => (b.includes(q.word.w) ? b : [...b, q.word.w]))
      if (!seen.includes(q.word.w)) setFirstTry(f => f + 1)
    }
    if (!seen.includes(q.word.w)) setSeen(s => [...s, q.word.w])
    if (!ok) playClip({ audio_url: q.word.audio_url, tts: q.word.tts || q.word.w })
  }
  const advance = () => {
    const wasRight = picked === q.answer
    setPicked(null); setTiles([]); startedAt.current = Date.now()
    setQueue(qq => {
      const [head, ...rest] = qq
      return wasRight ? rest : [...rest, head]   // 틀리면 큐 맨 뒤로 — 골렘이 그 단어를 다시 삼켰다
    })
    if (wasRight && queue.length <= 1) setPhase('win')
  }

  return (
    <div className="center-box">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8, marginBottom: 6 }}>
        <button className="btn ghost" style={{ padding: '4px 10px' }} onClick={() => { stopAudio(); props.onExit() }}>← 나가기</button>
        <span style={{ fontSize: 12, opacity: 0.85 }}>{g.golem.emoji} {g.golem.name_ko}</span>
        <span style={{ fontSize: 12, opacity: 0.85 }}>갑옷 {broken.length}/{TOTAL}</span>
      </div>

      {/* 갑옷 12칸 — 남은 칸이 곧 남은 단어다 */}
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', margin: '2px 0 12px' }}>
        {Array.from({ length: TOTAL }).map((_, i) => (
          <span key={i} style={{
            width: 20, height: 20, borderRadius: 5,
            background: i < broken.length ? 'transparent' : '#8a5a2b',
            border: `2px solid ${i < broken.length ? '#3a4a5e' : '#c2853f'}`,
          }} />
        ))}
      </div>

      <QuestionBody q={q} answered={answered} picked={picked} tiles={tiles} setTiles={setTiles} submit={submit} />

      {answered && (
        <div style={{ background: isRight ? '#0e2a1c' : '#241a1f', border: `1px solid ${isRight ? '#2c6b48' : '#5b2740'}`, borderRadius: 12, padding: '12px 12px', textAlign: 'left' }}>
          <b>{isRight ? '💥 갑옷 한 칸 파괴!' : '🌀 골렘이 그 단어를 다시 삼켰어 — 뒤에서 또 나온다'}</b>
          <div style={{ marginTop: 6, fontSize: 15 }}><b>{q.word.w}</b> <span style={{ opacity: 0.7 }}>/{q.word.ipa}/</span> — {q.word.ko}</div>
          <div style={{ marginTop: 4, fontSize: 14, opacity: 0.9 }}>{q.word.ex}</div>
          <button className="btn primary wide" style={{ marginTop: 10 }} onClick={advance}>
            {isRight && queue.length <= 1 ? '마지막 일격! →' : '계속 →'}
          </button>
        </div>
      )}
    </div>
  )
}

function SessionTop(props: { pack: VocabPack; label: string; onExit: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8, marginBottom: 6 }}>
      <button className="btn ghost" style={{ padding: '4px 10px' }} onClick={() => { stopAudio(); props.onExit() }}>← 나가기</button>
      <span style={{ fontSize: 12, opacity: 0.8 }}>{props.pack.emoji} {props.pack.title_ko}</span>
      <span style={{ fontSize: 12, opacity: 0.8 }}>{props.label}</span>
    </div>
  )
}

function WordCard(props: { w: VocabWord }) {
  const { w } = props
  useEffect(() => { playClip({ audio_url: w.audio_url, tts: w.tts || w.w }) }, [w.w])
  return (
    <div style={{ background: '#0f1a28', border: '1px solid #21324a', borderRadius: 16, padding: '20px 16px', margin: '12px 0', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 30, fontWeight: 800 }}>{w.w}</span>
        <span style={{ opacity: 0.6, fontSize: 14 }}>/{w.ipa}/</span>
        <span style={{ fontSize: 11, background: '#1b2a3d', borderRadius: 8, padding: '2px 8px' }}>{w.pos}</span>
      </div>
      <div style={{ fontSize: 19, marginTop: 8 }}>{w.ko}</div>
      <div style={{ marginTop: 14, borderTop: '1px solid #1b2a3d', paddingTop: 12 }}>
        <div style={{ fontSize: 16 }}>{w.ex}</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{w.ex_ko}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn ghost" onClick={() => playClip({ audio_url: w.audio_url, tts: w.tts || w.w })}>🔊 단어</button>
        <button className="btn ghost" onClick={() => playClip({ audio_url: w.audio_ex_url || w.audio_url, tts: w.ex })}>🔊 예문</button>
      </div>
    </div>
  )
}
