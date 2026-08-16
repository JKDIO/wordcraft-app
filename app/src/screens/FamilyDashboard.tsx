import { useEffect, useState } from 'react'
import {
  getAuthUser, guardianFamily, guardianAddLearner, guardianRenameLearner, guardianRemoveLearner,
  joinFamily, signOut, isOwner, fetchLearnerById, kidConnectLink, signInWithGoogle, guardianKidStats,
  type GuardianFamily, type Learner, type KidStat,
} from '../lib/supabase'
import { AdminPage } from './AdminPage'
import { InstallGuide } from './InstallGuide'

/** v2 다가구 — 보호자(부모) 대시보드. 미가입→코드 연결 / 가입됨→아이 관리(추가·수정·삭제·아이별 문자링크·관제실). */
const RELATIONS = ['아빠', '엄마', '할아버지', '할머니'] as const

/** v1.4.16 — 아이 카드의 한눈 요약 줄. 아직 한 번도 안 한 아이는 "아직 시작 전"으로 분명히 보여준다. */
function KidStatLine({ stat }: { stat?: KidStat }) {
  const chip = (bg: string, text: string) => (
    <span style={{ background: bg, borderRadius: 8, padding: '2px 8px', fontSize: 12, whiteSpace: 'nowrap' }}>{text}</span>
  )
  if (!stat) return <div style={{ fontSize: 12, opacity: 0.5, marginTop: 6 }}>요약 불러오는 중…</div>
  const never = !stat.lastActive && stat.week.total === 0 && stat.todayAnswers === 0
  if (never) return <div style={{ marginTop: 8 }}>{chip('#3a2a12', '⏳ 아직 시작 전 — 링크를 보내주세요')}</div>
  const rate = stat.week.total ? Math.round((stat.week.correct / stat.week.total) * 100) : null
  /* ★v1.4.40★ 예전엔 `sessions.duration_seconds` 원본 합을 "오늘 N분 ✓"으로 초록 칠했다.
     문항 0개인 날에도 "오늘 703분 ✓"이 떴다 — 관제실은 같은 날 "0분"이라고 말하고 있었다.
     이제 이 숫자는 관제실과 **같은 산식**(문항 기록 기반)이고, 문항이 없으면 0분이다. */
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {stat.todayAnswers === 0
        ? chip('#1b2a3d', '오늘 아직 안 함')
        : chip(stat.todayMin >= 15 ? '#123a22' : '#1b2a3d', `오늘 ${stat.todayMin}분 · ${stat.todayAnswers}문항${stat.todayMin >= 15 ? ' ✓' : ''}`)}
      {rate !== null && chip('#1b2a3d', `7일 정답률 ${rate}% (신규)`)}
      {chip(stat.dueCards > 0 ? '#3a2a12' : '#1b2a3d', `복습 ${stat.dueCards}장`)}
      {stat.lastActive && chip('#1b2a3d', `최근 ${stat.lastActive.slice(5)}`)}
    </div>
  )
}

export function FamilyDashboard() {
  const [phase, setPhase] = useState<'loading' | 'join' | 'dash'>('loading')
  const [fam, setFam] = useState<GuardianFamily | null>(null)
  const [owner, setOwner] = useState(false)
  const [selected, setSelected] = useState<Learner | null>(null)
  const [code, setCode] = useState('')
  const [relation, setRelation] = useState<string>('아빠')
  const [addNick, setAddNick] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNick, setEditNick] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [needLogin, setNeedLogin] = useState(false)
  const [stats, setStats] = useState<Record<string, KidStat>>({})

  async function load() {
    setErr(null)
    const user = await getAuthUser()
    if (!user || user.is_anonymous) {
      setNeedLogin(true); setPhase('join')
      setErr('로그인이 풀렸어요. 구글로 다시 로그인해줘!')
      return
    }
    setNeedLogin(false)
    try {
      const [f, o] = await Promise.all([guardianFamily(), isOwner()])
      setOwner(o)
      if (!f) setPhase('join')
      else {
        setFam(f); setPhase('dash')
        // 아이별 한눈 요약(오늘 학습·정답률·밀린 복습) — 실패해도 대시보드는 그대로 뜬다.
        guardianKidStats(f.learners.map(l => l.id)).then(setStats).catch(() => { /* */ })
      }
    } catch { setErr('가족 정보를 불러오지 못했어요.'); setPhase('join') }
  }
  useEffect(() => { void load() }, [])

  async function connectGuardian() {
    setBusy(true); setErr(null)
    try { await joinFamily(code.trim(), 'guardian', relation); await load() }
    catch { setErr('연결에 실패했어요. 가족 코드를 다시 확인해줘!') }
    setBusy(false)
  }
  async function addKid() {
    if (!addNick.trim()) return
    setBusy(true); setErr(null)
    try { await guardianAddLearner(addNick.trim()); setAddNick(''); await load() }
    catch { setErr('아이 추가 실패 — 다시 시도해줘.') }
    setBusy(false)
  }
  async function saveRename(id: string) {
    if (!editNick.trim()) return
    setBusy(true); setErr(null)
    try { await guardianRenameLearner(id, editNick.trim()); setEditingId(null); await load() }
    catch { setErr('이름 수정 실패 — 다시 시도해줘.') }
    setBusy(false)
  }
  async function confirmDelete(id: string) {
    setBusy(true); setErr(null)
    try { await guardianRemoveLearner(id); setDeletingId(null); await load() }
    catch (e) {
      setErr(String(e).includes('learning data')
        ? '학습 기록이 있는 아이는 삭제할 수 없어요(실수 방지). 이름 수정은 가능해요.'
        : '삭제 실패 — 다시 시도해줘.')
      setDeletingId(null)
    }
    setBusy(false)
  }
  async function openKid(id: string) {
    setBusy(true)
    try { const l = await fetchLearnerById(id); if (l) setSelected(l) } catch { /* */ }
    setBusy(false)
  }
  function copy(text: string, tag: string) {
    try { void navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(null), 1600) } catch { /* */ }
  }
  async function logout() { setBusy(true); try { await signOut() } catch { /* */ } location.hash = ''; location.reload() }

  if (selected) return <AdminPage learner={selected} onExit={() => setSelected(null)} />
  if (phase === 'loading') return <div className="center-box"><div className="diag-big">👨‍👩‍👧</div><p>가족 정보를 불러오는 중…</p></div>

  if (phase === 'join' && needLogin) return (
    <div className="center-box">
      <div className="diag-big">🔐</div>
      <h2>다시 로그인해 주세요</h2>
      <p>로그인이 만료됐어요. 구글로 다시 들어오면 <b>가족·아이 정보는 그대로</b> 있어요.</p>
      <button className="btn primary wide" onClick={() => signInWithGoogle()}>👤 구글로 다시 로그인</button>
      <button className="btn ghost wide" disabled={busy} onClick={logout}>로그아웃</button>
    </div>
  )

  if (phase === 'join') return (
    <div className="center-box">
      <div className="diag-big">👨‍👩‍👧</div>
      <h2>우리 가족 연결하기</h2>
      <p>받으신 <b>가족 코드</b>를 입력해줘!</p>
      <input value={code} onChange={(e: { target: { value: string } }) => setCode(e.target.value.toUpperCase())} placeholder="예: JINYOUNG-3607"
        style={{ width: '100%', maxWidth: 320, padding: '12px 14px', fontSize: 18, textAlign: 'center', letterSpacing: 1, borderRadius: 12, border: '1px solid #2a3a4f', background: '#0f1a28', color: '#eaf1fa', margin: '8px 0' }} />
      <p style={{ margin: '6px 0 2px', opacity: 0.85 }}>나는 아이의…</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', margin: '4px 0 10px' }}>
        {RELATIONS.map(r => <button key={r} className={`btn ${relation === r ? 'primary' : 'ghost'}`} onClick={() => setRelation(r)}>{r}</button>)}
      </div>
      <button className="btn primary wide" disabled={busy || !code.trim()} onClick={connectGuardian}>{busy ? '연결 중…' : '가족 연결 →'}</button>
      {err && <p style={{ color: '#ff8f7e', marginTop: 10 }}>{err}</p>}
      {owner && <button className="btn ghost wide" onClick={() => { location.hash = '/super' }}>🛠️ 슈퍼 관리실(가족 만들기)</button>}
      <button className="btn ghost wide" disabled={busy} onClick={logout}>로그아웃</button>
    </div>
  )

  // phase === 'dash'
  const inputStyle = { padding: '10px 12px', fontSize: 15, borderRadius: 10, border: '1px solid #2a3a4f', background: '#0f1a28', color: '#eaf1fa' } as const
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 14px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>👨‍👩‍👧 {fam?.name || '우리 가족'}</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {owner && <button className="btn ghost" onClick={() => { location.hash = '/super' }}>🛠️ 슈퍼</button>}
          <button className="btn ghost" onClick={logout}>로그아웃</button>
        </div>
      </header>
      <p style={{ opacity: 0.8, fontSize: 13, marginTop: 0 }}>{fam?.parent_name ? <>보호자: <b>{fam.parent_name}</b> · </> : null}아이를 추가하고, 각 아이의 <b>링크를 문자로</b> 보내주세요.</p>

      {/* 상단 1회 설치 안내 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 10px' }}>
        <button className="btn ghost" onClick={() => setShowGuide(v => !v)}>{showGuide ? '설치 안내 닫기' : '📱 아이 설치 안내 보기'}</button>
        {/* v1.4.16 — 다른 보호자(엄마·할머니 등)도 같은 가족 코드로 들어올 수 있다. 지금까지는 소유자만 이 문구를 만들 수 있었다. */}
        <button className="btn ghost" onClick={() => copy(
          `${fam?.name || '우리 가족'} — WordCraft 함께 보기\n① 링크 열기 → "부모님 — 구글로 시작"\n② 가족 코드 입력: ${fam?.join_code || ''}\n${location.origin}/#/connect`,
          'coparent')}>{copied === 'coparent' ? '복사됨 ✓ (전달하기)' : '👩‍❤️‍👨 다른 보호자 초대문구'}</button>
      </div>
      {showGuide && <InstallGuide />}

      {/* 아이 추가 */}
      <section style={{ background: '#111b28', border: '1px solid #21324a', borderRadius: 14, padding: 14, margin: '10px 0' }}>
        <h3 style={{ margin: '0 0 8px' }}>➕ 아이 추가</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...inputStyle, flex: '1 1 180px' }} placeholder="아이 이름 (예: 찬영)" value={addNick} onChange={(e: { target: { value: string } }) => setAddNick(e.target.value)} />
          <button className="btn primary" disabled={busy || !addNick.trim()} onClick={addKid}>추가</button>
        </div>
      </section>

      {err && <p style={{ color: '#ff8f7e' }}>{err}</p>}

      {/* 아이 목록 */}
      {(!fam || fam.learners.length === 0)
        ? <p style={{ opacity: 0.7 }}>아직 등록된 아이가 없어요. 위에서 아이를 추가해줘!</p>
        : fam.learners.map(l => {
          const link = kidConnectLink(l.id, l.nickname)
          const sms = `${l.nickname}아, 아래 링크 눌러서 영어 게임 시작하자!\n${link}\n\n※ 카톡 말고 문자로 열고, "홈 화면에 추가"하면 소리도 잘 나와요.`
          const editing = editingId === l.id
          const deleting = deletingId === l.id
          return (
            <section key={l.id} style={{ background: '#0f1a28', border: '1px solid #21324a', borderRadius: 14, padding: 14, margin: '10px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                {editing
                  ? <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                      <input style={{ ...inputStyle, flex: '1 1 140px' }} value={editNick} onChange={(e: { target: { value: string } }) => setEditNick(e.target.value)} />
                      <button className="btn primary" disabled={busy || !editNick.trim()} onClick={() => saveRename(l.id)}>저장</button>
                      <button className="btn ghost" onClick={() => setEditingId(null)}>취소</button>
                    </div>
                  : <>
                      <h3 style={{ margin: 0 }}>🧒 {l.nickname}</h3>
                      <span style={{ opacity: 0.7, fontSize: 13 }}>Lv.{l.level} · {l.xp.toLocaleString()} XP</span>
                    </>}
              </div>
              {!editing && <KidStatLine stat={stats[l.id]} /> }
              {!editing && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 4px' }}>
                  <button className="btn primary" onClick={() => copy(sms, 'sms-' + l.id)}>{copied === 'sms-' + l.id ? '복사됨 ✓ (문자 붙여넣기)' : '📩 초대 문자 복사'}</button>
                  <button className="btn ghost" onClick={() => copy(link, 'link-' + l.id)}>{copied === 'link-' + l.id ? '복사됨 ✓' : '링크만'}</button>
                  <button className="btn secondary" disabled={busy} onClick={() => openKid(l.id)}>📊 관제실</button>
                  <button className="btn ghost" onClick={() => { setEditingId(l.id); setEditNick(l.nickname); setDeletingId(null) }}>✏️ 수정</button>
                  <button className="btn ghost" onClick={() => { setDeletingId(deleting ? null : l.id); setErr(null) }}>🗑️</button>
                </div>
              )}
              {deleting && !editing && (
                <div style={{ background: '#2a1620', border: '1px solid #5b2740', borderRadius: 10, padding: 10, marginTop: 6 }}>
                  <p style={{ margin: '0 0 8px', color: '#ffb3c7' }}><b>{l.nickname}</b> 아이를 삭제할까요? (되돌릴 수 없어요. 학습 기록이 있으면 보호를 위해 삭제되지 않아요.)</p>
                  <button className="btn" style={{ background: '#7a2740', color: '#fff' }} disabled={busy} onClick={() => confirmDelete(l.id)}>삭제 확정</button>
                  <button className="btn ghost" onClick={() => setDeletingId(null)}>취소</button>
                </div>
              )}
            </section>
          )
        })}
    </div>
  )
}
