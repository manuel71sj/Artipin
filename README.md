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
| `CONTENT_HOST` | 업로드 본문 서빙 호스트(`host[:port]`, 예: `content.localhost:3000`). `APP_HOST`와 다른 값이어야 하며, 이 호스트는 `/c/*`만 응답한다 |

리버스 프록시 뒤에 배포할 때는 `AUTH_TRUST_HOST=true`가 필요할 수 있다.
