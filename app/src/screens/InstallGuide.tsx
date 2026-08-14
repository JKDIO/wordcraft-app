/** 설치·사용 가이드 — 카카오톡 인앱브라우저는 소리가 안 나므로(WebView) 문자(SMS) 링크를 브라우저로 열고 홈화면에 추가하도록 안내. */
export function InstallGuide(props: { onClose?: () => void; compact?: boolean }) {
  const ua = navigator.userAgent || ''
  const isIOS = /iPhone|iPad|iPod/.test(ua)
  const inKakao = /KAKAOTALK/i.test(ua)
  return (
    <div style={{ background: '#0f1a28', border: '1px solid #21324a', borderRadius: 14, padding: 16, textAlign: 'left', maxWidth: 440, margin: '10px auto' }}>
      <h3 style={{ margin: '0 0 8px' }}>📱 이렇게 열어야 소리가 나요!</h3>
      {inKakao && (
        <p style={{ background: '#3a1d1d', border: '1px solid #6b2b2b', color: '#ffb3a7', borderRadius: 10, padding: '8px 10px', margin: '0 0 10px', fontWeight: 700 }}>
          ⚠️ 지금 카카오톡 안에서 열렸어요 — 여기선 소리가 안 나요! 오른쪽 위 <b>⋮ → "다른 브라우저로 열기"</b> 를 눌러 크롬/사파리로 열어주세요.
        </p>
      )}
      <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
        <li><b>카카오톡으로 열지 말기.</b> <b>문자(SMS)</b>로 받은 링크를 눌러 여세요. (카톡 안에서는 소리가 안 나요.)</li>
        <li>{isIOS ? '사파리(Safari)' : '크롬(Chrome)'} 로 열렸는지 확인 (주소창이 보이면 OK).</li>
        <li>{isIOS
          ? <>아래 <b>공유 버튼(⬆️)</b> → <b>"홈 화면에 추가"</b></>
          : <>오른쪽 위 <b>⋮ 메뉴</b> → <b>"홈 화면에 추가"</b>(또는 "앱 설치")</>} 를 눌러 설치.</li>
        <li>홈 화면에 생긴 <b>아이콘으로 열면</b> 앱처럼 전체화면 + 소리도 정상! 🎧</li>
      </ol>
      {props.onClose && <button className="btn ghost wide" style={{ marginTop: 12 }} onClick={props.onClose}>알겠어요</button>}
    </div>
  )
}
