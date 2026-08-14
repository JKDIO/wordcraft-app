# 진행상황 2026-08-14 — 노트북 SSOT 동기화 + APP_VERSION 오탐 배너 정정

작업 유형: **A(앱)** · 결론부터 씁니다.

## 결론

1. **L14의 세 번째 다리(노트북 반영)를 이번에 닫았다.** 새 스냅샷 `_dev_github/src_v1.4.34/` 를 만들고,
   GitHub `app/` 트리와 **blob 해시로 전수 대조**해 일치를 증명했다.
2. **그 과정에서 라이브 결함 하나를 찾았다** — 소스 `APP_VERSION` 이 1.4.30에 멈춰 있어
   최신 번들을 쓰는 예한이에게 "새 버전이 있어요" 배너가 **상시 오탐**으로 떠 있었다. 정정 커밋 완료.
3. **정정 후 라이브 화면까지 눈으로 확인했다** — "현재 v1.4.34 / 최신 v1.4.34 · ✓ 최신 버전을 쓰고 있어요",
   정보 탭 빨간 `!` 소멸. 단 **PC 브라우저 기준**이며, 예한이 폰(A24 WebView) 확인은 여전히 미완.

---

## 1. 찾은 결함 — APP_VERSION 상시 오탐 (L39로 제정)

```
App.tsx:79   const updateAvailable = !!latest && isNewer(latest.version, APP_VERSION)
서버 version.json = "1.4.34"     ← v1.4.31~34 배포 때마다 올렸다
app/src/lib/version.ts = '1.4.30' ← 네 번 다 안 올렸다
→ isNewer('1.4.34','1.4.30') === true  ← 영원히 참
```

증상:
- 하단 `정보` 탭에 빨간 `!` 상주 (`App.tsx:422`)
- `정보` 화면에서 "지금 업데이트" 버튼 → `location.reload()` → 아무것도 안 바뀜 → 또 뜸
- 앱 정보 화면 버전 표기가 **v1.4.30** (실제 1.4.34)
- 관제실 상단에도 같은 오탐 (`AdminPage.tsx:313`)

조치: `APP_VERSION = '1.4.34'` push (commit `d65b4fd`). 전송 후 blob SHA `8072fd99…` 로 대조 — 한 글자도 안 틀림.
CI 재빌드 확인: `_ci/BUILD_REPORT.txt` 의 `source_commit=d65b4fd…`, main.js sha256 `021ef9bf…` → **`cde284c2…`** (크기 462,715B 동일 — 버전 문자열 길이가 같아서).
라이브 확인: `#/info` 에서 **현재 v1.4.34 / 최신 v1.4.34 · "✓ 최신 버전을 쓰고 있어요"**, 정보 탭 빨간 `!` 사라짐.

왜 세 번의 배포에서 못 잡았나: 매번 화면을 눈으로 봤지만 **본 화면이 장비창이었다.**
배너는 다른 화면에 있었고 그 화면을 열지 않았다. "진실 3종 대조"도 문서 숫자만 맞추고
소스 상수를 실제로 열지 않았다. → **L39**

## 2. 컨테이너 ≠ SSOT (L40으로 제정)

노트북에 복사하기 전에 컨테이너 `/home/claude/wc` 를 GitHub `app/` 와 전수 대조했다.

| 결과 | 개수 |
|---|---|
| 일치 | 42 / 57 |
| 내용 다름 | 14 (App.tsx · store.ts · supabase.ts · AdminPage.tsx · Profile.tsx · ReviewMine.tsx · RewardBoard.tsx · WordDex.tsx · build.sh · verify.sh · heroSprite.ts · BadgeLoadout.tsx · version.ts · app.css) |
| **컨테이너에 아예 없음** | **1 (`src/lib/review.ts`)** |

**컨테이너를 그대로 노트북에 밀었다면 기능 14개를 되돌리는 사고였다** — L11이 경고한 바로 그 상황.

## 3. 노트북 동기화 방법 (다음 세션이 그대로 따라 하면 된다)

### 폴더

```
C:\Users\jkd83\Desktop\VIBE CODING\Projects\WordCraft\wordcraft-app   ← 진짜
C:\Users\jkd83\Desktop\VIBE CODING\Projects\Word Craft                ← 빈 폴더. 무시
```

`device_bash` 에서는 `$HOME/mnt/WordCraft/wordcraft-app`.

### 제약 (실측 — 자세한 표는 L41)

| 항목 | 상태 |
|---|---|
| `filesystem` MCP | **죽어 있음** — `draft-07` 스키마 오류. 모든 호출 실패 |
| `device_bash` 네트워크 | 없음 (프록시 403) |
| `device_bash` 삭제 | **불가**. `mv` 로 `_to_delete/` 에 옮길 것 |
| `.github/workflows/**` 쓰기 | **보호됨 — 원격 도구로 불가.** 사본은 `_dev_github/ci/` 에 |
| 컨테이너 네트워크 | `api.github.com` 만 열려 있고 이 저장소는 권한 거부. raw/codeload 차단 |

### 절차

1. `cp -r src_v<직전> src_v<새버전>` (device_bash)
2. GitHub 디렉터리 조회 → 각 파일의 `sha` = **git blob SHA-1**
3. 노트북에서 `git hash-object <파일>` (저장소가 아니어도 동작) → 목록 비교 → **델타만 추린다**
4. 델타 파일을 `SendUserFile` → `device_commit_files` 로 전송 (바이트 그대로, 문맥 통과 없음)
5. **목적지에서 다시 `git hash-object` 로 대조** — 일치하면 전송이 완벽했다는 증명

이번 델타는 6개뿐이었다: `loadout.ts` · `heroSprite.ts` · `version.ts` · `BadgeLoadout.tsx` ·
`css.d/10-loadout-art.css` · `css.d/20-loadout-levelup.css`. 전부 SHA 일치 확인.

## 4. 아직 못 한 것 (숨기지 않고 적는다)

- **예한이 폰(A24 WebView)에서 확인 못 함.** PC 브라우저에서만 PASS다. 폰은 캐시가 남아 한동안 옛 번들일 수 있다.
- **노트북 루트 산출물이 낡았다** — `main.js` 460,897B / `app.css` 117,078B 는 v1.4.30 시점이다
  (`version.json` 만 1.4.34로 갱신했다). CI가 다시 만드는 파일이라 SSOT 관점에서는 문제가 없지만,
  노트북에서 앱을 직접 열면 옛 화면이 뜼다.
- **예한이 실기기(A24) 확인**과 **월드 7~10 독립 재검증**은 여전히 미완.

*작성: 2026-08-14 · WordCraft*
