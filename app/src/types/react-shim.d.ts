// @types/react 미설치 환경(오프라인) 셔밍 — DEVIATION_LOG DEV-001 참조
// 자체 코드의 로직 타입은 유지되고, React API 표면만 any로 완화된다.
declare module 'react' {
  export type ReactNode = unknown
  export function useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void]
  export function useEffect(fn: () => void | (() => void), deps?: unknown[]): void
  export function useMemo<T>(fn: () => T, deps: unknown[]): T
  export function useRef<T>(init: T): { current: T }
  export function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: unknown[]): T
  const React: { [k: string]: unknown }
  export default React
  export as namespace React
}
declare namespace React { type ReactNode = unknown }
declare module 'react-dom/client' {
  export function createRoot(el: Element | null): { render(node: unknown): void }
}
declare module 'react/jsx-runtime' {
  export const jsx: unknown
  export const jsxs: unknown
  export const Fragment: unknown
}
declare namespace JSX {
  interface IntrinsicElements { [elemName: string]: Record<string, unknown> }
  interface IntrinsicAttributes { key?: string | number }
  type Element = unknown
}
