# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Artipin은 AI가 만든 HTML·이미지를 링크로 공유하고 화면 위에 핀 댓글을 받는 사내 MVP다. 설계 정본은 `docs/designs/artipin-mvp.md`, 이슈 로드맵은 `docs/artipin-mvp-plan.html`, HTML 샌드박스 위협 모델은 `docs/html-sandbox-design.html`이다. 문서·주석·커밋은 한국어로 쓴다.

@AGENTS.md

## 명령

패키지 매니저는 pnpm만 쓴다(npm/npx 금지).

```bash
pnpm dev                              # http://app.localhost:3900 (APP_HOST/CONTENT_HOST는 .env.local)
pnpm exec biome check src scripts     # lint+format 검사. 인자 없는 `pnpm lint`는 전역 gitignore로만 무시되는 로컬 도구 산출물(.omx/ 등)까지 검사해 실패할 수 있다
pnpm exec tsc --noEmit
pnpm build                            # output: standalone
pnpm db:generate                      # src/db/schema.ts → drizzle/NNNN_*.sql
pnpm db:migrate                       # DATA_DIR의 app.db에 적용 (DATA_DIR=<dir> pnpm db:migrate 로 사본 검증)
pnpm metrics                          # scripts/metrics.sql 지표 출력
```

- 자동화 테스트 스위트는 없다. 검증은 biome·tsc·build와 실제 서버(curl, 브라우저)로 한다.
- 로컬 로그인: `next dev`에서만 로그인 화면에 "테스트 계정으로 로그인" 버튼이 나온다(고정 소유자 `dev-login`/`test-owner`). OAuth 자격증명 없이 소유자 화면을 확인할 때 쓴다.
- 운영 빌드 확인: `AUTH_TRUST_HOST=true APP_HOST=app.localhost:3001 CONTENT_HOST=content.localhost:3001 pnpm exec next start -p 3001`. `AUTH_TRUST_HOST` 없이는 세션이 인식되지 않는다. standalone 경고는 무시해도 된다.
- 같은 디렉터리에서 `next dev`는 하나만 뜬다(`.next/dev/lock`). `pnpm build`는 dev 서버와 병행 가능하다.
- 환경변수 목록·OAuth 앱 등록·컨테이너 배포·백업(`scripts/backup.sh`)은 `README.md`에 있다.

## 아키텍처

### 두 호스트 분리 (보안의 핵심)
한 Next 앱이 Host 헤더로 두 역할을 한다. `src/proxy.ts`(Next 16에서 middleware 대신 쓰는 파일)가 분기한다.
- `APP_HOST`: 소유자 화면·뷰어·API. 모든 응답에 `frame-ancestors 'none'`. `/c/*`는 404.
- `CONTENT_HOST`: `/c/[token]`만 응답해 업로드 본문을 서빙한다. 앱과 다른 origin이라 업로드 HTML이 앱 쿠키·API에 닿지 않는다.
- `src/app/c/[token]/route.ts`가 HTML에 `CSP: sandbox allow-scripts; connect-src 'none'; form-action 'none'; frame-ancestors <APP origin>`을 붙인다. 외부 리소스(`default-src`)는 일부러 허용한다(CDN 차트 등, 위협 문서 참조).
- origin 스킴 규칙은 `src/lib/hosts.ts` 한 곳(호스트에 `localhost`가 있으면 http).

### HTML 핀 댓글 브리지
- `src/lib/bridge.ts`가 업로드 HTML에 스크립트를 주입한다(신뢰할 수 없는 문서 안에서 실행). 문자열 템플릿이라 그 소스에 닫는 script 태그·백틱·`${`를 넣지 않는다.
- 뷰어(`src/app/s/[token]/_components/html-viewer.tsx`)와 postMessage로 통신한다: iframe→부모 `bridge-ready`, `anchor-picked{selector, relX, relY}` / 부모→iframe `mode`, `render-pins`. 부모는 `e.source`와 스키마를 검증한 메시지만 받는다. 브리지가 3초 안에 준비되지 않으면 핀 댓글 미지원으로 표시한다.
- 이미지 뷰어는 브리지 없이 이미지 기준 상대 좌표(0~1)로 핀을 단다.

### 인증 (`src/auth.ts`)
- Auth.js(next-auth 5 beta) JWT 세션. 제공자는 Google·GitHub, 도메인 제한 없음.
- 소유자는 `owners(provider, provider_account_id)` 유일 키로 식별한다. email은 표시용이며 식별·병합에 쓰지 않는다(미검증 email로 다른 소유자 행을 차지하는 경로를 막기 위해).
- 관리 권한(소유자처럼 다루기) 판정은 `src/lib/access.ts`의 `canManage`(행 값)·`manageable`(SQL 조건) 한 곳에서 한다: 본인이 올린 파일이거나 `files.team_id`의 팀 멤버. 호출부에 `ownerId` 비교를 다시 쓰지 않는다.
- jwt 콜백이 로그인 시 owners를 upsert하고 `token.id = String(owners.id)`. 모든 호출부는 `session.user.id`(문자열)를 `Number()`로 owners.id와 비교한다. 세션은 DB와 대조하지 않으므로 owners 테이블을 재생성해 id가 재사용되면 `AUTH_SECRET`을 교체해야 한다.
- 개발 전용 `dev-login` 제공자는 `process.env.NODE_ENV === "development"` 직접 비교로만 켠다. `next build`가 이 식을 `"production"`으로 인라인해 운영 산출물에서 빠진다. 런타임 env 플래그로 바꾸지 않는다.

### 데이터 (`src/db`)
- SQLite(better-sqlite3, WAL, `foreign_keys=ON`) + Drizzle. DB와 `uploads/`는 `DATA_DIR`(기본 `./data`, 컨테이너 `/data`).
- 테이블: `owners`, `files`(share_token, soft delete `deleted_at`), `comments`(parent로 답글, anchor JSON, resolved_at), `views`(file, visitor_id 복합 PK), `teams`(`invite_code`는 재발급 시 덮어쓴다)·`team_members`(team, owner 복합 PK), `files.team_id`(null이면 개인 파일).
- 마이그레이션은 기동 시 `src/instrumentation.ts`가 `./drizzle`을 적용한다. 그래서 `pnpm dev`/`start`/컨테이너 기동만으로 실제 DB가 바뀐다 — 새 마이그레이션은 DB 사본(`sqlite3 data/app.db ".backup '<dir>/app.db'"` 후 `DATA_DIR=<dir> pnpm db:migrate`)으로 먼저 검증한다.
- drizzle 마이그레이터는 파일 해시가 아니라 `_journal.json`의 시각(created_at)으로 적용 여부를 정하고, 전체를 트랜잭션 안에서 돌린다(그 안에서 `PRAGMA foreign_keys`는 무효). 기존 마이그레이션을 지우고 재생성하지 말고, `db:generate` 결과 SQL은 반드시 읽고 필요하면 손질한다(SQLite 테이블 재생성 시 `INSERT … SELECT`·`ADD COLUMN … NOT NULL`이 실패할 수 있다).
- 실행 중인 `app.db`는 `cp`로 복사하지 않는다(WAL). 호스트 sqlite3와 컨테이너가 같은 DB를 동시에 열지 않는다.

### 업로드·방문 기록
- `src/lib/upload.ts`: 형식·한도의 단일 위치. 이미지는 매직 바이트로 판정(PNG/JPEG/WebP ≤10MB), PDF는 `%PDF-`로 판정(≤20MB·50쪽)하고 업로드 시 `pdftoppm`으로 `uploads/<uuid>/{n}.png` 디렉터리로 변환해 `/c/{token}?p={n}`으로 서빙하며(앵커 `{kind:"pdf", page, x, y}`), HTML·Markdown·JSON은 확장자(≤5MB, .md·.markdown·.json은 업로드·교체 시 HTML로 변환해 kind html로 저장하며 새니타이즈하지 않는다). 클라이언트 MIME은 믿지 않는다. 10MB·20MB 업로드를 위해 `next.config.ts`의 `proxyClientMaxBodySize`를 올려 두었다.
- 댓글 작성자는 로그인하지 않는다. APP_HOST 전용 `artipin_visitor` 쿠키(`src/lib/visitor.ts`, Route Handler에서만 호출)로 익명 방문자를 구분하고, 뷰어 로드 시 `/api/s/[token]/view`가 `views`에 기록한다(소유자 본인 조회 제외).
