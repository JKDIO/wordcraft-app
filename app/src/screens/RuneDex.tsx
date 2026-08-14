// v1.3.0 룬 크리스탈 도감 (CONTRACT v1.3 §11) — 수정 동굴(R*) 완료 모듈의 룬 수집 표시.
// 별도 테이블 없음: module_progress(완료 여부) + 콘텐츠 runes[]에서 파생.
import { useEffect, useState } from 'react'
import { RUNE_MODULES, loadModule, type RuneDef } from '../lib/content'
import type { LocalState } from '../lib/store'
import { playClip, stopAudio } from '../lib/audio'
import { runeArtOf } from '../lib/runeArt'

interface RuneEntry extends RuneDef { module_id: string; collected: boolean }

export function RuneDex(props: { state: LocalState; onExit: () => void }) {
  const [runes, setRunes] = useState<RuneEntry[]>([])
  const [open, setOpen] = useState<RuneEntry | null>(null)

  useEffect(() => {
    ;(async () => {
      const all: RuneEntry[] = []
      for (const id of RUNE_MODULES) {
        try {
          const m = await loadModule(id)
          const st = props.state.progress[id]?.status
          const collected = st === 'completed' || st === 'mastered'
          for (const r of m.runes || []) all.push({ ...r, module_id: id, collected })
        } catch { /* 미제작 챕터 */ }
      }
      setRunes(all)
    })()
    return () => stopAudio() // v1.4.14: 도감을 나가면 룬 소리도 함께 정지
  }, [])

  const got = runes.filter(r => r.collected).length

  return (
    <div className="runedex">
      <header className="runedex-head">
        <button className="btn-back" onClick={props.onExit}>←</button>
        <div>
          <h2>💎 소리의 룬 도감</h2>
          <p>{got}/{runes.length} 수집 — 룬을 읽는 자는 어떤 단어든 소리를 열 수 있다!</p>
        </div>
      </header>
      <div className="runedex-grid">
        {runes.map((r, i) => (
          <button
            key={`${r.module_id}-${r.ipa}-${i}`}
            className={`rune-crystal ${r.collected ? 'got' : 'locked'}`}
            onClick={() => r.collected && setOpen(r)}
          >
            <span className="rune-ipa">{r.collected ? `/${r.ipa}/` : '?'}</span>
            <span className="rune-name">{r.collected ? r.name_ko : '???'}</span>
          </button>
        ))}
      </div>
      {runes.length === 0 && <p className="runedex-empty">수정 동굴에 들어가면 룬이 여기 모여!</p>}
      {open && (
        <div className="rune-modal-overlay" onClick={() => setOpen(null)}>
          <div className="rune-modal" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
            <p className="rune-modal-ipa">/{open.ipa}/</p>
            <h3>{open.name_ko}</h3>
            {(() => {
              const art = runeArtOf(open.art_key)
              return art ? (
                <>
                  <div className="mouth-art-svg" dangerouslySetInnerHTML={{ __html: art.svg }} />
                  <p className="mouth-art-hint">👄 {art.hint_ko}</p>
                </>
              ) : null
            })()}
            <button className="example-chip big" onClick={() => playClip({ audio_url: open.audio_url, tts: open.tts || open.example })}>
              <b>{open.example}</b> {open.example_ko ? <span>{open.example_ko}</span> : null} 🔊
            </button>
            {open.tip_ko && <p className="learncard-tip">💡 {open.tip_ko}</p>}
            <button className="btn primary wide" onClick={() => setOpen(null)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}
