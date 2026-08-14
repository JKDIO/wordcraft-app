# v1.4.31 — 2026-08-14 (장비창 부위 레이어 조립 + 이미지·배포 자동화)

> ⚠️ `RELEASE_LOG.md`는 150KB다. 통째로 다시 쓰면 모델 문맥을 통과시켜야 해서 토큰이 폭증한다(L7).
> 그래서 이번 릴리스부터 **릴리스마다 별도 파일**로 남긴다. RELEASE_LOG에는 나중에 사람이 합치거나 그대로 둔다.

## 학습자 앱

- **장비창 전면 교체**: 12×16 팔레트 스왑 → **128×128 투명 레이어 11장 겹치기**.
  Dio님 지적 *"흉갑·검·망토·귀걸이·오라 있는데 하나도 안 보여"* 에 대한 답.
- **카테고리별 달성률 = 그 부위의 등급.** '문장과 문법' 뱃지를 따면 검만, '읽기의 눈'을 따면 투구만 바뀐다.
- 자산은 **Supabase Storage(public, `art` 버킷)** 에서 로드 — 앱 번들이 붓지 않고, 그림을 고쳐도 재배포가 필요 없다.
- 이미지 로드 실패 시 **옛 픽셀 영웅으로 폴백**(비행기모드·CDN 장애 대비).
- **canvas 미사용** — <img> 겹치기만 쓴다(WebView 안전, L8).

## 신규 파일

| 파일 | 역할 |
|---|---|
| `app/src/lib/heroSprite.ts` | 카테고리↔부위 매핑, z-order, Storage URL, 프리로드 |
| `app/public/css.d/10-loadout-art.css` | `.loadout-art` 규칙 |
| `.github/workflows/wc-bootstrap.yml` | 스냅샷 tgz → `app/` 소스 트리 (CI가 수행) |
| `.github/workflows/wc-build.yml` | `app/**` 변경 → 번들 빌드 → 루트 `main.js`·`app.css` |
| `_ci/README.md` | Claude↔CI 방아쇠·보고서 규약 |

## z-order (중요)

```
aura → cloak → shoulder → boots → chest → gloves → helm → earring → crown → pick → sword
```

★무기(`pick`·`sword`)는 반드시 `helm`보다 뒤★ — 앞에 두면 투구 옆 날개가 검을 덮는다(Dio님 지적으로 수정).

## 자산 파이프라인 (신규)

```
fal.ai ──URL──▶ Postgres(pg_net) ──▶ Edge Function art-forge ──▶ Storage art/hero/*.png
                                     Edge Function art-layer ──▶ Storage art/hero/layer/*.png
```

- `art-forge`: 원격 이미지를 서버가 직접 받아 배경제거·헤일로침식·격자축소·색감축 후 저장
- `art-layer`: base 대비 diff로 장비만 남긴 투명 레이어 생성
- 이미지 바이트가 모델 문맥을 한 번도 통과하지 않는다

## 배포 파이프라인 (신규)

- 소스 트리를 `app/` 에 두고 **CI가 빌드**한다. 작은 소스 파일만 커밋하면 번들은 CI가 만든다.
- `app.css`(114KB)는 통째로 고치지 않는다 — 새 규칙은 `app/public/css.d/NN-*.css` 조각으로.
- **안전장치**: 번들이 300KB 미만이면 CI가 실패시켜 라이브 앱을 지킨다.

## 검증

- CI 빌드: main.js 462,030B (gzip 146,269B) · app.css 117,988B
- 번들에 `jsxDEV` 없음 (L16 프로덕션 모드 확인)
- 라이브 `#/profile` 에서 이미지 9장 전부 로드 확인 (예한이 실제 뱃지 25/71 상태)
- 로컬 `tsc` 통과

## 검증 못 한 것 (정직 보고)

- **예한이 실기기(A24 WebView) 미확인** — 스프라이트 로딩 속도·프리로드 체감
- 등급 상승 순간 연출 미구현
- 슬롯 등급이 4단계라 **뱃지 하나하나가 전부 그림을 바꾸지는 않는다** (1/3·2/3·전부 지점에서 바뀜). 숫자는 뱃지마다 즉시 오른다
- 월드 7~10 독립 재검증 여전히 미완

## 연동 영향

없음. DB 스키마 불변, `answer_events` 불변. Storage에 `art` 버킷만 추가.
