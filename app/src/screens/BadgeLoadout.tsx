// v1.4.32 ⚔️ 룬 장비창 — 뱃지 전체를 한 그림으로 (내 정보 화면 뱃지 도감 최상단)
//
// 왜 이걸 만드나 (Dio님): "가장 상단에서 모든 뱃지들을 한눈에, 한 그림에 볼 수 있어야 한다."
// 도감은 71칸짜리 목록이라 '내가 지금 얼마나 강해졌는지'가 안 보인다. 장비창은 그걸 **한 장면**으로 답한다.
//
// v1.4.31: 12×16 팔레트 스왑 → **128×128 부위 레이어 조립**. 카테고리별 달성률이 그 부위의 등급을 정한다.
//   그래서 '문장과 문법' 뱃지를 따면 검만 바뀌고, '읽기의 눈'을 따면 투구만 바뀐다.
// v1.4.32: 장비칸 순서를 뱃지 도감과 일치시키고, 분야 이름을 장비 아래에 직접 적는다(Dio님 지적).
//
// 규칙은 lib/loadout.ts + lib/heroSprite.ts 단일 원천. 이 파일은 그리기만 한다.
import { useEffect, useState } from 'react'
import { BADGE_DEFS, GROUP_EMOJI, type BadgeGroup } from '../lib/badges'
import {
  LOADOUT_SLOTS, slotTier, TIER_NAME, TIER_STYLE,
  heroStage, heroShadow, HERO_TITLE, HERO_SUB, HERO_W, HERO_H, isComplete, COMPLETE_TITLE, COMPLETE_SUB,
} from '../lib/loadout'
import { SLOT_KEY, Z_ORDER, heroBaseUrl, heroLayerUrl, warmHeroArt } from '../lib/heroSprite'

const PX = 7          // 폴백 픽셀 한 칸 → 영웅 84×112
const ART = 150       // 스프라이트 표시 크기(px). 128의 배수가 아니어도 pixelated면 깨지지 않는다

export function BadgeLoadout(props: { earned: string[]; onPickGroup: (g: BadgeGroup) => void }) {
  const earned = new Set(props.earned)
  const all = Object.entries(BADGE_DEFS)
  const total = all.length
  const got = all.filter(([id]) => earned.has(id)).length
  const stage = heroStage(got, total)
  const pct = total ? Math.round((got / total) * 100) : 0
  const legendary = isComplete(got, total)

  // 그림을 못 받으면(비행기모드·CDN 장애) 예전 픽셀 영웅으로 물러난다.
  // 보상 화면이 빈 칸으로 남는 것보다 낫다.
  const [artOk, setArtOk] = useState(true)
  useEffect(() => { warmHeroArt() }, [])

  const counts = LOADOUT_SLOTS.map(sl => {
    const ids = all.filter(([, b]) => b.group === sl.group)
    const g = ids.filter(([id]) => earned.has(id)).length
    return { ...sl, got: g, total: ids.length, tier: slotTier(g, ids.length) }
  })
  const tierOf = (group: BadgeGroup) => counts.find(c => c.group === group)?.tier ?? 0

  return (
    <div className="loadout" data-stage={stage} data-complete={legendary ? 1 : 0}>
      <div className="loadout-stage">
        {/* 마법진 — 소환진과 같은 세계관. 단계가 오를수록 빠르고 밝게 돈다 */}
        <div className="loadout-ring" />

        {artOk ? (
          <div className="loadout-art" style={{ width: ART, height: ART }}>
            <img src={heroBaseUrl()} alt="" onError={() => setArtOk(false)} />
            {Z_ORDER.map(key => {
              const group = (Object.keys(SLOT_KEY) as BadgeGroup[]).find(g => SLOT_KEY[g] === key)
              const t = group ? tierOf(group) : 0
              if (!t) return null
              return <img key={key} src={heroLayerUrl(key, t as 1 | 2 | 3 | 4)} alt="" />
            })}
          </div>
        ) : (
          <div className="loadout-hero" style={{ width: HERO_W * PX, height: HERO_H * PX }}>
            <i style={{ width: PX, height: PX, boxShadow: heroShadow(stage, PX) }} />
          </div>
        )}

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
          const t = sl.tier
          const st = TIER_STYLE[t]
          return (
            <button key={sl.group} className={`loadout-slot t${t}`}
              style={{ borderColor: st.border, background: st.bg, boxShadow: st.glow }}
              onClick={() => props.onPickGroup(sl.group)}
              title={`${sl.part} — ${TIER_NAME[t]} (${sl.group} ${sl.got}/${sl.total})`}>
              <span className="ls-em" style={{ filter: t === 0 ? 'grayscale(1) opacity(.4)' : 'none' }}>{sl.emoji}</span>
              <span className="ls-part" style={{ color: st.text }}>{sl.part}</span>
              {/* ★분야 이름을 장비 아래에 붙여 둔다★ (Dio님 지적) — 이모지 하나로는 어느 분야인지 안 읽힌다 */}
              <span className="ls-grp">{GROUP_EMOJI[sl.group]} {sl.group}</span>
              <span className="ls-cnt" style={{ color: st.text }}>{sl.got}/{sl.total}</span>
            </button>
          )
        })}
      </div>
      <p className="loadout-tip">
        {legendary
          ? '⚔️ 풀세트 완성 — 더 넣을 자리가 없다'
          : '⚔️ 장비를 누르면 그 분야 뱃지로 바로 간다. 그 분야를 채우면 그 장비만 자란다'}
      </p>
    </div>
  )
}
