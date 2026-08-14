// v1.4.28 ⚔️ 룬 장비창 — 뱃지 전체를 한 그림으로 (내 정보 화면 뱃지 도감 최상단)
//
// 왜 이걸 만드나 (Dio님): "가장 상단에서 모든 뱃지들을 한눈에, 한 그림에 볼 수 있어야 한다."
// 도감은 59칸짜리 목록이라 '내가 지금 얼마나 강해졌는지'가 안 보인다. 장비창은 그걸 **한 장면**으로 답한다.
//
// 규칙은 lib/loadout.ts 단일 원천. 이 파일은 그리기만 한다.
import { BADGE_DEFS, GROUP_EMOJI, type BadgeGroup } from '../lib/badges'
import {
  LOADOUT_SLOTS, slotTier, TIER_NAME, TIER_STYLE,
  heroStage, heroShadow, HERO_TITLE, HERO_SUB, HERO_W, HERO_H, isComplete, COMPLETE_TITLE, COMPLETE_SUB,
} from '../lib/loadout'

const PX = 7 // 픽셀 한 칸 크기 → 영웅 84×112

export function BadgeLoadout(props: { earned: string[]; onPickGroup: (g: BadgeGroup) => void }) {
  const earned = new Set(props.earned)
  const all = Object.entries(BADGE_DEFS)
  const total = all.length
  const got = all.filter(([id]) => earned.has(id)).length
  const stage = heroStage(got, total)
  const pct = total ? Math.round((got / total) * 100) : 0
  const legendary = isComplete(got, total)

  const counts = LOADOUT_SLOTS.map(sl => {
    const ids = all.filter(([, b]) => b.group === sl.group)
    return { ...sl, got: ids.filter(([id]) => earned.has(id)).length, total: ids.length }
  })

  return (
    <div className="loadout" data-stage={stage} data-complete={legendary ? 1 : 0}>
      <div className="loadout-stage">
        {/* 마법진 — 소환진과 같은 세계관. 단계가 오를수록 빠르고 밝게 돈다 */}
        <div className="loadout-ring" />
        <div className="loadout-hero" style={{ width: HERO_W * PX, height: HERO_H * PX }}>
          <i style={{ width: PX, height: PX, boxShadow: heroShadow(stage, PX) }} />
        </div>
        {legendary && <div className="loadout-burst" />}
      </div>

      <div className="loadout-name">
        <b>{legendary ? COMPLETE_TITLE : HERO_TITLE[stage]}</b>
        <span>{legendary ? COMPLETE_SUB : HERO_SUB[stage]}</span>
      </div>

      <div className="loadout-bar">
        <i style={{ width: `${pct}%` }} />
        <em>{got}/{total} · {pct}%</em>
      </div>

      <div className="loadout-slots">
        {counts.map(sl => {
          const t = slotTier(sl.got, sl.total)
          const st = TIER_STYLE[t]
          return (
            <button key={sl.group} className={`loadout-slot t${t}`}
              style={{ borderColor: st.border, background: st.bg, boxShadow: st.glow }}
              onClick={() => props.onPickGroup(sl.group)}
              title={`${sl.part} — ${TIER_NAME[t]} (${sl.got}/${sl.total})`}>
              <span className="ls-em" style={{ filter: t === 0 ? 'grayscale(1) opacity(.4)' : 'none' }}>{sl.emoji}</span>
              <span className="ls-part" style={{ color: st.text }}>{sl.part}</span>
              <span className="ls-cnt" style={{ color: st.text }}>{sl.got}/{sl.total}</span>
              <span className="ls-grp">{GROUP_EMOJI[sl.group]}</span>
            </button>
          )
        })}
      </div>
      <p className="loadout-tip">
        {legendary
          ? '⚔️ 풀세트 완성 — 더 넣을 자리가 없다'
          : '⚔️ 장비를 누르면 그 분야 뱃지로 바로 간다. 뱃지를 딸수록 장비가 자란다'}
      </p>
    </div>
  )
}
