import { useEffect, useState } from 'react'
import { loadModule, type ModuleDef } from '../lib/content'
import { StepRunner, type StepEvent } from '../engine/StepRunner'
import { XP } from '../lib/xp'

export function ModuleSession(props: {
  moduleId: string
  onEvent: (e: StepEvent) => void
  onComplete: (summary: { score: number; xpGained: number; durationSec: number }) => void
  onExit: () => void
}) {
  const [mod, setMod] = useState<ModuleDef | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [phase, setPhase] = useState<'play' | 'reward'>('play')
  const [xpGained, setXpGained] = useState(0)
  const [summary, setSummary] = useState({ total: 0, correct: 0 })
  const [startTs] = useState(Date.now())

  useEffect(() => {
    loadModule(props.moduleId).then(setMod).catch(e => setErr(String(e)))
  }, [props.moduleId])

  if (err) return (
    <div className="center-box">
      <p>앗, 콘텐츠를 불러오지 못했어 😢<br />인터넷 연결을 확인하고 다시 열어줘!</p>
      <button className="btn primary" onClick={props.onExit}>월드맵으로</button>
    </div>
  )
  if (!mod) return <div className="center-box"><p className="loading-msg">⛏️ 광산 입장 중…</p></div>

  if (phase === 'reward') {
    const score = summary.total ? Math.round((summary.correct / summary.total) * 100) : 100
    return (
      <div className="reward">
        <div className="reward-burst">🎉</div>
        <h2>{mod.title_ko} 클리어!</h2>
        <p className="reward-score">정확도 {score}% {score >= 90 ? '— ㄹㅇ 마스터급 👑' : score >= 70 ? '— 실력자 인정 ✨' : '— 복습 광산에서 다시 만나! 💪'}</p>
        <p className="reward-xp">+{xpGained + mod.xp_module_clear} XP</p>
        <button className="btn primary wide" onClick={() => props.onComplete({ score, xpGained: xpGained + mod.xp_module_clear, durationSec: Math.round((Date.now() - startTs) / 1000) })}>
          보상 받기 ⭐
        </button>
      </div>
    )
  }

  return (
    <div className="session">
      <div className="session-head">
        <button className="exit-btn" onClick={props.onExit} aria-label="나가기">✕</button>
        <span className="session-title">{mod.emoji} {mod.title_ko}</span>
      </div>
      <StepRunner
        mod={mod}
        onEvent={e => { setXpGained(x => x + e.xp); props.onEvent(e) }}
        onFinish={s => { setSummary(s); setPhase('reward') }}
      />
    </div>
  )
}

export { XP }
