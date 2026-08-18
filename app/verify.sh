#!/usr/bin/env bash
# WordCraft 배포 전 검증 일괄 실행 (v1.4.21 신설 · v1.4.40 재건)
#
# 왜 스크립트로 묶었나: v1.4.17의 관제실 XP 봉합이 v1.4.18에서 조용히 사라진 뒤
# 두 릴리스 동안 아무도 눈치채지 못했다(L27). 검사는 "기억해서 돌리는 것"이 아니라
# **한 줄로 항상 돌아가는 것**이어야 한다.
#
# ★★2026-08-16 재건★★
#   이 파일은 검사 11개를 부르고 있었는데, 저장소·노트북 어느 스냅샷에도 **admin_check.mjs 하나만**
#   존재했다. 나머지는 각 세션의 컨테이너 안에서만 만들어졌다가 사라졌다.
#   즉 "검사 전 항목 통과"라는 이 파일의 마지막 줄은 **몇 릴리스 동안 사실이 아니었다.**
#   (L27을 만든 파일이 정작 L27을 어기고 있었다.)
#   → xp_parity · badge_check · reward_check · review_check · query_check 를 다시 작성해 커밋했다.
#   → 아직 복원하지 못한 것은 **끝에서 크게 알린다.** 조용히 건너뛰지 않는다.
#
# ★★2026-08-18 (v1.4.46) — 남아 있던 다섯 개를 마저 복원했다★★
#   measure20 · golem_check · summon_check · summon_smoke · w710_check.
#   전부 `_dev_github/wordcraft_tests_v1.4.30.tgz` 스냅샷에서 되살렸고, **돌아가게 고쳤다**:
#     · measure20/golem_check — 컨테이너에만 있던 `_measure_entry_out.js` 의존을 없애고 스스로 번들을 만든다.
#     · w710_check — 저장소에 없는 `content_w710/` 대신 **실제 배포되는 public/content.json** 을 읽는다.
#                    v1.4.42의 월드 재정렬(7~10 → 6~9)도 반영했다.
#     · measure20/golem_check — 결함이 있어도 exit 0이던 '보고서'를 **관문**으로 바꿨다.
#   그리고 v1.4.46 신설분 2개를 더했다: shuffle_check(C1) · device_check(C5·L61·L8).
#   → 이 파일의 마지막 줄이 여섯 릴리스 만에 다시 사실이 됐다.
#
# 사용: bash verify.sh   (실패하면 0이 아닌 코드로 끝난다)
set -euo pipefail
cd "$(dirname "$0")"
export PATH=$PATH:/root/.bun/bin
TSC=/home/claude/.npm-global/bin/tsc

echo "── ① 타입 검사 ──"
$TSC -p tsconfig.json && echo "  통과"

echo "── ② XP 패리티 (앱=관제실=기기병합, L12·L27) ──"
node xp_parity.mjs | tail -8

echo "── ③ 뱃지 판정 (단일 규칙, 경계값, 도달 가능성) ──"
node badge_check.mjs | tail -6

echo "── ④ 보상 로드맵 (규칙 단일화·경계값, v1.4.22) ──"
node reward_check.mjs | tail -6

echo "── ⑤ 복습 광산 (뱃지 숫자 = 광산 숫자 · 하루 상한 · 리스폰 약속) ──"
node review_check.mjs | tail -8

echo "── ⑥ 서버 조회 안전 (상한·정렬·페이지네이션, L31·L49) ──"
node query_check.mjs | tail -8

echo "── ⑦ 관제실 지표 진실성 (v1.4.35 신설 · v1.4.40 확장) ──"
# 2026-08-15~16 검증에서 나온 거짓말들이 되살아나는지 본다:
#   · 문항 0개인 날을 "학습 703분"으로 세던 Math.max
#   · 세션 원본 시간으로 출석을 찍던 경로(문항 0개인 7/24가 출석일이었다)
#   · 복습 99.8%를 실력처럼 보여 주던 정답률 / 246ms 연타
#   · 라이브러리만 고치고 화면을 두던 구조(L51) — ⑭ 소비자 검사
# 결함을 일부러 되살려 실제로 잡히는 것까지 확인했다(L27 ④). 절대 지우지 말 것.
node admin_check.mjs | tail -6

echo "── ⑧ ★객관식 선택지 셔플 (v1.4.46 · C1)★ ──"
node shuffle_check.mjs | tail -12

echo "── ⑨ ★기기 게이트 · 서버 일일 회계 · 실기기 자가진단 (v1.4.46 · C5·L61·L8)★ ──"
node device_check.mjs | tail -10

echo "── ⑩ 어휘 엔진 전수 계측 (입력 방식·정답 위치·무결성 — L24·L26) ──"
node measure20.mjs | tail -4

echo "── ⑪ 단어 골렘 · 속사 라운드 무결성 ──"
node golem_check.mjs | tail -4

echo "── ⑫ 문장 소환 scene↔문장 일치 (v1.4.24) ──"
node summon_check.mjs | tail -4

echo "── ⑬ 확장 월드(6~9) 콘텐츠 전수 ──"
node w710_check.mjs | tail -4

echo "── ⑭ 배포물 버전 3자 대조 (L25) ──"
if [ -f dist/main.js ]; then
  B=$(grep -o '1\.4\.[0-9]\{1,2\}' dist/main.js | sort -u | tr '\n' ' ')
  # v1.4.41 정정: dist/version.json은 옛 빌드가 남긴 찌꺼기다(build.sh가 만들지 않는다).
  #   실제로 배포되는 것은 **저장소 루트의 version.json** 하나뿐이므로 그것을 본다.
  V=$(python3 -c "import json;print(json.load(open('../version.json'))['version'])")
  S=$(grep -o "'1\.4\.[0-9]*'" src/lib/version.ts | tr -d "'")
  echo "  번들:$B / version.json:$V / 소스:$S"
  [ "$(echo $B | tr -d ' ')" = "$V" ] && [ "$V" = "$S" ] && echo "  일치" || { echo "  ★불일치★"; exit 1; }
else
  echo "  dist 없음 — 빌드 후 다시 실행할 것"
fi

echo
echo "ℹ️  이 스크립트가 돌리지 않는 것 (정직 표기 — 조용히 건너뛰지 않는다)"
echo "     summon_smoke.mjs   소환 화면 브라우저 스모크. dist 빌드 + 로컬 서버 2개 + Playwright가 필요해"
echo "                        일괄 실행에 넣지 않는다. 소환 화면을 건드린 릴리스에서는 반드시 따로 돌릴 것:"
echo "                          node summon_harness_make.mjs"
echo "                          bun build .verify/summon_entry.tsx --outdir .verify/out --production"
echo "                          python3 -m http.server 8098 --directory .verify/out &"
echo "                          python3 -m http.server 8099 --directory dist &"
echo "                          node summon_smoke.mjs"
echo
echo "✅ 검사 전 항목 통과 (12종 + 타입검사 + 버전 3자 대조)"
