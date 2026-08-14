#!/usr/bin/env bash
# WordCraft 프로덕션 빌드 — bun 번들 + 정적 자산 + 콘텐츠 동기화
set -euo pipefail
cd "$(dirname "$0")"
export PATH=$PATH:/root/.bun/bin
CONTENT_SRC="/home/claude/work/Yehan_English_App/04_CONTENT"

# 타입 검사 (G-ENC 이전 단계 — 코드 정합)
/home/claude/.npm-global/bin/tsc -p tsconfig.json

# 번들 (bunfig.toml: jsx=react-jsx 필수 — SMOKE_LOG 봉합 결함 참조)
NODE_ENV=production bun build src/main.tsx --outdir dist --minify --define process.env.NODE_ENV='"production"'

# 정적 자산
cp index.html dist/
cp -r public/* dist/

# 콘텐츠 (04_CONTENT → dist/content)
mkdir -p dist/content/modules dist/content/diagnostics
[ -d "$CONTENT_SRC/modules" ] && cp "$CONTENT_SRC"/modules/*.json dist/content/modules/ 2>/dev/null || true
[ -d "$CONTENT_SRC/diagnostics" ] && cp "$CONTENT_SRC"/diagnostics/*.json dist/content/diagnostics/ 2>/dev/null || true

echo "── 빌드 완료 ──"
ls dist/ && du -h dist/main.js
gzip -c dist/main.js | wc -c | awk '{print "main.js gzip: " $1 " bytes"}'
