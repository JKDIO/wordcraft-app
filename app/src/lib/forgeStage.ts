// v1.4.0 문장 소환진 — 무대·캐릭터·애니메이션 명령형 모듈 (CONTRACT §12)
// Dio님 승인 시안(forge_demo/index.html v0.1)의 CHARS 픽셀데이터·파티클·타임라인을 그대로 포팅.
// CSS는 public/app.css 맨 끝의 `.forge-root` 네임스페이스 블록과 한 쌍이다.
// 전역 오염 0 (모든 상태 클로저 스코프) · window/localStorage 미사용 · 타이머+DOM만.

export type ActorKey = 'zombie' | 'bomb' | 'cake' | 'dog' | 'cat'
export type VerbKey = 'jump' | 'run' | 'eat' | 'sleep' | 'dance' | 'fly' | 'cry' | 'laugh' | 'spin' | 'fall' | 'explode' | 'hug'

export interface ForgeStageHandle {
  /** 배역 등장(마법진 위, 소환 연출). 같은 배역이면 재소환 생략 */
  summon(actor: ActorKey): void
  /** 동사 애니메이션 실행. 반환 = 대략적 총 소요 ms (speed 보정 포함)
   *  v1.4.24: `prey`(먹잇감) 추가 — eat의 소품을 문장의 목적어 배역으로 렌더한다. */
  play(verb: VerbKey, opts?: { speed?: number; partner?: ActorKey; prey?: ActorKey }): number
  /** 지금 예약된 소환 연출이 끝날 때까지 남은 ms (0이면 즉시 실행 중) */
  wait(): number
  /** v1.4.24 — 캐릭터로 재현할 수 없는 문장의 정직한 연출.
   *  마법진 위에 문장을 의미 덩어리 단위로 하나씩 새긴다. 반환 = 총 소요 ms.
   *  ⚠️ 재현할 수 없는 문장에 아무 애니메이션이나 붙이면 그건 거짓말이다(v1.4.2 사고의 교훈). */
  engrave(chunks: string[]): number
  /** 비문 소환 실패 — 붉은 파직 + 스테이지 셰이크 + 갸웃(?) */
  failFx(): void
  /** 정답 — 골드 플로어 버스트 + 콘페티 + "+{xp} XP" 팝 */
  successFx(xp: number): void
  /** DOM/타이머 정리 */
  destroy(): void
}

/* ============================================================
   캐릭터 정의 — box-shadow 픽셀아트 (시안 원본 그대로)
   ============================================================ */
interface PixDef { w: number; h: number; pal: Record<string, string>; g: string[] }
interface CharDef extends PixDef { name: string }

const CHARS: Record<ActorKey, CharDef> = {
  zombie: {
    name: '좀비 그루', w: 12, h: 16,
    pal: { h: '#2f6b1d', s: '#7ac74f', e: '#141821', m: '#3e5a2a', t: '#4a5aa8', d: '#2d3a75', p: '#31406e', b: '#20242e' },
    g: [
      '..hhhhhhhh..',
      '..hhhhhhhh..',
      '..hssssssh..',
      '..sesssses..',
      '..sesssses..',
      '..ssssssss..',
      '..ssmmmmss..',
      '..tttttttt..',
      '.stttttttts.',
      '.sttdttdtts.',
      '.stttttttts.',
      '..tttttttt..',
      '...pp..pp...',
      '...pp..pp...',
      '...pp..pp...',
      '...bb..bb...'
    ]
  },
  bomb: {
    name: '폭탄몬 붐붐', w: 12, h: 14,
    pal: { f: '#f5c542', g: '#3ecf6e', G: '#2a9d52', e: '#141821', m: '#123024', d: '#1e5c36' },
    g: [
      '......f.....',
      '.....ff.....',
      '....gggg....',
      '..gggggggg..',
      '.gggggggggg.',
      '.ggeeggeegg.',
      '.ggeeggeegg.',
      '.gggggggggg.',
      '.gggmmmmggg.',
      '.ggmggggmgg.',
      '.gGggggggGg.',
      '..gggggggg..',
      '...gg..gg...',
      '...dd..dd...'
    ]
  },
  cake: {
    name: '케이크 미미', w: 14, h: 12,
    pal: { r: '#e0455a', w: '#fdf6e3', p: '#f4a7b9', e: '#141821', m: '#7a3b47', b: '#8a5a3b' },
    g: [
      '......rr......',
      '.....rrrr.....',
      '..wwwwwwwwww..',
      '.wwwwwwwwwwww.',
      '.pppppppppppp.',
      '.ppeeppppeepp.',
      '.ppeeppppeepp.',
      '.pppppmmppppp.',
      '.wwwwwwwwwwww.',
      '.bbbbbbbbbbbb.',
      '.bbbbbbbbbbbb.',
      '.bbbbbbbbbbbb.'
    ]
  },
  dog: {
    name: '강아지 바우', w: 14, h: 14,
    pal: { d: '#8a5a3b', t: '#d9a066', e: '#141821', n: '#3b2a1e', m: '#3b2a1e', w: '#fdf6e3' },
    g: [
      '.dd........dd.',
      '.ddd......ddd.',
      '..tttttttttt..',
      '..tttttttttt..',
      '..teetttteet..',
      '..teetttteet..',
      '..ttttnntttt..',
      '..tttmmmmttt..',
      '...tttttttt...',
      '...ttttttttd..',
      '...twwwwwwt...',
      '...tt....tt...',
      '...tt....tt...',
      '...dd....dd...'
    ]
  },
  cat: {
    name: '고양이 나비', w: 14, h: 14,
    pal: { c: '#7d84a3', g: '#4a4f66', e: '#3ecf6e', n: '#f4a7b9', m: '#2b2f3e', w: '#c9cede', W: '#fdf6e3' },
    g: [
      '..c........c..',
      '..cc......cc..',
      '..cccccccccc..',
      '..cccccccccc..',
      '..ceecccceec..',
      '..ceecccceec..',
      '..ccccnncccc..',
      '..cwcmmmmcwc..',
      '...cccccccc...',
      '...ccccccccc..',
      '...cWWWWWWc...',
      '...cc....cc...',
      '...cc....cc...',
      '...gg....gg...'
    ]
  }
}

/* 먹이용 미니 케이크 프롭 (시안 원본) */
const PROP_CAKE: PixDef = {
  w: 10, h: 8,
  pal: { r: '#e0455a', w: '#fdf6e3', p: '#f4a7b9', b: '#8a5a3b' },
  g: [
    '....rr....',
    '...wwww...',
    '.wwwwwwww.',
    '.pppppppp.',
    '.pppppppp.',
    '.wwwwwwww.',
    '.bbbbbbbb.',
    '.bbbbbbbb.'
  ]
}

/* ============================================================
   유틸 — 픽셀 렌더 · 스테이지 상태
   ============================================================ */
function shadowCSS(def: PixDef, p: number): string {
  const parts: string[] = []
  for (let y = 0; y < def.g.length; y++) {
    const row = def.g[y]
    for (let x = 0; x < row.length; x++) {
      const c = def.pal[row.charAt(x)]
      if (c) parts.push(`${x * p}px ${y * p}px 0 ${c}`)
    }
  }
  return parts.join(',')
}

function renderPix(actorEl: HTMLElement, pxEl: HTMLElement, def: PixDef, p: number): void {
  actorEl.style.width = `${def.w * p}px`
  actorEl.style.height = `${def.h * p}px`
  actorEl.style.marginLeft = `${-(def.w * p) / 2}px`
  pxEl.style.width = `${p}px`
  pxEl.style.height = `${p}px`
  pxEl.style.boxShadow = shadowCSS(def, p)
}

interface SlotRefs { slot: HTMLElement; mover: HTMLElement; actor: HTMLElement; px: HTMLElement; shadow: HTMLElement }

interface St {
  root: HTMLElement
  p: number
  role: ActorKey | null
  partner: ActorKey | undefined
  /** v1.4.24 — eat의 먹잇감 배역(문장의 목적어). undefined면 기본 케이크 소품 */
  prey: ActorKey | undefined
  baseClass: string
  fxL: HTMLElement
  propL: HTMLElement
  flash: HTMLElement
  main: SlotRefs
  friend: SlotRefs
  slotBottom: number
  timers: number[]
  /** 현재 재생 배속 (부사 반영). later()의 지연도 이 값으로 나눠 파티클 타임라인을 동기화 */
  rate: number
  /** 소환 연출이 끝나는 시각 — 그 전에 play()가 오면 등장 연출을 살리고 나서 실행 */
  summonUntil: number
  /** 소환 대기 중 예약된 play 타이머 */
  pending: number
}

function makeStage(container: HTMLElement, p: number, small: boolean): St {
  const root = container.ownerDocument.createElement('div')
  root.className = 'stage' + (small ? ' small' : '')
  root.innerHTML =
    '<div class="floor">' +
      '<div class="ring ringA"></div><div class="ring ringB"></div><div class="ring ringC"></div>' +
      '<div class="core"></div><div class="runes"></div>' +
    '</div>' +
    '<div class="floor-flash"></div>' +
    '<div class="prop-layer"></div>' +
    '<div class="slot friend"><div class="shadow"></div><div class="mover"><div class="actor"><div class="px"></div></div></div></div>' +
    '<div class="slot main"><div class="shadow"></div><div class="mover"><div class="actor"><div class="px"></div></div></div></div>' +
    '<div class="fx-layer"></div>'
  container.appendChild(root)
  // 룬 8개 배치
  const runes = root.querySelector('.runes') as HTMLElement
  for (let i = 0; i < 8; i++) {
    const r = container.ownerDocument.createElement('div')
    r.className = 'rune r' + (i % 4)
    r.style.setProperty('--a', `${i * 45}deg`)
    r.style.setProperty('--gd', `${i * 0.27}s`)
    runes.appendChild(r)
  }
  function slotObj(sel: string): SlotRefs {
    const s = root.querySelector(sel) as HTMLElement
    return {
      slot: s,
      mover: s.querySelector('.mover') as HTMLElement,
      actor: s.querySelector('.actor') as HTMLElement,
      px: s.querySelector('.px') as HTMLElement,
      shadow: s.querySelector('.shadow') as HTMLElement,
    }
  }
  return {
    root, p, role: null, partner: undefined, prey: undefined,
    baseClass: root.className,
    fxL: root.querySelector('.fx-layer') as HTMLElement,
    propL: root.querySelector('.prop-layer') as HTMLElement,
    flash: root.querySelector('.floor-flash') as HTMLElement,
    main: slotObj('.slot.main'),
    friend: slotObj('.slot.friend'),
    slotBottom: small ? 44 : 52,
    timers: [],
    rate: 1,
    summonUntil: 0,
    pending: 0,
  }
}

/** 배속 반영 지연 실행 — 타이머는 resetStage에서 일괄 정리 */
function later(st: St, fn: () => void, ms: number): void {
  st.timers.push(setTimeout(fn, Math.round(ms / st.rate)))
}
/** 배속 무관 지연 (보상 타이밍 등 연출 설계값 고정용) */
function laterRaw(st: St, fn: () => void, ms: number): void {
  st.timers.push(setTimeout(fn, ms))
}

/** Web Animations API로 실행 중 애니메이션 배속 조정 — 미지원 환경(구형 WebView)은 조용히 무시 */
function tuneRate(el: Element, rate: number, subtree: boolean): void {
  try {
    const anims = (el as unknown as { getAnimations?: (o?: { subtree?: boolean }) => Animation[] })
      .getAnimations?.(subtree ? { subtree: true } : undefined)
    if (anims) for (const a of anims) a.playbackRate = rate
  } catch { /* noop */ }
}

/** 배속을 적용/해제할 대상: 배역 슬롯 2개 + 프롭 레이어 (마법진 상시 회전은 건드리지 않는다) */
function setRate(st: St, rate: number): void {
  tuneRate(st.main.slot, rate, true)
  tuneRate(st.friend.slot, rate, true)
  tuneRate(st.propL, rate, true)
}

function resetStage(st: St): void {
  if (st.pending) { clearTimeout(st.pending); st.pending = 0 }
  for (let i = 0; i < st.timers.length; i++) clearTimeout(st.timers[i])
  st.timers.length = 0
  st.fxL.textContent = ''
  st.propL.textContent = ''
  st.root.className = st.baseClass
  st.flash.className = 'floor-flash'
  st.main.slot.classList.remove('summon')
  st.main.actor.classList.remove('gone')
  setRate(st, 1) // 이전 배속 재생이 중간에 끊겼어도 idle 배속 복원
  // 강제 리플로우 → 같은 클래스 재부여 시 애니메이션 재시작 (연타 안전)
  void st.root.offsetWidth
}

function fx(st: St, cls: string, x: number, y: number, vars: Record<string, string | number> | null, life?: number, text?: string): void {
  const d = st.root.ownerDocument.createElement('div')
  d.className = 'fx ' + cls
  d.style.left = `${x}px`
  d.style.top = `${y}px`
  if (vars) for (const k in vars) d.style.setProperty('--' + k, String(vars[k]))
  if (text) d.textContent = text
  st.fxL.appendChild(d)
  if (st.rate !== 1) tuneRate(d, st.rate, false)
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d) }, Math.round((life || 1300) / st.rate))
}

const cx = (st: St) => st.root.clientWidth / 2
const gy = (st: St) => st.root.clientHeight - st.slotBottom
const charH = (st: St) => (st.role ? CHARS[st.role].h * st.p : 80)

function setChar(st: St, key: ActorKey, withSummon: boolean): void {
  st.role = key
  renderPix(st.main.actor, st.main.px, CHARS[key], st.p)
  if (withSummon) {
    st.main.slot.classList.remove('summon')
    void (st.main.slot as HTMLElement).offsetWidth
    st.main.slot.classList.add('summon')
    fx(st, 'p-ring', cx(st), gy(st) - 24, { c: '#f5c542' }, 700)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      fx(st, 'p-spark', cx(st), gy(st) - 26,
        { dx: Math.round(Math.cos(a) * 44), dy: Math.round(Math.sin(a) * 30 - 12), c: i % 2 ? '#3ecf6e' : '#f5c542', s: 6, dur: '.55s' }, 700)
    }
    later(st, () => { st.main.slot.classList.remove('summon') }, 680)
  }
}

/* ============================================================
   동사 실행기 — 파티클 타임라인 (시안 원본 그대로)
   ============================================================ */
function dustPuffs(st: St, x: number, y: number, n: number, spread: number): void {
  for (let i = 0; i < n; i++) {
    fx(st, 'p-dust', x + (Math.random() * 2 - 1) * spread, y + Math.random() * 4,
      { dx: Math.round((Math.random() * 2 - 1) * 26), dy: -(8 + Math.random() * 14), s: 8 + Math.random() * 7, dur: `${0.45 + Math.random() * 0.3}s` }, 900)
  }
}

type RunnerKey = VerbKey | 'huh'
const RUNNERS: Record<RunnerKey, { dur: number; run?: (st: St) => void }> = {
  jump: { dur: 950, run(st) {
    later(st, () => { dustPuffs(st, cx(st), gy(st), 4, 16) }, 230)
    later(st, () => { dustPuffs(st, cx(st), gy(st), 5, 22) }, 700)
    later(st, () => { dustPuffs(st, cx(st), gy(st), 3, 14) }, 800)
  } },
  run: { dur: 1450, run(st) {
    const pts = [{ t: 140, x: -6 }, { t: 280, x: 26 }, { t: 420, x: 58 }, { t: 560, x: 96 }, { t: 700, x: 100 },
      { t: 860, x: 80 }, { t: 1000, x: 52 }, { t: 1150, x: 22 }, { t: 1300, x: -2 }]
    pts.forEach(pt => { later(st, () => { dustPuffs(st, cx(st) + pt.x, gy(st), 2, 8) }, pt.t) })
  } },
  eat: { dur: 1500, run(st) {
    // ★v1.4.24 — "The dog eats the cat"인데 케이크를 먹던 결함(v1.4.2에서 고쳤다가 소스 재구성 때 유실)★
    // 먹잇감 스프라이트 = 문장의 목적어 배역. 목적어가 없으면(자동사적 eats) 기본 케이크 소품.
    const preyDef: PixDef = st.prey ? CHARS[st.prey] : PROP_CAKE
    // 먹잇감은 주인공보다 작게 — 케이크 소품과 비슷한 부피가 되도록 픽셀 크기를 낮춘다
    const pp = st.prey ? Math.max(3, st.p - 2) : Math.max(4, st.p - 1)
    const pk = st.root.ownerDocument.createElement('div')
    pk.className = 'pcake'
    pk.style.width = `${preyDef.w * pp}px`
    pk.style.height = `${preyDef.h * pp}px`
    pk.style.left = `${cx(st) + 34}px`
    pk.style.bottom = `${st.slotBottom - 2}px`
    const px = st.root.ownerDocument.createElement('div')
    px.className = 'px'
    px.style.width = `${pp}px`; px.style.height = `${pp}px`
    px.style.boxShadow = shadowCSS(preyDef, pp)
    pk.appendChild(px)
    st.propL.appendChild(pk)
    if (st.rate !== 1) tuneRate(pk, st.rate, false)
    const cakeX = cx(st) + 34 + (preyDef.w * pp) / 2
    const cakeY = gy(st) - (preyDef.h * pp) / 2
    // 부스러기 색도 먹잇감의 팔레트에서 뽑는다 — 강아지를 먹으면 갈색 털이 튄다
    const palCols = Object.values(preyDef.pal).filter(c => c !== '#141821' && c !== '#20242e')
    const crumbCols = palCols.length >= 3 ? palCols.slice(0, 3) : ['#8a5a3b', '#f4a7b9', '#fdf6e3']
    const crumbs = (n: number) => {
      for (let i = 0; i < n; i++) {
        fx(st, 'p-crumb', cakeX + (Math.random() * 2 - 1) * 10, cakeY,
          { dx: Math.round((Math.random() * 2 - 1) * 24), c: crumbCols[i % crumbCols.length], dur: `${0.4 + Math.random() * 0.25}s` }, 750)
      }
    }
    later(st, () => { pk.classList.add('b1'); crumbs(4) }, 280)
    later(st, () => { pk.classList.remove('b1'); pk.classList.add('b2'); crumbs(4) }, 570)
    later(st, () => { pk.classList.remove('b2'); pk.classList.add('b3'); crumbs(5) }, 860)
    later(st, () => {
      if (pk.parentNode) pk.parentNode.removeChild(pk)
      dustPuffs(st, cakeX, cakeY, 2, 6)
      fx(st, 'p-star', cx(st), gy(st) - charH(st) - 10, { dx: 6, dy: -16, s: 13 }, 800)
    }, 1120)
  } },
  sleep: { dur: 1500, run(st) {
    const hx = cx(st) + 6, hy = gy(st) - charH(st) * 0.92
    later(st, () => { fx(st, 'p-z', hx, hy, { s: 13, dur: '1s' }, 1100, 'Z') }, 260)
    later(st, () => { fx(st, 'p-z', hx + 8, hy - 6, { s: 16, dur: '1s' }, 1100, 'Z') }, 640)
    later(st, () => { fx(st, 'p-z', hx + 16, hy - 12, { s: 20, dur: '1s' }, 1100, 'Z') }, 1020)
  } },
  dance: { dur: 1250, run(st) {
    const beats = [{ t: 140, x: -30 }, { t: 430, x: 30 }, { t: 720, x: -30 }, { t: 1010, x: 30 }]
    beats.forEach((b, i) => {
      later(st, () => {
        fx(st, 'p-star', cx(st) + b.x, gy(st) - charH(st) * 0.7 - 8,
          { dx: b.x > 0 ? 14 : -14, dy: -18, s: 11 + (i % 2) * 4, c: i % 2 ? '#3ecf6e' : '#f5c542', dur: '.6s' }, 700)
        fx(st, 'p-spark', cx(st) + b.x * 0.6, gy(st) - 10,
          { dx: b.x, dy: -8, s: 5, c: '#f5c542', dur: '.5s' }, 600)
      }, b.t)
    })
  } },
  fly: { dur: 1400, run(st) {
    later(st, () => { dustPuffs(st, cx(st), gy(st), 4, 18) }, 180)
    later(st, () => { fx(st, 'p-cloud', cx(st) - 46, gy(st) - 96, { dx: -46, dy: 22, dur: '.9s' }, 1000) }, 380)
    later(st, () => { fx(st, 'p-cloud', cx(st) + 48, gy(st) - 128, { dx: 52, dy: 26, dur: '.9s' }, 1000) }, 600)
    later(st, () => { fx(st, 'p-cloud', cx(st) - 40, gy(st) - 150, { dx: -50, dy: 20, dur: '.9s' }, 1000) }, 820)
    later(st, () => { dustPuffs(st, cx(st), gy(st), 3, 16) }, 1290)
  } },
  cry: { dur: 1250, run(st) {
    const eyeY = gy(st) - charH(st) * 0.72
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1
      later(st, () => {
        fx(st, 'p-tear', cx(st) + side * (charH(st) * 0.16), eyeY,
          { dx: side * 5, dy: 40 + Math.random() * 12, dur: `${0.45 + Math.random() * 0.15}s` }, 700)
      }, 130 + i * 150)
    }
  } },
  laugh: { dur: 1050, run(st) {
    const hy = gy(st) - charH(st) - 6;
    [130, 420, 700].forEach((t, i) => {
      later(st, () => {
        fx(st, 'p-spark', cx(st) - 26, hy + 4, { dx: -16, dy: -14, s: 6, c: '#f5c542', dur: '.5s' }, 600)
        fx(st, 'p-spark', cx(st) + 26, hy + 4, { dx: 16, dy: -14, s: 6, c: '#f5c542', dur: '.5s' }, 600)
        fx(st, 'p-spark', cx(st) + (i % 2 ? 10 : -10), hy - 8, { dx: 0, dy: -18, s: 5, c: '#3ecf6e', dur: '.5s' }, 600)
      }, t)
    })
  } },
  spin: { dur: 850, run(st) {
    const my = gy(st) - charH(st) * 0.5
    later(st, () => { fx(st, 'p-ring', cx(st), my, { c: '#3ecf6e', dur: '.45s' }, 550) }, 130)
    later(st, () => { fx(st, 'p-ring', cx(st), my, { c: '#f5c542', dur: '.45s' }, 550) }, 380)
    later(st, () => {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.6
        fx(st, 'p-spark', cx(st), my, { dx: Math.round(Math.cos(a) * 40), dy: Math.round(Math.sin(a) * 22), s: 5, c: '#f5c542', dur: '.5s' }, 600)
      }
    }, 500)
  } },
  fall: { dur: 1200, run(st) {
    later(st, () => { dustPuffs(st, cx(st) + 34, gy(st), 5, 20) }, 470)
    const hx = cx(st) + 46, hy = gy(st) - 30;
    [{ t: 540, dx: -16, dy: -22 }, { t: 660, dx: 2, dy: -30 }, { t: 780, dx: 18, dy: -22 }].forEach(s => {
      later(st, () => { fx(st, 'p-star', hx, hy, { dx: s.dx, dy: s.dy, s: 13, dur: '.65s' }, 750) }, s.t)
    })
  } },
  explode: { dur: 1600, run(st) {
    later(st, () => {
      // 팝!
      st.main.actor.classList.add('gone')
      st.root.classList.add('shake')
      fx(st, 'p-flash', cx(st), gy(st) - charH(st) * 0.5, null, 400)
      fx(st, 'p-ring', cx(st), gy(st) - charH(st) * 0.5, { c: '#3ecf6e', dur: '.5s' }, 600)
      fx(st, 'p-ring', cx(st), gy(st) - 16, { c: '#f5c542', dur: '.6s' }, 700)
      const cols = ['#3ecf6e', '#f5c542', '#e0455a', '#2a9d52']
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2
        const d = 52 + Math.random() * 40
        fx(st, 'p-spark', cx(st), gy(st) - charH(st) * 0.5,
          { dx: Math.round(Math.cos(a) * d), dy: Math.round(Math.sin(a) * d * 0.72 - 12), s: 6 + Math.random() * 6, c: cols[i % 4], dur: `${0.5 + Math.random() * 0.3}s` }, 900)
      }
      for (let j = 0; j < 4; j++) {
        fx(st, 'p-smoke', cx(st) + (Math.random() * 2 - 1) * 26, gy(st) - 18 - Math.random() * 26,
          { dx: Math.round((Math.random() * 2 - 1) * 30), dy: -(20 + Math.random() * 18), s: 18 + Math.random() * 10, dur: '.85s' }, 950)
      }
    }, 880)
    later(st, () => { st.root.classList.remove('shake') }, 1330)
    later(st, () => {
      // 리스폰! (v-explode를 먼저 떼어내야 summon 애니메이션이 이긴다)
      st.root.classList.remove('v-explode')
      st.main.actor.classList.remove('gone')
      void (st.main.slot as HTMLElement).offsetWidth
      st.main.slot.classList.add('summon')
      fx(st, 'p-ring', cx(st), gy(st) - 22, { c: '#f5c542' }, 700)
    }, 1180)
    later(st, () => { st.main.slot.classList.remove('summon') }, 1850)
  } },
  hug: { dur: 1800, run(st) {
    // 파트너 지정 시 그 배역이 등장, 없으면 시안 기본(강아지↔고양이)
    const friendKey: ActorKey = st.partner ?? (st.role === 'dog' ? 'cat' : 'dog')
    renderPix(st.friend.actor, st.friend.px, CHARS[friendKey], st.p);
    [230, 380].forEach((t, i) => {
      later(st, () => { dustPuffs(st, cx(st) + 90 - i * 40, gy(st), 2, 8) }, t)
    });
    [720, 930, 1140].forEach((t, i) => {
      later(st, () => {
        fx(st, 'p-heart', cx(st) + (i - 1) * 13, gy(st) - charH(st) - 8, { dx: (i - 1) * 14, dur: '.85s' }, 950)
      }, t)
    })
  } },
  huh: { dur: 900, run(st) {
    later(st, () => {
      fx(st, 'p-z', cx(st) + 16, gy(st) - charH(st) - 4, { s: 15, dur: '.8s' }, 900, '?')
    }, 180)
  } },
}

function doPlay(st: St, verb: RunnerKey): void {
  resetStage(st)
  st.root.classList.add('v-' + verb)
  const v = RUNNERS[verb]
  if (v.run) v.run(st)
  later(st, () => {
    st.root.classList.remove('v-' + verb)
    setRate(st, 1)
    st.rate = 1
  }, v.dur + 80)
  if (st.rate !== 1) setRate(st, st.rate)
}

/* ============================================================
   공개 API
   ============================================================ */
export function mountForgeStage(container: HTMLElement, opts?: { pixel?: number }): ForgeStageHandle {
  const p = Math.max(3, Math.round(opts?.pixel ?? 5))
  const small = p <= 5 // 기본(모바일 360px)은 컴팩트 무대
  const st = makeStage(container, p, small)
  let dead = false

  function summon(actor: ActorKey): void {
    if (dead) return
    if (st.role === actor) return // 같은 배역 재소환 생략
    resetStage(st)
    st.rate = 1
    setChar(st, actor, true)
    st.summonUntil = Date.now() + 660
  }

  return {
    summon,

    play(verb: VerbKey, opts2?: { speed?: number; partner?: ActorKey; prey?: ActorKey }): number {
      if (dead) return 0
      const rawSpeed = opts2?.speed ?? 1
      const speed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? Math.min(4, Math.max(0.25, rawSpeed)) : 1
      st.partner = opts2?.partner
      st.prey = opts2?.prey
      // ★v1.4.24 — 여기 있던 `if (verb === 'explode' && st.role !== 'bomb') summon('bomb')` 를 제거했다.★
      // 시안 데모의 연출 편의였는데, 본 게임에 그대로 오면 "The cake explodes"를 조립한 아이 화면에서
      // 케이크가 아니라 폭탄몬이 터진다 — "조립한 문장이 그대로 실행된다"는 이 기능의 유일한 약속을 깬다.
      // explode 러너는 배역을 가리지 않으므로(gone → 리스폰) 주어가 직접 터지면 된다.
      const wait = Math.max(0, st.summonUntil - Date.now())
      const start = () => { st.rate = speed; doPlay(st, verb) }
      if (wait > 0) {
        if (st.pending) clearTimeout(st.pending)
        st.pending = setTimeout(() => { st.pending = 0; start() }, wait)
      } else {
        start()
      }
      return Math.round(wait + (RUNNERS[verb].dur + 80) / speed)
    },

    wait(): number {
      if (dead) return 0
      return Math.max(0, st.summonUntil - Date.now())
    },

    /** v1.4.24 — 배역·동사로 재현할 수 없는 문장은 "새긴다".
     *  캐릭터를 치우고 마법진만 남긴 뒤 의미 덩어리를 하나씩 띄운다.
     *  아무 애니메이션이나 붙여 아이를 속이지 않는 것이 이 함수의 존재 이유다. */
    engrave(chunks: string[]): number {
      if (dead) return 0
      resetStage(st)
      st.rate = 1
      st.role = null
      st.main.actor.classList.add('gone')
      st.friend.actor.classList.add('gone')
      st.root.classList.add('v-engrave')
      const list = chunks.filter(c => c && c.trim()).slice(0, 8)
      const step = 420
      const y0 = st.root.clientHeight - st.slotBottom - 30
      list.forEach((c, i) => {
        later(st, () => {
          fx(st, 'p-chunk', cx(st), y0 - i * 22, { dur: '1.5s' }, 1700, c)
          fx(st, 'p-ring', cx(st), y0 - i * 22 + 6, { c: i % 2 ? '#3ecf6e' : '#f5c542', dur: '.5s' }, 600)
        }, 260 + i * step)
      })
      const total = 260 + list.length * step + 500
      later(st, () => {
        st.root.classList.remove('v-engrave')
        st.main.actor.classList.remove('gone')
        st.friend.actor.classList.remove('gone')
      }, total + 700)
      return total
    },

    failFx(): void {
      if (dead) return
      st.rate = 1
      doPlay(st, 'huh') // 갸웃(?) — doPlay 내부 reset 이후 flash/shake를 부여해야 지워지지 않는다
      st.flash.classList.add('red')
      st.root.classList.add('shake')
      laterRaw(st, () => { st.root.classList.remove('shake') }, 460)
    },

    successFx(xp: number): void {
      if (dead) return
      // 진행 중인 동사 애니메이션 위에 겹쳐 얹는다 — reset 금지
      st.flash.className = 'floor-flash'
      void (st.flash as HTMLElement).offsetWidth
      st.flash.classList.add('gold')
      fx(st, 'p-ring', cx(st), gy(st) - 14, { c: '#f5c542', dur: '.6s' }, 700)
      const cols = ['#f5c542', '#3ecf6e', '#fdf6e3', '#8fd4ff']
      for (let i = 0; i < 12; i++) {
        fx(st, 'p-confetti', cx(st) + (Math.random() * 2 - 1) * 70, gy(st) - 130 - Math.random() * 30,
          { dx: Math.round((Math.random() * 2 - 1) * 46), c: cols[i % 4], dur: `${0.9 + Math.random() * 0.4}s` }, 1400)
      }
      // XP 팝은 0.65s 지연 — 행동→보상 타이밍 분리 (배속 무관 고정)
      laterRaw(st, () => {
        fx(st, 'p-xp', cx(st), gy(st) - charH(st) - 26, null, 1200, `+${xp} XP`)
        fx(st, 'p-star', cx(st) - 40, gy(st) - charH(st) - 10, { dx: -12, dy: -18, s: 14 }, 800)
        fx(st, 'p-star', cx(st) + 40, gy(st) - charH(st) - 10, { dx: 12, dy: -18, s: 14 }, 800)
      }, 650)
    },

    destroy(): void {
      if (dead) return
      dead = true
      if (st.pending) { clearTimeout(st.pending); st.pending = 0 }
      for (let i = 0; i < st.timers.length; i++) clearTimeout(st.timers[i])
      st.timers.length = 0
      if (st.root.parentNode) st.root.parentNode.removeChild(st.root)
    },
  }
}
