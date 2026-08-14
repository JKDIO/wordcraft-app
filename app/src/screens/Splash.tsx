import { useEffect, useState } from 'react'

/* 스플래시 2종 (7/14 제작 · 7/15 아이콘 버전) — learner '광산 모험' / admin '관제실'
   - 앱스토어급 인트로: 아이콘 글로우 + 샤인 + 스파크 버스트 + 타이틀
   - 3초 자동 종료(2.5초에 퇴장 시작), 탭/건너뛰기로 즉시 스킵, prefers-reduced-motion 존중 */

const REDUCED = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const SPARK_ANGLES = [-70, -30, 15, 55, 100, 145, 200, 250]

export function Splash(props: { variant: 'learner' | 'admin'; onDone: () => void }) {
  const { variant, onDone } = props
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (REDUCED) { onDone(); return }
    const a = setTimeout(() => setLeaving(true), 2500)
    const b = setTimeout(onDone, 3000)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [])

  function skip() {
    setLeaving(true)
    setTimeout(onDone, 260)
  }

  if (REDUCED) return null
  const icon = variant === 'admin' ? '/sp-admin.png' : '/sp-learner.png'

  return (
    <div
      className={`splash splash-${variant}${leaving ? ' splash-leave' : ''}`}
      onClick={skip}
      role="img"
      aria-label={variant === 'admin' ? 'WordCraft 관제 시스템' : 'WordCraft 광산 모험'}
    >
      <span className="sp-star" style={{ left: '16%', top: '20%' }} />
      <span className="sp-star" style={{ left: '82%', top: '22%' }} />
      <span className="sp-star" style={{ left: '74%', top: '14%' }} />
      <span className="sp-star" style={{ left: '22%', top: '30%' }} />
      <div className="sp-iconwrap">
        <div className="sp-iconglow" />
        <div className="sp-iconbox">
          <img className="sp-icon" src={icon} alt="" draggable={false} />
          <div className="sp-shine" />
        </div>
        <div className="sp-burst">
          {SPARK_ANGLES.map((deg, i) => (
            <i key={i} className="sp-spark" style={{ ['--a']: `${deg}deg`, animationDelay: `${0.5 + (i % 4) * 0.03}s` } as Record<string, string>} />
          ))}
        </div>
      </div>
      <div className="sp-titlewrap">
        <div className={`sp-title${variant === 'admin' ? ' sp-title-admin' : ''}`}>
          {variant === 'admin' ? '관제실' : 'WordCraft'}
        </div>
        <div className={`sp-sub${variant === 'admin' ? ' sp-sub-admin' : ''}`}>
          {variant === 'admin' ? 'WordCraft Control Room' : '예한이의 영어 모험 ⛏️'}
        </div>
      </div>
      <button className="splash-skip" onClick={skip}>건너뛰기 ›</button>
    </div>
  )
}
