# Artipin 디자인 시스템 (MASTER)

화면을 만들거나 고치기 전에 이 문서를 먼저 읽는다. 값의 정본은 `src/app/globals.css`의 `:root` 토큰이고, 이 문서는 그 값과 쓰는 규칙을 설명한다. 둘이 다르면 코드가 맞고 이 문서를 고친다.

## 방향

- **스타일**: Swiss Modernism 2.0. 평면, 12컬럼 그리드, 8px 단위, 왼쪽 정렬, 굵은 위계. 그림자·그라데이션·카드 상자를 쓰지 않는다.
- **성격**: 건조하고 정확한 사내 도구. 장식보다 정렬과 여백으로 구조를 보인다.
- **기억에 남길 요소는 하나**: 핀(빨간 점). 로고 점, 미해결 댓글 수 배지, 404·오류 제목 끝의 마침표 핀이 같은 색과 모양이다.
- **출처**: 팔레트와 스타일은 `ui-ux-pro-max` 검색 결과(Swiss Modernism 2.0, 네이비·앰버)를 따랐다. 다크 값, 핀 계열 색, 서체 조합(한글 지원 때문에 검색 결과를 바꿨다)은 프로젝트에서 정했다.

## 색

값은 CSS 변수로만 참조한다. 컴포넌트에 HEX를 직접 쓰지 않는다.

| 토큰 | 라이트 | 다크 | 쓰임 |
|---|---|---|---|
| `--color-primary` | `#1E3A5F` | `#8FB4E8` | 주 버튼, 링크 복사 호버, 포커스 링 |
| `--color-on-primary` | `#FFFFFF` | `#0B1220` | primary 위의 글자 |
| `--color-secondary` | `#334155` | `#B7CDEE` | primary 버튼 호버 |
| `--color-accent` | `#B45309` | `#F59E0B` | 파일을 끌어올 때의 영역 강조에만 |
| `--color-background` | `#F8FAFC` | `#0B1220` | 페이지 바탕 |
| `--color-foreground` | `#0F172A` | `#F1F5F9` | 본문 글자, 영역 구분선 |
| `--color-card` | `#FFFFFF` | `#111A2B` | 입력칸 바탕 |
| `--color-muted` | `#E9EEF5` | `#1B2638` | 종류 태그 바탕 |
| `--color-muted-foreground` | `#475569` | `#A3B1C6` | 보조 글자 |
| `--color-border` | `#CBD5E1` | `#2C3A52` | 항목 구분선, 입력칸 테두리 |
| `--color-destructive` | `#DC2626` | `#F87171` | 삭제·오류 |
| `--color-ring` | `#1E3A5F` | `#8FB4E8` | `:focus-visible` 윤곽 |
| `--color-pin` | `#C93036` | (동일) | 핀. 흰 숫자와 약 5.3:1 |
| `--color-pin-pending` | `#2563EB` | (동일) | 아직 확정하지 않은 핀 |
| `--color-pin-resolved` | `#475569` | (동일) | 해결된 핀 |

- 핀 계열은 흰 글자가 4.5:1 이상이 되는 값만 쓴다. 불투명도로 흐리게 하지 않고 색으로 상태를 구분한다.
- 보라 계열, 그라데이션, 순수 `#000`은 쓰지 않는다.

## 서체

| 역할 | 서체 | 굵기 | 변수 |
|---|---|---|---|
| 제목(워드마크·h1·h2) | Hahmlet | 700 | `--font-display-stack` |
| 본문, 한글 | Noto Sans KR | 400 / 500 / 700 | `--font-stack` |
| 본문, 영문·숫자 | Atkinson Hyperlegible Next | 400 / 500 / 700 | `--font-stack` |

- 영문·숫자는 Atkinson, 한글은 Noto Sans KR이 글리프 단위로 맡는다(`font-family` 순서).
- 글자 단계: 14 / 16 / 20 / 24 / 40px (`--text-sm` ~ `--text-2xl`). 본문 줄 간격 1.5, 제목 1.2.
- 한글 제목과 안내 문구에는 `word-break: keep-all`, 제목에는 `text-wrap: balance`.
- 숫자가 줄을 맞춰야 하는 곳(시각, 개수)에는 `font-variant-numeric: tabular-nums`.
- 이탤릭 제목을 쓰지 않는다. 눈썹 글자(작은 라벨)를 쓰지 않는다.
- 한계: Atkinson은 숫자 0에 사선이 있다(파일명의 0과 O를 구분하려는 설계). 날짜에도 같이 나온다.

## 간격·모서리

- 간격 `--space-1` ~ `--space-7` = 4 / 8 / 16 / 24 / 32 / 48 / 64px.
- 모서리 `--radius` 4px. 종류 태그만 2px.
- 컨테이너 최대 너비 1120px, 좌우 24px. 모든 화면의 왼쪽 정렬선은 하나다.

## 구분선

두 단계만 쓴다.

- **영역 구분**: 2px, `--color-foreground`. 상단 바 아래, 목록 머리 아래, 규격 목록 위.
- **항목 구분**: 1px, `--color-border`. 목록 행, 규격 항목.

## 모션

- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`. 도착·눌림에 쓴다. 색 변화는 `ease`.
- 시간: `--duration-fast` 100ms(호버 색) / `--duration-base` 160ms(눌림·상태·나갈 때) / `--duration-slow` 200ms(영역이 들어올 때).
- `transform`과 `opacity`만 움직인다. 눌림은 `scale(0.97)`, 영역은 `scale(0.98)`에서 시작(`scale(0)` 금지).
- 파일 목록을 훑으며 지나가는 호버(파일명 밑줄)에는 전환을 두지 않는다.
- `:hover` 규칙은 `@media (hover: hover) and (pointer: fine)` 안에 둔다.
- `prefers-reduced-motion`에서는 움직임(`scale`)을 빼고 투명도 페이드는 남긴다.
- `transition: all`, `ease-in`, 키프레임 반복 애니메이션을 쓰지 않는다.

## 컴포넌트 규칙

- **버튼**: 높이 44px 이상(주 버튼 48px), `:active` 눌림, `:disabled`(투명도 0.55 + `not-allowed`), `white-space: nowrap`. 기본·호버·포커스·눌림·비활성을 모두 갖는다.
- **위험 동작**(삭제)은 같은 자리에서 2단계로 확인하고 브라우저 `confirm()`/`alert()`를 쓰지 않는다. 진행 중에는 비활성화하고 실패하면 다시 시도할 수 있게 한다.
- **입력칸**: 보이는 라벨, `name`, `autocomplete`, 글자 16px(iOS 확대 방지).
- **오류 문구**: 무슨 일이 일어났는지와 다음에 할 일을 함께 적는다.
- **핀 번호·장식 요소**는 스크린리더에서 숨기고(`aria-hidden`), 같은 정보를 글로 따로 준다.
- **키보드 대안**: 마우스로만 되는 동작(이미지 핀 지정)에는 Enter·방향키 대안을 둔다.

## 화면

| 화면 | 파일 | 비고 |
|---|---|---|
| 내 파일 | `src/app/page.tsx` | 업로드 영역, 규격 목록, 파일 목록 |
| 로그인 | `src/app/login/page.tsx` | |
| 공유 | `src/app/s/[token]/page.tsx` | 상단 바(브랜드·제목·종류) + 뷰어 + 댓글 |
| 닫힌 링크 | `src/app/s/[token]/not-found.tsx` | 404 |
| 없는 주소 | `src/app/not-found.tsx` | 404 |
| 오류 | `src/app/error.tsx`, `src/app/global-error.tsx` | `retry` 사용(이 Next 버전) |

## 알려진 한계

- 이미지 `<img>`에 가로·세로가 없어 로드 때 화면이 움직인다(업로드 시 크기 저장 필요).
- HTML 뷰어의 핀 지정은 iframe 안에서 초점이 가는 요소의 클릭 합성까지만 키보드로 된다.
- 빌드 경고: `Atkinson Hyperlegible Next`의 폰트 대체 보정값을 찾지 못한다(동작에는 영향 없음).
