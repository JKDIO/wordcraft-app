// v1.4.19 단어 도감 🗂️ — 단어 대륙에서 잡은 워드몬이 모이는 곳.
//
// 왜 필요한가: v1.4.18까지 예한이가 단어를 익힌 성과는 "444단어 확보" 라는 **숫자 하나**뿐이었다.
// 모아도 볼 게 없으면 모을 이유가 약하다. 룬 도감(#/runes)이 이미 검증한 패턴을 어휘에 적용한다.
//
// 데이터는 기존 review_cards 그대로 읽는다(스키마 변경 0). box → 진화 단계.
import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/supabase'
import { loadVocab, type VocabData } from '../lib/vocab'
import { evoOf, EVO_STAGES, isVocabCard, dexStats, VOCAB_CARD_PREFIX, type DexEntry } from '../lib/wordmon'
import { playClip, stopAudio } from '../lib/audio'
import type { LocalState } from '../lib/store'

export function WordDex(props: { state: LocalState; onExit: () => void }) {
  const [entries, setEntries] = useState<DexEntry[] | null>(null)
  const [vocab, setVocab] = useState<VocabData | null>(null)
  const [tier, setTier] = useState<number>(1)
  const [err, setErr] = useState(false)

  useEffect(() => {
    // ⚠️ 도감 데이터(vocab.json)는 learnerId 유무와 무관하게 항상 받아야 한다.
    //    (초기 구현은 learnerId가 없으면 여기서 return 해버려 로딩 화면에서 영영 멈췄다.)
    loadVocab().then(setVocab).catch(() => setErr(true))
    const lid = props.state.learnerId
    if (!lid) { setEntries([]); return }
    db.select('review_cards', `learner_id=eq.${lid}&card_id=like.${VOCAB_CARD_PREFIX}*&select=card_id,card_front,card_back,box,review_count&order=id.asc&limit=20000`)
      .then(rows => {
        const list = (rows as unknown as { card_id: string; card_front: string; card_back: string | null; box: number; review_count?: number }[])
          .filter(r => isVocabCard(r.card_id))
          .map(r => ({
            cardId: r.card_id,
            word: r.card_front || r.card_id.slice(VOCAB_CARD_PREFIX.length),
            meaning: (r.card_back || '').split('\n')[0] || '',
            box: r.box, reviewCount: r.review_count ?? 0,
          }))
        setEntries(list)
      })
      .catch(() => { setErr(true); setEntries([]) })
    return () => stopAudio()
  }, [props.state.learnerId])

  const caughtMap = useMemo(() => {
    const m = new Map<string, DexEntry>()
    for (const e of entries || []) m.set(e.word.toLowerCase(), e)
    return m
  }, [entries])

  if (entries === null || !vocab) {
    return <div className="center-box"><div className="diag-big">🗂️</div><p>도감을 펼치는 중…</p></div>
  }

  const st = dexStats(entries)
  const tierDef = vocab.tiers.find(t => t.tier === tier) || vocab.tiers[0]
  const tierWords: { w: string; ko: string; audio?: string }[] = []
  for (const pid of tierDef.packs) {
    const p = vocab.packs[pid]
    if (!p) continue
    for (const w of p.words) tierWords.push({ w: w.w, ko: w.ko, audio: w.audio_url })
  }
  const tierCaught = tierWords.filter(w => caughtMap.has(w.w.toLowerCase())).length

  return (
    <div className="worldmap" style={{ paddingBottom: 70 }}>
      <header className="topbar">
        <div className="topbar-left">
          <button className="btn ghost" style={{ padding: '4px 10px' }} onClick={props.onExit}>←</button>
          <div><b>🗂️ 단어 도감</b><span className="level-tag">잡은 워드몬 {st.caught.toLocaleString()}마리</span></div>
        </div>
        <div className="topbar-right"><span className="xp-chip">👑 {st.legend}</span></div>
      </header>

      {err && <p style={{ color: '#ff8f7e', fontSize: 13 }}>일부 정보를 불러오지 못했어. 잠시 뒤 다시 열어봐!</p>}

      {/* 진화 단계 분포 — 내 컬렉션의 성장 상태를 한눈에 */}
      <div style={{ background: '#0f1a28', border: '1px solid #21324a', borderRadius: 14, padding: 12, margin: '8px 0 12px' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
          {EVO_STAGES.map((e, k) => (
            <div key={e.stage} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 22 }}>{e.emoji}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: e.color }}>{st.byStage[k]}</div>
              <div style={{ fontSize: 10, opacity: .6 }}>{e.name}</div>
            </div>
          ))}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, opacity: .8, lineHeight: 1.5 }}>
          {st.caught === 0
            ? '아직 잡은 워드몬이 없어. 단어 대륙에서 한 구역만 정복해도 12마리가 한꺼번에 들어와!'
            : `복습 광산에서 만날 때마다 진화해. 👑전설까지 키우면 그 단어는 네 것이 된 거야.`}
        </p>
      </div>

      {/* 티어 선택 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, margin: '0 0 10px' }}>
        {vocab.tiers.map(t => {
          const on = t.tier === tier
          return (
            <button key={t.tier} onClick={() => setTier(t.tier)}
              style={{
                whiteSpace: 'nowrap', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: on ? 800 : 500,
                background: on ? '#1b3a5c' : '#121b27', color: on ? '#eaf1fa' : '#8fa3bb',
                border: `1px solid ${on ? '#3f7fbf' : '#232c3a'}`, borderRadius: 99, padding: '6px 12px',
              }}>T{t.tier} {t.name_ko}</button>
          )
        })}
      </div>

      <p style={{ fontSize: 12, opacity: .75, margin: '0 2px 8px' }}>
        {tierDef.name_ko} — {tierCaught}/{tierWords.length}마리 포획
      </p>

      {/* 워드몬 그리드 — 미포획은 실루엣 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(104px,1fr))', gap: 8 }}>
        {tierWords.map(tw => {
          const got = caughtMap.get(tw.w.toLowerCase())
          if (!got) {
            return (
              <div key={tw.w} style={{
                background: '#111721', border: '1px dashed #232c3a', borderRadius: 12,
                padding: '10px 8px', textAlign: 'center', color: '#43506180',
              }}>
                <div style={{ fontSize: 20, filter: 'grayscale(1)', opacity: .35 }}>❔</div>
                <div style={{ fontSize: 12, marginTop: 6, color: '#4a5768' }}>???</div>
              </div>
            )
          }
          const e = evoOf(got.box)
          return (
            <button key={tw.w}
              onClick={() => tw.audio && playClip({ audio_url: tw.audio, tts: tw.w })}
              style={{
                background: '#0f1a28', border: `1px solid ${e.color}`, borderRadius: 12,
                padding: '10px 8px', textAlign: 'center', cursor: 'pointer', font: 'inherit', color: '#eaf1fa',
              }}>
              <div style={{ fontSize: 20 }}>{e.emoji}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, wordBreak: 'break-word' }}>{tw.w}</div>
              <div style={{ fontSize: 10.5, opacity: .7, marginTop: 2, lineHeight: 1.3 }}>{tw.ko}</div>
              <div style={{ fontSize: 9.5, color: e.color, marginTop: 4 }}>{e.name} · {e.stage}/5</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
