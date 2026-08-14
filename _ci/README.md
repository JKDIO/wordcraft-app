# `_ci/` — CI 방아쇠와 보고서

이 폴더는 **Claude가 CI를 다루기 위한 인터페이스**다. 사람이 손댈 일은 거의 없다.

## 왜 이런 방식인가

저장소의 `main.js`는 460KB, `app.css`는 114KB, 소스 트리는 556KB다.
이걸 Claude가 직접 읽거나 커밋하려면 **모델 문맥을 통과시켜야 해서** 토큰이 수십만 개 든다 (영구교훈 L7 위반).

그래서 **무거운 일은 전부 CI가 한다.**
Claude는 작은 방아쇠 파일을 밀고, CI가 결과를 작은 보고서로 되돌려 준다.

## 방아쇠

| 파일 | 밀면 실행되는 것 | 내용 |
|---|---|---|
| `bootstrap.txt` | `wc-bootstrap` — 저장소에 이미 있는 스냅샷 tgz를 풀어 `app/` 소스 트리로 만든다 | tgz 경로 한 줄 |
| `build.txt` | `wc-build` — `app/`을 빌드해 루트 `main.js`·`app.css` 갱신 | 아무 내용 (타임스탬프 권장) |

`app/**` 아래 소스를 고치면 `wc-build`는 **자동으로** 돈다. `build.txt`는 수동 재빌드용이다.

## 보고서

| 파일 | 내용 |
|---|---|
| `BOOTSTRAP_REPORT.txt` | 풀린 파일 목록, package.json, 핵심 파일 존재 여부 |
| `BUILD_REPORT.txt` | 번들 크기·sha256·gzip 크기, 소스 커밋 |

## CSS 규약

`app.css`(114KB)는 통째로 고치지 않는다. 새 규칙은 **`app/public/css.d/NN-이름.css`** 에 작은 파일로 넣는다.
빌드가 `app.css` 뒤에 이어 붙인다. 이유는 위와 같다 — 토큰.

## 건드리지 않는 것

- `index.html` — 배포본이 스냅샷보다 최신일 수 있다
- `content.json` / `vocab.json` — 별도 파이프라인으로 관리한다
- `answer_events` 등 DB 데이터 — 삭제 절대 금지
