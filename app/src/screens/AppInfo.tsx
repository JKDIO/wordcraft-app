import { APP_VERSION, type VersionInfo } from '../lib/version'

/* 정보 화면 (하단 내비 4번째 'ℹ️ 정보') — 아빠의 메시지 + 버전/원격 업데이트
   - 아빠의 메시지: 이 앱을 왜/어떻게 만들었는지, 예한이 응원
   - 버전 정보: 현재 vs 서버 /version.json 비교 → 새 버전이면 '지금 업데이트'(reload)
   - 업데이트 존재 시 하단 내비 '정보' 버튼에 ! 뱃지 (App.tsx) */

export function AppInfo(props: {
  latest: VersionInfo | null
  checking: boolean
  rechecking: boolean
  updateAvailable: boolean
  onUpdate: () => void
  onRecheck: () => void
}) {
  const { latest, checking, rechecking, updateAvailable } = props
  return (
    <div className="appinfo">
      <div className="ai-hero">
        <img className="ai-icon" src="/sp-learner.png" alt="" draggable={false} />
        <h1 className="ai-name">WordCraft</h1>
        <p className="ai-tag">예한이의 영어 모험 ⛏️</p>
      </div>

      <div className="ai-card">
        <h3 className="ai-h">이 앱은?</h3>
        <p className="ai-p">
          이건 하면 <b>무조건 늘어.</b> 파닉스·문법·단어·회화가 실력이 쌓이는 순서 그대로
          들어있거든. 매일 한 판씩만 캐도 영어가 <b>확실히</b> 늘고, 꾸준히만 하면{' '}
          <b>중학교 영어</b>도 거뜬해!
        </p>
        <p className="ai-p ai-love">
          예한이가 기본을 다져서 영어 실력이 쑥쑥 늘 수 있도록 아빠가 고민해서 열심히 만들었어!{' '}
          <b>아들 화이팅!</b> ❤️
        </p>
      </div>

      <div className="ai-card">
        <h3 className="ai-h">버전 정보</h3>
        <div className="ai-row">
          <span>현재 버전</span>
          <b>v{APP_VERSION}</b>
        </div>
        <div className="ai-row">
          <span>최신 버전</span>
          <b>{checking ? '확인 중…' : latest ? `v${latest.version}` : '확인 불가'}</b>
        </div>
        <div className={`ai-status ${checking ? 'wait' : updateAvailable ? 'old' : latest ? 'ok' : 'wait'}`}>
          {checking
            ? '⏳ 버전 확인 중…'
            : updateAvailable
              ? '🔔 새 버전이 있어요!'
              : latest
                ? '✓ 최신 버전을 쓰고 있어요'
                : '📴 지금은 확인할 수 없어요 (인터넷 확인)'}
        </div>
        {updateAvailable && latest?.notes && <p className="ai-notes">🆕 {latest.notes}</p>}
        <button className="ai-btn ai-update" disabled={!updateAvailable} onClick={props.onUpdate}>
          {updateAvailable ? '⬇  지금 업데이트' : '업데이트 없음'}
        </button>
        <button className="ai-btn ai-recheck" onClick={props.onRecheck} disabled={rechecking || checking}>
          {rechecking ? '확인 중…' : '↻  다시 확인'}
        </button>
      </div>

      <p className="ai-foot">
        아빠가 예한이를 위해 만든 앱 💙
        <br />
        WordCraft
      </p>
    </div>
  )
}
