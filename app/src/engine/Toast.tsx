/** 시안 10 피드백 토스트 (E-1) — 화면 상단 1개, 2초 유지, 슬라이드 250ms.
 *  정오답은 04 인라인 피드백이 담당 → 여기서는 스트릭/뱃지/레벨 등 이벤트 알림 채널. */
export interface ToastData {
  kind: 'ok' | 'no' | 'st' | 'dm' | 'lv'
  em: string
  title: string
  sub?: string
}

export function Toast(props: { data: ToastData }) {
  const { data } = props
  return (
    <div className={`toast ${data.kind}`} role="status" aria-live="polite">
      <span className="em">{data.em}</span>
      <span className="tx">
        <b>{data.title}</b>
        {data.sub && <small>{data.sub}</small>}
      </span>
    </div>
  )
}
