#!/usr/bin/env bash
# WordCraft 배포 전 검증 일괄 실행 (v1.4.21 신설)
#
# 왜 스크립트로 묶었나: v1.4.17의 관제실 XP 봉합이 v1.4.18에서 조용히 사라진 뒤
# 두 릴리스 동안 아무도 눈치채지 못했다(L27). 검사는 "기억해서 돌리는 것"이 아니라
# **한 줄로 항상 돌아가는 것**이어야 한다.
#
# 사용: bash verify.sh   (실패하면 0이 아닌 코드로 끝난다)
set -euo pipefail
cd "$(dirname "$0")"
export PATH=$PATH:/root/.bun/bin
TSC=/home/claude/.npm-global/bin/tsc

echo "── ① 타입 검사 ──"
$TSC -p tsconfig.json && echo "  통과"

echo "── ② 검사용 번들 생성 ──"
mkdir -p .verify
cat > .verify/vocab_entry.ts <<'EOF'
import * as V from '../src/lib/vocab'
// @ts-ignore
globalThis.V = V
EOF
cat > .verify/xp_entry.ts <<'EOF'
import * as X from '../src/lib/xp'
// @ts-ignore
globalThis.X = X
EOF
cat > .verify/badge_entry.ts <<'EOF'
import * as B from '../src/lib/badges'
// @ts-ignore
globalThis.B = B
EOF
cat > .verify/rw_entry.ts <<'EOF'
import * as R from '../src/lib/rewards'
// @ts-ignore
globalThis.R = R
EOF
cat > .verify/review_entry.ts <<'EOF'
import * as RV from '../src/lib/review'
import { todayStr } from '../src/lib/leitner'
// @ts-ignore
globalThis.RV = { ...RV, todayStr }
EOF
bun build .verify/vocab_entry.ts  --outdir .verify/out --target node --format esm >/dev/null
bun build .verify/xp_entry.ts     --outdir .verify/out --target node --format esm >/dev/null
bun build .verify/badge_entry.ts  --outdir .verify/out --target node --format esm >/dev/null
bun build .verify/rw_entry.ts     --outdir .verify/out --target node --format esm >/dev/null
bun build .verify/review_entry.ts --outdir .verify/out --target node --format esm >/dev/null
cp .verify/out/vocab_entry.js ./_measure_entry_out.js
cp .verify/out/xp_entry.js    ./_xp_entry_out.js
cp .verify/out/badge_entry.js ./_b_entry_out.js
cp .verify/out/rw_entry.js    ./_rw_entry_out.js
cp .verify/out/review_entry.js ./_review_entry_out.js
echo "  완료"

echo "── ③ XP 패리티 (앱=관제실=기기병합, L12·L27) ──"
node xp_parity.mjs

echo "── ④ 뱃지 판정 (단일 규칙, 경계값, 도달 가능성) ──"
node badge_check.mjs

echo "── ④-2 보상 로드맵 (규칙 단일화·경계값, v1.4.22) ──"
node reward_check.mjs

echo "── ④-3 복습 광산 due 정합 (뱃지 숫자 = 광산 숫자, v1.4.29) ──"
node review_check.mjs | tail -6

echo "── ④-4 서버 조회 안전 (모든 조회에 상한·정렬 — v1.4.29) ──"
node query_check.mjs | tail -4

echo "── ⑤ 문항 입력 방식·정답 위치·무결성 (L24·L26) ──"
node measure20.mjs | tail -12

echo "── ⑥ 골렘·속사 무결성 ──"
node golem_check.mjs

echo "── ⑥-2 🔮 문장 소환 (scene↔문장 일치, v1.4.24 — L27) ──"
node summon_check.mjs | tail -8

echo "── ⑥-3 월드 7~10 콘텐츠 전수 ──"
node w710_check.mjs | tail -8

# ⑥-4 소환 스모크는 dist 빌드 + 로컬 서버가 필요하므로 배포 직전에 따로 돌린다:
#   python3 -m http.server 8099 --directory dist &
#   bun build .verify/summon_entry.tsx --outdir .verify/out --production
#   python3 -m http.server 8098 --directory .verify/out &
#   node summon_smoke.mjs
# ★이 스모크는 v1.4.2에서 고쳤다가 되돌아간 두 결함(버튼 위치·애니메이션 불일치)을 잡는다.
#  결함을 일부러 되살려 잡히는 것까지 확인했다(L27 ④). 절대 지우지 말 것.

echo "── ⑥-5 관제실 지표 진실성 (v1.4.35 신설) ──"
# 2026-08-15 적대적 검증에서 나온 거짓말들이 되살아나는지 본다:
#   · 문항 0개인 날을 "학습 703분"으로 세던 Math.max
#   · worlds_ready가 켜졌는데도 28로 나눠 "100% 완주"라고 하던 분모
#   · 복습 99.8%를 신규 학습과 섞어 실력처럼 보이게 하던 정답률
# 결함을 일부러 되살려 실제로 잡히는 것까지 확인했다(L27 ④). 절대 지우지 말 것.
node admin_check.mjs | tail -6

echo "── ⑦ 배포물 버전 3자 대조 (L25) ──"
if [ -f dist/main.js ]; then
  B=$(grep -o '1\.4\.[0-9]\{1,2\}' dist/main.js | sort -u | tr '\n' ' ')
  V=$(python3 -c "import json;print(json.load(open('dist/version.json'))['version'])")
  S=$(grep -o "'1\.4\.[0-9]*'" src/lib/version.ts | tr -d "'")
  echo "  번들:$B / version.json:$V / 소스:$S"
  [ "$(echo $B | tr -d ' ')" = "$V" ] && [ "$V" = "$S" ] && echo "  일치" || { echo "  ★불일치★"; exit 1; }
else
  echo "  dist 없음 — 빌드 후 다시 실행할 것"
fi

echo
echo "✅ 배포 전 검증 전 항목 통과"
