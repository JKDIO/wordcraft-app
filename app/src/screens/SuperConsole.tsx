import { useEffect, useState } from 'react'
import {
  getAuthUser, signInWithGoogle, signOut, isOwner,
  adminListFamilies, adminCreateFamily, adminUpdateFamily, type AdminFamily,
} from '../lib/supabase'

/** Phase 5 — 슈퍼관리자(가족 관리) 콘솔. 소유자(Dio)만 접근.
 *  가족 생성(이름+공유코드) · 가족에 아이 추가 · 코드/연결링크 공유. 백엔드는 소유자 게이트 RPC. */
const CONNECT_URL = location.origin + '/#/connect'

export function SuperConsole() {
  const [phase, setPhase] = useState<'loading' | 'login' | 'denied' | 'ready'>('loading')
  const [families, setFamilies] = useState<AdminFamily[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  // 새 가족 폼
  const [fName, setFName] = useState('')
  const [fParent, setFParent] = useState('')
  const [fCode, setFCode] = useState('')
  // v1.4.16 가족 정보 수정
  const [editId, setEditId] = useState<string | null>(null)
  const [eName, setEName] = useState('')
  const [eParent, setEParent] = useState('')

  async function refresh() {
    try { setFamilies(await adminListFamilies()) } catch { setErr('목록을 불러오지 못했어요.') }
  }
  async function boot() {
    setErr(null)
    const user = await getAuthUser()
    if (!user || user.is_anonymous) { setPhase('login'); return }
    if (!(await isOwner())) { setPhase('denied'); return }
    await refresh(); setPhase('ready')
  }
  useEffect(() => { void boot() }, [])

  function login() {
    try { localStorage.setItem('wc_after_login', 'super') } catch { /* */ }
    signInWithGoogle()
  }
  async function logout() { setBusy(true); try { await signOut() } catch { /* */ } location.hash = ''; location.reload() }

  function copy(text: string, tag: string) {
    try { void navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(null), 1500) } catch { /* */ }
  }

  async function saveFamily(id: string) {
    setBusy(true); setErr(null)
    try { await adminUpdateFamily(id, eName, eParent); setEditId(null); await refresh() }
    catch { setErr('가족 정보 수정 실패 — 다시 시도해줘.') }
    setBusy(false)
  }

  async function createFamily() {
    if (!fName.trim() || !fCode.trim()) return
    setBusy(true); setErr(null)
    try { await adminCreateFamily(fName.trim(), fCode.trim(), fParent.trim()); setFName(''); setFParent(''); setFCode(''); await refresh() }
    catch (e) { setErr(String(e).includes('code exists') ? '이미 쓰는 코드예요. 다른 코드로!' : '가족 생성 실패 — 다시 시도해줘.') }
    setBusy(false)
  }

  if (phase === 'loading') return <div className="center-box"><div className="diag-big">🛠️</div><p>불러오는 중…</p></div>

  if (phase === 'login') return (
    <div className="center-box">
      <div className="diag-big">🛠️</div>
      <h2>슈퍼 관리실</h2>
      <p>가족·아이를 만들려면 <b>소유자 구글 계정</b>으로 로그인해줘.</p>
      <button className="btn primary wide" onClick={login}>👤 구글로 로그인</button>
    </div>
  )
  if (phase === 'denied') return (
    <div className="center-box">
      <div className="diag-big">🔒</div>
      <h2>권한이 없어요</h2>
      <p>이 계정은 슈퍼관리자가 아니에요. 소유자 계정으로 다시 로그인해줘.</p>
      <button className="btn ghost wide" onClick={logout}>다른 계정으로 로그인</button>
    </div>
  )

  const inputStyle = { padding: '10px 12px', fontSize: 15, borderRadius: 10, border: '1px solid #2a3a4f', background: '#0f1a28', color: '#eaf1fa' } as const
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 14px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>🛠️ 슈퍼 관리실 <span style={{ opacity: 0.6, fontSize: 13 }}>· 가족 관리</span></h1>
        <button className="btn ghost" onClick={logout}>로그아웃</button>
      </header>
      <p style={{ opacity: 0.8, fontSize: 13, marginTop: 0 }}>새 가족을 만들고 아이를 추가한 뒤, <b>연결 링크 + 가족 코드</b>를 그 가족에게 전달하면 됩니다.</p>

      {/* 새 가족 만들기 */}
      <section style={{ background: '#111b28', border: '1px solid #21324a', borderRadius: 14, padding: 14, margin: '12px 0' }}>
        <h3 style={{ margin: '0 0 8px' }}>➕ 새 가족 만들기</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...inputStyle, flex: '1 1 150px' }} placeholder="가족 이름 (예: 진영이네)" value={fName} onChange={(e: { target: { value: string } }) => setFName(e.target.value)} />
          <input style={{ ...inputStyle, flex: '1 1 120px' }} placeholder="부모 이름 (예: 진영)" value={fParent} onChange={(e: { target: { value: string } }) => setFParent(e.target.value)} />
          <input style={{ ...inputStyle, flex: '1 1 150px' }} placeholder="부모 코드 (예: JINYOUNG-3607)" value={fCode} onChange={(e: { target: { value: string } }) => setFCode(e.target.value.toUpperCase())} />
          <button className="btn primary" disabled={busy || !fName.trim() || !fCode.trim()} onClick={createFamily}>만들기</button>
        </div>
        <p style={{ opacity: 0.6, fontSize: 12, margin: '6px 0 0' }}>가족을 만들고 <b>부모 초대문구</b>를 그 부모에게 보내면, 이후 아이 등록·링크 전달은 부모가 직접 합니다.</p>
      </section>

      {err && <p style={{ color: '#ff8f7e' }}>{err}</p>}

      {/* 가족 목록 */}
      {families.length === 0 ? <p style={{ opacity: 0.7 }}>아직 가족이 없어요. 위에서 첫 가족을 만들어봐!</p> : families.map(f => {
        const invite = `${f.name} — WordCraft 초대!\n① 아래 링크 열기 → "부모님 — 구글로 시작"\n② 가족 코드 입력: ${f.join_code}\n${CONNECT_URL}\n\n로그인하면 아이를 등록하고, 아이별 링크를 문자로 보낼 수 있어요.`
        return (
          <section key={f.id} style={{ background: '#0f1a28', border: '1px solid #21324a', borderRadius: 14, padding: 14, margin: '10px 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <h3 style={{ margin: 0 }}>👨‍👩‍👧 {f.name} {f.parent_name ? <span style={{ opacity: 0.75, fontSize: 14, fontWeight: 400 }}>· 부모: {f.parent_name}</span> : <span style={{ opacity: 0.55, fontSize: 13, fontWeight: 400 }}>· 부모 이름 미입력</span>}</h3>
              <code style={{ background: '#1b2a3d', padding: '3px 8px', borderRadius: 8, letterSpacing: 1 }}>{f.join_code}</code>
            </div>

            {/* v1.4.16 — 보호자 연결 현황. 여기가 비어 있으면 그 가족은 아직 앱을 한 번도 열지 않은 것이다. */}
            {(() => {
              const gs = f.guardians || []
              return gs.length === 0
                ? <div style={{ background: '#3a2a12', border: '1px solid #6b4a15', borderRadius: 10, padding: '8px 10px', margin: '8px 0', fontSize: 13 }}>
                    ⚠️ <b>보호자 미연결</b> — 이 가족은 아직 한 번도 로그인하지 않았어요. 초대문구를 다시 보내주세요.
                  </div>
                : <div style={{ fontSize: 12, opacity: 0.85, margin: '8px 0' }}>
                    ✅ 보호자 {gs.length}명 연결됨 · {gs.map(g => `${g.relation || g.role} (${g.who}, ${String(g.joined_at).slice(0, 10)})`).join(' · ')}
                    {typeof f.device_count === 'number' ? ` · 아이 기기 ${f.device_count}대` : ''}
                  </div>
            })()}

            {editId === f.id
              ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
                  <input style={{ ...inputStyle, flex: '1 1 140px' }} placeholder="가족 이름" value={eName} onChange={(e: { target: { value: string } }) => setEName(e.target.value)} />
                  <input style={{ ...inputStyle, flex: '1 1 120px' }} placeholder="부모 이름" value={eParent} onChange={(e: { target: { value: string } }) => setEParent(e.target.value)} />
                  <button className="btn primary" disabled={busy} onClick={() => saveFamily(f.id)}>저장</button>
                  <button className="btn ghost" onClick={() => setEditId(null)}>취소</button>
                </div>
              : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
              <button className="btn primary" onClick={() => copy(invite, 'inv-' + f.id)}>{copied === 'inv-' + f.id ? '복사됨 ✓ (부모에게 전달)' : '📩 부모 초대문구 복사'}</button>
              <button className="btn ghost" onClick={() => copy(f.join_code, 'code-' + f.id)}>{copied === 'code-' + f.id ? '복사됨 ✓' : '코드만 복사'}</button>
              <button className="btn ghost" onClick={() => { setEditId(editId === f.id ? null : f.id); setEName(f.name); setEParent(f.parent_name || '') }}>✏️ 가족 정보 수정</button>
            </div>
            <div style={{ margin: '6px 0' }}>
              <b style={{ fontSize: 13, opacity: 0.85 }}>아이 ({f.learners.length}) <span style={{ fontWeight: 400, opacity: 0.6 }}>— 등록·링크 전달은 부모가 직접</span></b>
              {f.learners.length === 0
                ? <p style={{ opacity: 0.6, fontSize: 13, margin: '4px 0' }}>아직 없음 (부모가 로그인 후 등록)</p>
                : <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{f.learners.map(l => <li key={l.id}>🧒 {l.nickname} <span style={{ opacity: 0.6, fontSize: 12 }}>· Lv.{l.level} · {l.xp.toLocaleString()}XP</span></li>)}</ul>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
