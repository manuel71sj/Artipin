# Artipin

AI가 만든 HTML·이미지·문서를 링크 하나로 공유하고, 받는 사람이 **로그인 없이** 화면 위 원하는 위치에 핀 댓글을 남기는 사내 검토 도구.

```
업로드 → 링크 공유 → 로그인 없이 핀 댓글 → 확인·해결 → 같은 링크로 새 버전 교체
```

AI에게 보고서·목업·대시보드를 만들게 하면 결과물을 사람에게 보여 주고 의견을 받아 다시 고치는 과정이 반복된다. Artipin은 이 과정에서 '어디가 문제인지'를 말로 설명하는 수고를 줄인다. 검토자는 화면의 그 위치를 눌러 댓글을 달고, 소유자는 같은 링크에 고친 버전을 올린다.

## 무엇이 다른가

- **댓글에 가입이 필요 없다.** 검토자는 이름만 입력하면 된다. 소유자만 Google·GitHub로 로그인한다.
- **사내 서버에 설치한다.** 컨테이너 1개와 SQLite로 동작하므로 업로드한 산출물이 외부 서비스로 나가지 않는다.
- **업로드 HTML을 격리된 별도 origin에서 실행한다.** 본문은 앱과 다른 호스트에서 `CSP sandbox`와 `connect-src 'none'`을 걸고 서빙하므로 업로드한 스크립트가 앱 쿠키·API에 닿지 않고, 외부로 데이터를 보낼 수도 없다.

비슷한 서비스 6곳(coeditHTML, HaveTML, Artifact Share, commentable.link, Tiiny Host, BugSmash)과 기능을 비교한 결과는 [`docs/benchmark-feedback-tools.html`](docs/benchmark-feedback-tools.html)에 있다.

## 기능

### 올리기

| 형식 | 한도 | 비고 |
| --- | --- | --- |
| HTML | 5MB | 파일 선택 또는 코드 붙여넣기, UTF-8 |
| Markdown·JSON | 5MB | 업로드 때 HTML로 변환해 같은 방식으로 댓글 |
| 이미지(PNG·JPEG·WebP) | 10MB | 파일 내용(매직 바이트)으로 형식 판정 |
| PDF | 20MB·50쪽 | 페이지별 이미지로 변환, 쪽마다 핀 댓글 |
| zip 사이트 | 20MB·항목 300개 | CSS·JS·이미지가 나뉜 산출물을 그대로, `index.html` 필수 |

### 댓글

- 화면 위치 핀 댓글: HTML은 요소 기준, 이미지·PDF는 이미지 기준 좌표
- 텍스트를 드래그해 문장에 댓글, 다시 열면 인용문 하이라이트
- 답글, 해결·재개, 핀과 댓글 목록 사이 이동
- 새 댓글 자동 갱신, 함께 보는 사람 수와 실시간 커서 표시
- HTML 뷰어에서 데스크톱·태블릿·모바일 폭으로 전환해 확인

### 버전

- 같은 링크로 본문 교체: 링크·댓글·열람 기록이 그대로 남는다
- 모든 버전 보관, 이전 버전 보기, 두 버전 나란히 비교, 롤백
- 소유자 편집 모드: 화면에서 문구를 고치고 수정본 HTML을 내려받아 교체

### 공유와 접근 제어

- 추측할 수 없는 128비트 토큰 링크
- 링크 만료(1·7·30일), 링크 새로 만들기(이전 링크 끊기)
- 비밀번호 보호
- 보기 전용 링크: 본문만 보여 주고 댓글은 보이지 않는다
- 종단간 암호화(HTML·이미지): 브라우저에서 암호화해 올리고, 키는 링크의 `#` 뒤에만 있어 서버가 본문을 읽지 못한다

### 소유자·팀

- 내 파일 목록, 파일별 미해결 댓글 수와 열람자 수
- 팀: 초대 링크로 동료를 모으고, 팀 파일은 멤버 모두가 소유자처럼 관리한다

## 아직 없는 것

- 피드백 내보내기(댓글을 마크다운으로 복사해 AI에게 다시 넘기기) — 다음 작업 1순위
- AI 에이전트 연동(MCP·CLI), 이슈 트래커 연동
- 검색엔진 색인 차단 헤더(`noindex`) — 외부에서 접근할 수 있게 배포한다면 먼저 넣어야 한다

## 문서

| 문서 | 내용 |
| --- | --- |
| [`docs/designs/artipin-mvp.md`](docs/designs/artipin-mvp.md) | 설계 정본 |
| [`docs/artipin-mvp-plan.html`](docs/artipin-mvp-plan.html) | 이슈 로드맵 |
| [`docs/html-sandbox-design.html`](docs/html-sandbox-design.html) | HTML 샌드박스 위협 모델 |
| [`docs/benchmark-feedback-tools.html`](docs/benchmark-feedback-tools.html) | 유사 서비스 기능 벤치마킹과 추가 기능 판정 |
| [`docs/benchmark-design.html`](docs/benchmark-design.html) | 디자인 벤치마킹 |

## 로컬 실행

```bash
pnpm install
pnpm dev
```

`.env.local`에 아래 환경변수를 넣고 `http://app.localhost:3900`으로 접속한다(`APP_HOST=app.localhost:3900`, `CONTENT_HOST=content.localhost:3900`). 개발 서버에서는 로그인 화면에 "테스트 계정으로 로그인" 버튼이 나와 OAuth 자격증명 없이 소유자 화면을 볼 수 있다.

PDF 업로드는 `pdftoppm`(poppler)으로 페이지 이미지를 만들므로 로컬에 poppler가 필요하다(macOS: `brew install poppler`). 컨테이너 이미지에는 `poppler-utils`가 들어 있다.

## 환경변수

| 이름 | 설명 |
| --- | --- |
| `AUTH_SECRET` | Auth.js 세션(JWT) 서명 키. `openssl rand -base64 32` 등으로 생성 |
| `AUTH_GOOGLE_ID` | Google OAuth 클라이언트 ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth 클라이언트 시크릿 |
| `AUTH_GITHUB_ID` | GitHub OAuth App 클라이언트 ID |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App 클라이언트 시크릿 |
| `APP_HOST` | 소유자 화면 호스트(`host[:port]`, 예: `app.localhost:3000`). `localhost`가 포함되면 http, 아니면 https. 복사하는 공유 링크는 이 값이 아니라 접속 중인 주소를 쓴다 |
| `DATA_DIR` | SQLite(`app.db`)와 `uploads/`를 두는 디렉터리. 기본 `./data`, 컨테이너 이미지는 `/data` |
| `CONTENT_HOST` | 업로드 본문 서빙 호스트(`host[:port]`, 예: `content.localhost:3000`). `APP_HOST`와 다른 값이어야 하며, 이 호스트는 `/c/*`만 응답한다 |

로그인은 Google·GitHub 개인 계정을 쓰며 도메인 제한은 없다. 제공자별 콜백 URL은 `{APP_HOST 기준 origin}/api/auth/callback/{google|github}`다(`APP_HOST`에 `localhost`가 포함되면 `http://`, 아니면 `https://`).

- Google: OAuth 동의 화면을 External로 두고 게시 상태를 "In production"으로 한다(Testing이면 등록된 테스트 사용자만 로그인된다).
- GitHub: OAuth App은 콜백 URL이 하나뿐이므로 로컬용과 배포용 앱을 따로 등록한다.

`next start`가 아닌 배포(컨테이너·프록시 뒤)에서는 `AUTH_TRUST_HOST=true`가 필요하다. 이 값이 없으면 로그인 세션이 인식되지 않는다.

## 컨테이너 배포

사내 서버에 컨테이너 1개로 띄운다. 필요한 것: 호스트명 2개(`APP_HOST`, `CONTENT_HOST`)를 같은 컨테이너(3000 포트)로 라우팅하는 TLS 종단(사내 리버스 프록시), `/data`에 마운트할 영속 볼륨.

```bash
docker build -t artipin .
docker run -d --name artipin -p 3000:3000 -v artipin-data:/data \
  -e APP_HOST=app.example.com -e CONTENT_HOST=content.example.com \
  -e AUTH_SECRET=... -e AUTH_GOOGLE_ID=... -e AUTH_GOOGLE_SECRET=... \
  -e AUTH_GITHUB_ID=... -e AUTH_GITHUB_SECRET=... -e AUTH_TRUST_HOST=true \
  artipin
```

컨테이너는 비루트 사용자 `node`(uid 1000)로 실행된다. 이 버전을 root 소유 파일이 든 기존 볼륨에 처음 배포할 때는 서비스를 멈춘 뒤(Swarm이면 scale 0) 한 번 소유자를 바꾸고 배포한다.

```bash
docker run --rm -v artipin-data:/data alpine chown -R 1000:1000 /data
```

기동할 때 마이그레이션이 자동 적용된다(`pnpm db:migrate`와 같은 동작). 프록시는 요청의 `Host` 헤더를 그대로 전달해야 한다.

이 버전(마이그레이션 0001)을 owners 행이 있던 기존 DB에 처음 적용할 때는 `AUTH_SECRET`을 새 값으로 바꿔 기존 세션을 모두 무효화한다(owners id가 1부터 다시 매겨져 옛 세션이 다른 소유자에게 붙을 수 있다).

## 백업

```bash
DATA_DIR=/path/to/data scripts/backup.sh /path/to/backups
```

`sqlite3 .backup`으로 일관된 `app.db` 사본을 만들고 `uploads/`와 함께 `artipin-<시각>/`에 둔다(`sqlite3` CLI 필요). 실행 중인 `app.db` 파일을 그대로 복사하지 않는다. `sqlite3`는 볼륨이 있는 호스트(컨테이너와 같은 커널)에서 실행한다. 백업 도중 올라온 파일은 DB 사본에는 있고 `uploads/` 사본에는 없을 수 있다(그 파일 1건이 복원 후 404). 사용이 적은 시간에 실행하면 충분하다.
