# 저작규격 — 룬 기사 스프라이트 (fal 생성) v1.1 · 2026-08-14 (2026-08-29 뿔 투구 결함 수정)

> 이 문서는 **fal이 붙는 순간 바로 실행할 작업지시서**다. 프롬프트·모델·시드·후처리 명령·합격 기준이 다 들어 있다.
> 도형 기반 `heroArt.ts`는 폴백이자 **좌표 계약서**로 남는다 — 생성 자산도 같은 좌표를 쓴다.
>
> ⚠️ **2026-08-29 긴급 수정 — Dio님 지적, 실제 라이브 자산에서 확인됨**: "기독교에 반하는 머리 뿔·뿔 형태 투구를 쓰지 마라"는 지시에 따라 확인한 결과, **실제로 배포되어 예한이 앱이 지금 로딩하는 자산 `art/hero/layer/helm3.png`가 바이킹풍 뿔 투구**였다(§5 표의 t3 `horned steel helm` 문구가 그대로 반영된 결과). helm1·helm2·helm4·crown3·crown4는 실제 다운로드해 확인한 결과 뿔이 없었다(각각 후드/코가리개 투구/황금 날개투구/일반 왕관 — 날개와 왕관 뾰족장식은 뿔이 아니라 문제 없음). **§5 프롬프트 표에서 t3의 "horned" 문구를 제거했다.** ✅ **실제 자산(helm3.png) 교체도 2026-08-29 완료** — 상세는 §10과 `결함대장_DEFECT_LEDGER_v1.md` D0829-1.

---

## 0. 왜 생성으로 가는가

도형(96×120 · 셰이더)으로 1차 시도한 결과는 Dio님 판정 그대로 **기준 미달**이었다.
원인은 두 가지였고 둘 다 도형 방식의 구조적 한계다.

1. **디테일 밀도** — 레퍼런스 기사들은 갑옷 한 조각에 3~5단계 명암과 각인·리벳·긁힘이 들어 있다. 이걸 도형 API로 찍으려면 부위당 수백 줄이 필요하고, 등급 4개 × 부위 10개면 유지가 불가능하다.
2. **조형 감각** — 어깨 각도, 망토 주름의 흐름, 투구 곡률 같은 것은 좌표로 짜는 게 아니라 **그리는** 것이다.

생성 모델은 이 둘을 준다. 대신 **격자 정합·팔레트 일관성·투명 배경**을 못 준다 — 그건 `tools/pixelize.py`가 굽는다.

---

## 1. 산출물 목록

| # | 자산 | 규격 | 수량 |
|---|---|---|---|
| A | 전신 기사 5단계 (전체 달성률 0/20/45/75/100%) | 96×120 PNG (투명) | 5 |
| B | 슬롯 아이템 아이콘 (11슬롯 × 4등급) | 32×32 PNG (투명) | 44 |
| C | 장비창 배경 마법진 | 필요 시 | 1 |

**A와 B는 성격이 다르다.** A는 "지금 내 모습", B는 "슬롯 칸에 박히는 아이콘"이다.
지금 앱(`BadgeLoadout.tsx`)은 슬롯에 이모지를 쓰고 있는데, B가 나오면 그 자리를 대체한다.

---

## 2. 좌표 계약 (heroArt.ts `P`와 동일 — 절대 바꾸지 않는다)

캔버스 96×120, 캐릭터는 **아래쪽 정렬**(발끝 y=114).

| 기준 | 값 |
|---|---|
| 중심선 cx | 48 |
| 머리 | 중심 y=30, 반지름 13×14 (y 16~44) |
| 어깨선 | y=47, 폭 ±20 |
| 허리 | y=74, 폭 ±13 |
| 손 | (24, 85) / (72, 85) |
| 발끝 | y=114 |

**왜 계약이 필요한가**: 5단계가 각자 다른 크기·위치로 나오면 업그레이드할 때 캐릭터가 **점프한다**. 예한이가 느껴야 할 건 "내가 강해졌다"이지 "그림이 바뀌었다"가 아니다. 5장은 반드시 같은 자리에 서 있어야 한다.

---

## 3. 모델 선택 (fal 카탈로그)

| 용도 | 모델 | 이유 |
|---|---|---|
| 1차 생성 | `fal-ai/recraft/v3/text-to-image` (style `digital_illustration/pixel_art`) | 픽셀아트 스타일이 **모델 내장**이라 프롬프트 의존도가 낮다 |
| 대안 | `fal-ai/flux-lora` + 픽셀아트 LoRA | 레퍼런스에 더 가까운 톤이 필요할 때. `search_models`로 LoRA 탐색 |
| ★단계 변형★ | `fal-ai/flux-pro/kontext` | **같은 캐릭터를 유지한 채 장비만 교체**. 5단계 일관성의 핵심. ⚠️ 2026-08-29 실측: "갑옷을 평상복으로 벗기기" 류 편집에서 화풍이 사진풍으로 튀는 경향 2/2 확인됨(오버레이 파이프라인 문서 참고) — 뿔/로고 제거처럼 국소 편집에는 안정적이나 전신 화풍 변형이 필요하면 `fal-ai/nano-banana-pro/edit`(§3-대안 참고, `run_model` 도구로 호출)을 우선 검토할 것 |
| 아이콘 44종 | Recraft v3 (동일 스타일 고정) | 스타일 파라미터로 톤을 못 박는다 |

> 먼저 `search_models`로 카탈로그를 훑고 `get_pricing`으로 단가를 확인한 뒤 확정한다. 위 표는 착수 가설이다.

---

## 4. 일관성 전략 — 여기가 성패를 가른다

```
[1] t4(최고 등급) 를 먼저 생성한다
      ↑ 가장 정보량이 많은 단계를 기준으로 잡아야 아래 단계를 "빼면서" 만들 수 있다.
        t0부터 만들면 위로 갈수록 모델이 캐릭터를 새로 그린다.
[2] t4 이미지를 Kontext에 넣고 장비만 벗긴다
      "keep the exact same character, pose, face and canvas position.
       replace the golden winged armor with plain steel plate. remove the crown and wings."
[3] t3 → t2 → t1 → t0 순으로 연쇄
[4] 5장을 나란히 놓고 육안 검수 → 어긋나면 그 단계만 재생성
```

시드는 전 단계 동일하게 고정한다. 프롬프트 골격도 고정하고 **장비 구절만** 바꾼다.

---

## 5. 프롬프트 골격

**공통 접두 (절대 안 바꿈)**
```
pixel art game sprite, single character, full body, front-facing, standing idle,
young heroic knight, friendly confident face with large expressive eyes,
chunky readable silhouette, thick dark outline, limited palette, crisp hard pixels,
16-bit SNES JRPG style, centered, feet at bottom edge, solid #FF00FF background,
no text, no watermark, no shadow on ground
```

**단계별 장비 구절**

| 단계 | 구절 |
|---|---|
| t0 | `simple blue tunic, cloth wraps on feet, no armor, no weapon` |
| t1 | `worn brown leather vest with straps, leather boots and gloves, short wooden-handled sword, blue hood` |
| t2 | `banded iron armor, iron helm with nose guard (face visible), steel sword, blue cloak, iron pauldrons` |
| t3 | `polished steel plate armor with fauld, tall crested steel helm with a bright plume (face visible, NO horns), purple cloak, rune-etched greatsword glowing violet, rune pauldrons, silver crown` |
| t4 | `radiant golden rune plate armor, golden winged helm (face visible), starfield night cloak, flaming greatsword, golden angel wings, jeweled golden crown, glowing violet runes` |

**금지 구절 (negative)**
```
blurry, anti-aliased, soft gradient, 3d render, realistic, photo, multiple characters,
cropped limbs, closed helmet hiding the face, horns, horned helmet, devil horns, demon horns,
text, signature, drop shadow
```

> ★`closed helmet hiding the face` 를 반드시 negative에 넣는다★ — 1차 시도에서 최고 등급의 얼굴이 사라졌고,
> 얼굴 없는 영웅은 아이가 자기라고 느끼지 못한다. 이건 취향이 아니라 **요구사항**이다.
>
> ★★`horns` / `horned helmet` / `devil horns` / `demon horns` 를 반드시 negative에 넣는다★★ (2026-08-29 신설,
> Dio님 지시) — 이 캐릭터·자산에는 어떤 형태로도(머리에 직접 달린 뿔이든 투구에 달린 뿔 장식이든) 뿔을 쓰지 않는다.
> 기독교 신앙에 반하는 상징(악마·이교 이미지 연상)이기 때문이며, 이건 취향이 아니라 **절대 요구사항**이다.
> 날개(angel wings)·왕관의 뾰족한 첨탑 장식은 뿔이 아니므로 허용된다 — 혼동하지 말 것.

---

## 6. 후처리 (이미 구현됨 — `tools/pixelize.py`)

```bash
# 전신
python3 tools/pixelize.py raw_t4.png hero_t4.png \
        --w 96 --h 120 --colors 28 --key '#ff00ff' --outline --snap --preview 6

# 아이콘
python3 tools/pixelize.py raw_sword4.png icon_sword4.png \
        --w 32 --h 32 --colors 14 --key '#ff00ff' --outline --snap --preview 8
```

하는 일: 크로마키 배경 제거 → 내용 크롭 → 격자 정합 축소(프리멀티플라이 면적평균) →
k-means 색 감축 → 프로젝트 팔레트 스냅 → 1px 아웃라인 → 확대 미리보기.

`--snap` 은 앱의 다른 픽셀 요소(무대·문장소환)와 톤을 맞춘다. 생성물이 튀면 이걸 끈다.

---

## 7. 합격 기준 — 통과 못 하면 재생성

세계적 게임 디자이너 페르소나(실루엣/색채/캐릭터/UI 각 1인)가 렌더 이미지를 **직접 보고** 판정한다.

| # | 기준 | 판정 |
|---|---|---|
| C1 | 5단계를 겹쳐 놨을 때 머리·발 위치가 ±2px 이내 | 계측 |
| C2 | **모든 단계에서 눈이 보인다** | 육안 |
| C3 | 실루엣만(검정 마스크) 봐도 단계 구분이 된다 | 육안 |
| C4 | 슬롯 11개 중 켜진 것이 화면에서 **하나하나 식별**된다 | 육안 |
| C5 | 팔이 흉갑에 먹히지 않는다 | 육안 |
| C6 | 색이 24~32개 이하, 팔레트가 앱과 충돌하지 않는다 | 계측 |
| **C8 (신설, 2026-08-29)** | **뿔·뿔 투구가 어디에도 없다**(머리 직접·투구 장식 포함) | 육안 — 최우선 검수 항목 |
| C7 | 예한이가 t2 → t3 변화를 보고 "오"가 나오는가 | ★최종 판정: Dio님★ |

C7이 진짜 기준이다. C1~C6, C8은 그 앞에서 걸러내기 위한 그물일 뿐이다. **C8은 2026-08-29부터 다른 항목보다 우선 검수한다.**

---

## 8. 앱 통합

1. 5장 + 44장을 `public/art/hero/` 에 넣는다 (base64 인라인 금지 — 번들이 붓는다)
2. `BadgeLoadout.tsx` 의 영웅 렌더를 `<img>` 로 교체, `image-rendering: pixelated`
3. 슬롯 이모지를 아이콘 PNG로 교체
4. **프리로드** — 단계가 오를 때 이미지가 늦게 뜨면 보상 순간이 죽는다
5. 등급 상승 시 짧은 플래시 연출 (CSS만. WebView라 브라우저 전용 API 금지 — L8)

---

## 9. 비용 관리 (Dio님 우려사항)

- Recraft v3 1장 ≈ $0.04, Kontext 1장 ≈ $0.04 기준
- 전신 5장 × 후보 4장 = 20장 ≈ $0.8
- 아이콘 44장 × 후보 2장 = 88장 ≈ $3.5
- 재작업 여유 포함 **$6~8** 예상 (넣어두신 $15 안)
- 낭비를 막는 방법: **후보를 여러 장 뽑되 제가 먼저 보고 고른다.** Dio님께는 고른 것만 보여드린다.
  단가는 착수 시 `get_pricing`으로 실측해 이 문서를 갱신한다.

## 10. 2026-08-29 결함 기록·해소 — 실제 라이브 자산 뿔 투구 발견 및 교체 완료

`결함대장_DEFECT_LEDGER_v1.md` D0829-1로 등재됨: 당시 Supabase Storage `art/hero/layer/helm3.png`(2026-08-14 배포, 앱이 실시간 로드 중)가 §5 표의 옛 t3 문구(`horned steel helm`)를 그대로 반영해 **바이킹풍 뿔 투구**로 생성돼 있음을 실제 다운로드·육안 확인했다. helm1(후드)·helm2(코가리개 철투구)·helm4(황금 날개투구)·crown3·crown4(둘 다 일반 왕관, 뾰족장식은 뿔 아님)는 문제 없음을 같은 방식으로 확인했다.

**✅ 2026-08-29 재생성·배포 완료**: `hero/base.png`(맨몸 기준)를 기준으로 원본 `hero/helm3.png`를 `fal-ai/flux-pro/kontext`로 편집해 뿔→크레스트+깃털 장식 투구로 교체, `art-forge`(128×128, colors 48) → `art-layer`(threshold 95 — 기본 55에서 상향, 몸통 영역 diff 노이즈 282px→14px로 감소 확인)로 재처리해 `hero/helm3.png`·`hero/layer/helm3.png`를 실제로 덮어썼다. 배포 후 라이브 URL 재다운로드로 sha256 대조까지 완료(`937de13fae91c7afe581f47be9a249158428883400a08ef6374c486e8c7fbbd4`). 앱 재배포는 불필요했다(Storage 직접 반영).

*작성: 2026-08-14 · 2026-08-29 뿔 투구 결함 수정+실제 자산 교체 완료 · WordCraft 프로젝트*
