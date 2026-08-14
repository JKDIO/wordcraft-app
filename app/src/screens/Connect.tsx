import { useState } from 'react'
import { signInWithGoogle, ensureAnonSession, joinFamily, familyLearners, bindLegacyDevice } from '../lib/supabase'
import { InstallGuide } from './InstallGuide'

function hashParams(): URLSearchParams {
  const h = location.hash || ''
  const q = h.includes('?') ? h.slice(h.indexOf('?') + 1) : ''
  return new URLSearchParams(q)
}

/** v2 다가구 연결 화면.
 *  ① 아이별 딥링크(?kid=&name=) → 원터치 연결(문자로 받은 링크). ② 부모(구글) ③ 아이(가족 코드→프로필). */
export function Connect(props: { onConnected: () => void }) {
  const params = hashParams()
  const kidId = params.get('kid')
  const kidName = params.get('name') || '나'

  const [mode, setMode] = useState<'pick' | 'kid'>('pick')
  const [code, setCode] = useState('')
  const [learners, setLearners] = useState<{ id: string; nickname: string }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // ── 아이별 원터치(딥링크) ──
  async function startKidDirect() {
    setBusy(true); setErr(null)
    try {
      await ensureAnonSession() // 이미 연결된 기기가 링크를 다시 열어도 새 계정을 만들지 않는다(L23)
      await bindLegacyDevice(kidId as string)
      props.onConnected()
    } catch { setErr('연결에 실패했어요. 잠시 후 다시 눌러줘!'); setBusy(false) }
  }
  if (kidId) {
    return (
      <div className="center-box">
        <div className="diag-big">🧒</div>
        <h2>{kidName}(으)로 시작하기</h2>
        <p>아래 버튼을 누르면 바로 학습이 시작돼요!</p>
        <button className="btn primary wide" disabled={busy} onClick={startKidDirect}>{busy ? '연결 중…' : `🚀 ${kidName} 시작하기!`}</button>
        {err && <p style={{ color: '#ff8f7e', marginTop: 10 }}>{err}</p>}
        <InstallGuide />
      </div>
    )
  }

  // ── 가족 코드로 아이 연결(수동) ──
  async function lookupCode() {
    setErr(null); setBusy(true)
    try {
      const rows = await familyLearners(code.trim())
      if (!rows.length) { setErr('그 코드의 가족을 못 찾았어요. 코드를 다시 확인해줘! 🔎'); setLearners(null) }
      else setLearners(rows)
    } catch { setErr('연결 중 문제가 생겼어요. 잠시 후 다시 시도!') }
    setBusy(false)
  }
  async function connectKid(learnerId: string) {
    setBusy(true); setErr(null)
    try {
      await ensureAnonSession()
      await joinFamily(code.trim(), 'device', null, learnerId)
      props.onConnected()
    } catch { setErr('연결에 실패했어요. 다시 시도해줘!'); setBusy(false) }
  }

  if (mode === 'pick') {
    return (
      <div className="center-box">
        <div className="diag-big">🔑</div>
        <h2>WordCraft 시작하기</h2>
        <p>누구로 시작할까요?</p>
        <button className="btn primary wide" onClick={() => signInWithGoogle()}>👨‍👩‍👧 부모님 — 구글로 시작</button>
        <button className="btn secondary wide" onClick={() => setMode('kid')}>🧒 아이 — 가족 코드로 연결</button>
      </div>
    )
  }
  return (
    <div className="center-box">
      <div className="diag-big">🧒</div>
      <h2>가족 코드 연결</h2>
      {!learners ? (
        <>
          <p>부모님이 알려준 <b>가족 코드</b>를 입력해줘!</p>
          <input
            value={code}
            onChange={(e: { target: { value: string } }) => setCode(e.target.value.toUpperCase())}
            placeholder="예: JINYOUNG-3607"
            style={{ width: '100%', maxWidth: 320, padding: '12px 14px', fontSize: 18, textAlign: 'center', letterSpacing: 1, borderRadius: 12, border: '1px solid #2a3a4f', background: '#0f1a28', color: '#eaf1fa', margin: '8px 0' }}
          />
          <button className="btn primary wide" disabled={busy || !code.trim()} onClick={lookupCode}>{busy ? '확인 중…' : '다음 →'}</button>
        </>
      ) : (
        <>
          <p>누구야? 이름을 골라줘! 👇</p>
          {learners.map(l => (
            <button key={l.id} className="btn secondary wide" disabled={busy} onClick={() => connectKid(l.id)}>🧒 {l.nickname}</button>
          ))}
        </>
      )}
      {err && <p style={{ color: '#ff8f7e', marginTop: 10 }}>{err}</p>}
      <button className="btn ghost wide" onClick={() => { setMode('pick'); setLearners(null); setErr(null) }}>← 뒤로</button>
    </div>
  )
}
