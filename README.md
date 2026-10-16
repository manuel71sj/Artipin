# Artipin

AI가 만든 HTML·이미지를 링크로 공유하고, 화면 위에 핀 댓글을 받는 사내 MVP. 설계: `docs/designs/artipin-mvp.md`

## 로컬 실행

```bash
pnpm install
pnpm dev
```

## 환경변수

| 이름 | 설명 |
| --- | --- |
| `AUTH_SECRET` | Auth.js 세션(JWT) 서명 키. `openssl rand -base64 32` 등으로 생성 |
| `AUTH_GOOGLE_ID` | Google OAuth 클라이언트 ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth 클라이언트 시크릿 |
| `AUTH_ALLOWED_DOMAIN` | 로그인을 허용할 회사 도메인(Google `hd` 클레임과 일치해야 함) |
| `APP_HOST` | 소유자 화면 호스트(`host[:port]`, 예: `app.localhost:3000`). 공유 링크 origin에 쓰며 `localhost`가 포함되면 http, 아니면 https |
| `DATA_DIR` | SQLite(`app.db`)와 `uploads/`를 두는 디렉터리. 기본 `./data`, 컨테이너 이미지는 `/data` |
| `CONTENT_HOST` | 업로드 본문 서빙 호스트(`host[:port]`, 예: `content.localhost:3000`). `APP_HOST`와 다른 값이어야 하며, 이 호스트는 `/c/*`만 응답한다 |

`next start`가 아닌 배포(컨테이너·프록시 뒤)에서는 `AUTH_TRUST_HOST=true`가 필요하다. 이 값이 없으면 로그인 세션이 인식되지 않는다.

## 컨테이너 배포

사내 서버에 컨테이너 1개로 띄운다. 필요한 것: 호스트명 2개(`APP_HOST`, `CONTENT_HOST`)를 같은 컨테이너(3000 포트)로 라우팅하는 TLS 종단(사내 리버스 프록시), `/data`에 마운트할 영속 볼륨.

```bash
docker build -t artipin .
docker run -d --name artipin -p 3000:3000 -v artipin-data:/data \
  -e APP_HOST=app.example.com -e CONTENT_HOST=content.example.com \
  -e AUTH_SECRET=... -e AUTH_GOOGLE_ID=... -e AUTH_GOOGLE_SECRET=... \
  -e AUTH_ALLOWED_DOMAIN=example.com -e AUTH_TRUST_HOST=true \
  artipin
```

기동할 때 마이그레이션이 자동 적용된다(`pnpm db:migrate`와 같은 동작). 프록시는 요청의 `Host` 헤더를 그대로 전달해야 한다.

## 백업

```bash
DATA_DIR=/path/to/data scripts/backup.sh /path/to/backups
```

`sqlite3 .backup`으로 일관된 `app.db` 사본을 만들고 `uploads/`와 함께 `artipin-<시각>/`에 둔다(`sqlite3` CLI 필요). 실행 중인 `app.db` 파일을 그대로 복사하지 않는다. `sqlite3`는 볼륨이 있는 호스트(컨테이너와 같은 커널)에서 실행한다. 백업 도중 올라온 파일은 DB 사본에는 있고 `uploads/` 사본에는 없을 수 있다(그 파일 1건이 복원 후 404). 사용이 적은 시간에 실행하면 충분하다.
