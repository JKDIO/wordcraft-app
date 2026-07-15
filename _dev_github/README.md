# _dev_github — 릴리스별 소스 스냅샷 보관 (버전관리용)

이 폴더는 **낡지 않는 것만** 둔다: 각 릴리스의 **소스 스냅샷 tarball**(커밋에 묶여 불변).

- `wordcraft_src_v1.1.0.tgz` — v1.1.0 소스 전체(src + 빌드설정 + public/app.css + version.json).
- 새 릴리스 배포마다 `wordcraft_src_v{버전}.tgz`를 여기 추가한다.

## ⚠️ 여기에 "살아있는 문서"를 복사하지 말 것
개발 SSOT와 최신 문서는 **딱 두 곳**에서만 관리한다(드리프트 최소화):
1. **노트북** `Yehan_English_App/` — 소스 SSOT(`03_APP/wordcraft/`), `00_START_HERE.md`, `06_RELEASES/RELEASE_LOG.md`, `03_APP/연동계약_CONTRACT.md`
2. **claude.ai 프로젝트 문서** — 위 문서들의 항상-보이는 미러

배포된 앱 자체는 저장소 루트(main.js·app.css·content.json·index.html·version.json)이고 Vercel이 자동배포한다.
