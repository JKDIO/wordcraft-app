import { useState } from 'react'
import { APP_VERSION, type VersionInfo } from '../lib/version'
// v1.4.40 — 전송 못 하고 버려진 기록을 눈에 보이게 한다(조용한 유실 금지).
import { getDeadLetters, clearDeadLetters } from '../lib/store'
// ★v1.4.46★ 기기 역할(C5) · 실기기 자가진단(L8) — 아빠가 눈으로 확인해야 했던 것을 앱이 대신 말한다.
import { deviceRole, setDeviceRole, blockedWrites, isMobileUA } from '../lib/device'
import { collectSelfCheck } from '../lib/selfCheck'

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
  /* ★v1.4.40★ 오프라인 큐가 버린 기록. 예전에는 4xx를 전부 "재시도 무의미"로 보고
     `answer_events`까지 조용히 지웠다 — 아무 흔적도 남지 않아 아무도 몰랐다.
     이제 진짜로 버릴 것만 버리고, 버린 것은 **여기서 보인다**. */
  const [dead, setDead] = useState(() => getDeadLetters())
  /* ★v1.4.46★ 이 기기가 지금 무엇인지, 그리고 실기기에서 무엇이 실제로 관측됐는지.
     여덟 릴리스 동안 "예한이 폰에서 30초만 봐 주세요"로 남아 있던 칸을 앱이 스스로 채운다. */
  const [role, setRole] = useState(() => deviceRole())
  const [chk, setChk] = useState(() => collectSelfCheck() as Record<string, unknown>)
  const S = (k: string) => String(chk[k] ?? '')
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

      {dead.length > 0 && (
        <div className="ai-card">
          <h3 className="ai-h">📮 전송하지 못한 기록</h3>
          <p className="ai-p">
            서버에 보내지 못한 기록이 <b>{dead.length}건</b> 있어요. 학습은 정상이지만
            아빠 관제실 숫자에는 이 기록이 빠져 있을 수 있어요.
          </p>
          <div className="ai-row"><span>가장 최근</span><b>{dead[dead.length - 1].table}</b></div>
          <p className="ai-notes">{dead[dead.length - 1].error}</p>
          <button className="ai-btn ai-recheck" onClick={() => { clearDeadLetters(); setDead([]) }}>
            확인했어요 (목록 비우기)
          </button>
        </div>
      )}

      <div className="ai-card">
        <h3 className="ai-h">🖥️ 이 기기</h3>
        <div className="ai-row">
          <span>역할</span>
          <b>{role === 'learner' ? '학습 기기 (기록 저장함)' : '구경 모드 (기록 저장 안 함)'}</b>
        </div>
        <div className="ai-row"><span>종류</span><b>{isMobileUA() ? '📱 모바일' : '💻 컴퓨터'}</b></div>
        {role === 'observer' && blockedWrites() > 0 && (
          <div className="ai-row"><span>저장 안 한 기록</span><b>{blockedWrites()}건</b></div>
        )}
        <p className="ai-notes">
          컴퓨터는 기본이 <b>구경 모드</b>예요. 아빠가 화면을 확인해도 아이 기록이 더럽혀지지 않게 하려는 거예요.
          (2026-08-18 기준, 컴퓨터에서 만들어진 학습 세션 75건 중 최근 30건은 문항이 0개였어요.)
        </p>
        <button
          className="ai-btn ai-recheck"
          onClick={() => { const next = role === 'learner' ? 'observer' : 'learner'; setDeviceRole(next); setRole(next) }}
        >
          {role === 'learner' ? '👀 구경 모드로 바꾸기' : '⛏️ 학습 기기로 바꾸기'}
        </button>
      </div>

      <div className="wc-selfcheck">
        <h4>🔬 실기기 자가진단</h4>
        <dl>
          <dt>소리 경로</dt><dd>{S('native') === 'true' ? '앱 내장(네이티브) TTS' : '브라우저 TTS'}{S('tts_available') === 'true' ? '' : ' — 사용 불가'}</dd>
          <dt>목소리 수</dt><dd className={Number(chk.voices) === 0 && S('native') !== 'true' ? 'warn' : ''}>{S('voices')}</dd>
          <dt>마지막 발화</dt><dd className={['web_silent', 'web_error', 'unavailable'].includes(S('speech')) ? 'warn' : ''}>{S('speech')} ({S('speech_attempts')}회 시도)</dd>
          <dt>글자 크기</dt><dd className={S('boosted') === 'true' ? 'warn' : ''}>지정 {S('boost_spec')}px → 실제 {S('boost_real')}px{S('boosted') === 'true' ? ' (부스팅 발생)' : ''}</dd>
          <dt>화면 전환 감지</dt><dd>{S('vis_supported') === 'true' ? '지원' : '미지원'}{S('vis_fired') === 'true' ? ' · 이번에 발생함' : ' · 아직 없음'}</dd>
          <dt>기기 저장소</dt><dd className={S('storage_broken') === 'true' ? 'warn' : ''}>{S('storage_broken') === 'true' ? '저장 실패한 적 있음' : '정상'}</dd>
          <dt>화면</dt><dd>{S('vw')}×{S('vh')} @{S('dpr')}x · {S('tz')}</dd>
        </dl>
        <p className="note">
          이 값은 하루 한 번 자동으로 아빠에게 보고돼요. 다만 <b>스피커에서 진짜로 소리가 났는지는 앱이 알 수 없어요</b> —
          그건 예한이만 알아요. 안 들리면 아빠한테 말해줘! 🔊
        </p>
        <button className="ai-btn ai-recheck" onClick={() => setChk(collectSelfCheck() as Record<string, unknown>)}>↻ 지금 다시 재기</button>
      </div>

      <p className="ai-foot">
        아빠가 예한이를 위해 만든 앱 💙
        <br />
        WordCraft
      </p>
    </div>
  )
}
