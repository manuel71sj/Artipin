import { appOrigin } from "@/lib/hosts";

// open API(/api/v1)의 OpenAPI 3.1 문서. 손으로 쓴 내용이라 v1 엔드포인트를 바꾸면 /llms.txt와 함께 고친다.
// 키 관리(/api/keys)는 세션 전용이라 싣지 않는다.

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const fileResponse = (description: string) => ({
  description,
  content: json(ref("File")),
});
const errorResponse = (description: string) => ({
  description,
  content: json(ref("Error")),
});
const unauthorized = errorResponse("API 키가 없거나 틀리거나 폐기됐습니다.");
const notFound = errorResponse(
  "없는 파일, 삭제된 파일, 관리 권한이 없는 파일, 양의 10진 정수가 아닌 id.",
);
const idParam = {
  name: "id",
  in: "path",
  required: true,
  description: "파일 객체의 id",
  schema: { type: "integer", minimum: 1 },
};
const upload = {
  required: true,
  content: {
    "multipart/form-data": {
      schema: {
        type: "object",
        required: ["file"],
        properties: {
          file: {
            type: "string",
            format: "binary",
            description:
              "PNG·JPG·WebP 이미지, PDF, zip 또는 .html·.md·.markdown·.json 파일. 텍스트 형식은 파일명의 확장자로 판정한다.",
          },
        },
      },
    },
  },
};
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });

export function GET() {
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "Artipin API",
      version: "1",
      description:
        "문서(HTML·이미지·PDF·zip)를 등록·교체·삭제하고, 공유 설정을 바꾸고, 댓글을 읽는다. 사용 예시는 /llms.txt 에 있다.",
    },
    servers: [{ url: appOrigin() }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/v1/files": {
        post: {
          operationId: "createFile",
          summary: "문서 등록",
          description:
            "오류 판정 순서: 401 → 413 → 400. 암호화 업로드는 지원하지 않는다(encrypted 필드는 무시된다).",
          requestBody: upload,
          responses: {
            "201": fileResponse("등록된 파일"),
            "400": errorResponse(
              "file 필드 없음, 허용되지 않는 형식, 한도 초과, 변환 실패.",
            ),
            "401": unauthorized,
            "413": errorResponse(
              "본문이 한도를 넘었거나 multipart로 파싱되지 않는다.",
            ),
          },
        },
        get: {
          operationId: "listFiles",
          summary: "파일 목록",
          description:
            "키를 발급한 사람이 올린 파일과 소속 팀의 파일을 최신순으로 돌려준다. 페이지네이션은 없다.",
          responses: {
            "200": {
              description: "파일 목록",
              content: json({
                type: "object",
                required: ["items"],
                properties: { items: { type: "array", items: ref("File") } },
              }),
            },
            "401": unauthorized,
          },
        },
      },
      "/api/v1/files/{id}": {
        parameters: [idParam],
        get: {
          operationId: "getFile",
          summary: "파일 단건 조회",
          responses: {
            "200": fileResponse("파일"),
            "401": unauthorized,
            "404": notFound,
          },
        },
        put: {
          operationId: "replaceFile",
          summary: "본문 교체",
          description:
            "url과 댓글은 그대로 남고 본문과 title(새 파일명)이 바뀐다. 오류 판정 순서: 401 → 413 → 400(파일 없음·형식·한도) → 404 → 400(암호화 파일·종류 불일치). 없는 id에 잘못된 파일을 보내면 404보다 400·413이 먼저 난다.",
          requestBody: upload,
          responses: {
            "200": fileResponse("교체된 파일(url 그대로, replacedAt 갱신)"),
            "400": errorResponse(
              "file 필드 없음, 형식·한도 오류, 기존과 다른 종류(kind), 암호화 파일.",
            ),
            "401": unauthorized,
            "404": notFound,
            "413": errorResponse(
              "본문이 한도를 넘었거나 multipart로 파싱되지 않는다.",
            ),
          },
        },
        delete: {
          operationId: "deleteFile",
          summary: "삭제",
          responses: {
            "204": { description: "삭제됨(본문 없음)" },
            "401": unauthorized,
            "404": notFound,
          },
        },
        patch: {
          operationId: "updateSharing",
          summary: "공유 설정(링크 만료·비밀번호)",
          description:
            "한 요청에 expiresInDays 또는 password 한 필드만 보낸다. 값이 null이면 해제다.",
          requestBody: {
            required: true,
            content: json({
              oneOf: [
                {
                  type: "object",
                  required: ["expiresInDays"],
                  additionalProperties: false,
                  properties: {
                    expiresInDays: {
                      enum: [1, 7, 30, null],
                      description: "지금부터 며칠 뒤 만료. null이면 만료 없음.",
                    },
                  },
                },
                {
                  type: "object",
                  required: ["password"],
                  additionalProperties: false,
                  properties: {
                    password: {
                      ...nullable({
                        type: "string",
                        minLength: 1,
                        maxLength: 100,
                        pattern: "^[^\\r\\n]*$",
                      }),
                      description: "링크 비밀번호(줄바꿈 불가). null이면 해제.",
                    },
                  },
                },
              ],
            }),
          },
          responses: {
            "200": fileResponse("변경된 파일"),
            "400": errorResponse(
              "본문이 JSON 객체가 아님, 두 필드가 모두 없거나 모두 있음, 값 오류.",
            ),
            "401": unauthorized,
            "404": notFound,
          },
        },
      },
      "/api/v1/files/{id}/view-link": {
        parameters: [idParam],
        post: {
          operationId: "createViewLink",
          summary: "보기 전용 링크 만들기",
          description: "이미 있으면 같은 링크를 그대로 돌려준다.",
          responses: {
            "200": fileResponse("viewUrl이 채워진 파일"),
            "400": errorResponse("암호화 파일."),
            "401": unauthorized,
            "404": notFound,
          },
        },
      },
      "/api/v1/files/{id}/reissue": {
        parameters: [idParam],
        post: {
          operationId: "reissueLink",
          summary: "댓글 링크 재발급",
          description:
            "url이 새로 만들어지고 이전 url은 끊긴다. viewUrl과 댓글은 그대로 남는다.",
          responses: {
            "200": fileResponse("새 url이 든 파일"),
            "400": errorResponse("암호화 파일."),
            "401": unauthorized,
            "404": notFound,
          },
        },
      },
      "/api/v1/files/{id}/comments": {
        parameters: [idParam],
        get: {
          operationId: "listComments",
          summary: "댓글 읽기",
          description:
            "핀 댓글, 핀 없는 댓글, 각 댓글의 답글을 모두 돌려준다. 링크의 비밀번호·만료와 무관하게 읽힌다.",
          responses: {
            "200": {
              description: "댓글 목록(작성순)",
              content: json({
                type: "object",
                required: ["items"],
                properties: { items: { type: "array", items: ref("Comment") } },
              }),
            },
            "401": unauthorized,
            "404": notFound,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "로그인한 사람이 /keys 화면에서 발급한 키(artipin_…). API로는 키를 만들거나 폐기할 수 없다.",
        },
      },
      schemas: {
        File: {
          type: "object",
          required: [
            "id",
            "title",
            "kind",
            "size",
            "url",
            "viewUrl",
            "expiresAt",
            "hasPassword",
            "encrypted",
            "teamId",
            "createdAt",
            "replacedAt",
          ],
          properties: {
            id: { type: "integer" },
            title: {
              type: "string",
              description: "올린 파일명. 교체하면 새 파일명으로 바뀐다.",
            },
            kind: { enum: ["image", "html", "pdf", "site"] },
            size: {
              type: "integer",
              description:
                "검증을 통과한 본문의 바이트 수(md·json은 HTML 변환 후 크기).",
            },
            url: {
              type: "string",
              description:
                "댓글 링크. 받은 사람은 로그인 없이 보고 댓글을 쓸 수 있다.",
            },
            viewUrl: {
              ...nullable({ type: "string" }),
              description: "보기 전용 링크. 없으면 null.",
            },
            expiresAt: {
              ...nullable({ type: "integer" }),
              description: "링크 만료 시각(ms). 없으면 null.",
            },
            hasPassword: { type: "boolean" },
            encrypted: {
              type: "boolean",
              description:
                "화면에서 암호화해 올린 파일. url에 복호화 키가 없어 그대로는 열리지 않는다.",
            },
            teamId: {
              ...nullable({ type: "integer" }),
              description: "팀 파일이면 팀 번호, 개인 파일이면 null.",
            },
            createdAt: { type: "integer", description: "등록 시각(ms)" },
            replacedAt: {
              ...nullable({ type: "integer" }),
              description: "마지막 교체 시각(ms). 교체한 적 없으면 null.",
            },
          },
        },
        Comment: {
          type: "object",
          required: [
            "id",
            "pinNo",
            "authorName",
            "isOwner",
            "body",
            "resolved",
            "createdAt",
            "anchor",
            "replies",
          ],
          properties: {
            id: { type: "integer" },
            pinNo: {
              ...nullable({ type: "integer" }),
              description: "화면의 핀 번호. 핀 없는 댓글은 null.",
            },
            authorName: { type: "string" },
            isOwner: { type: "boolean" },
            body: { type: "string" },
            resolved: { type: "boolean" },
            createdAt: { type: "integer", description: "작성 시각(ms)" },
            anchor: {
              ...nullable({ type: "object" }),
              description:
                '핀 위치. HTML은 {kind:"html", selector, relX, relY, quote?}, 이미지는 {kind:"image", x, y}, PDF는 {kind:"pdf", page, x, y}. 좌표는 0~1. 핀 없는 댓글은 null.',
            },
            replies: { type: "array", items: ref("Reply") },
          },
        },
        Reply: {
          type: "object",
          required: ["id", "authorName", "isOwner", "body", "createdAt"],
          properties: {
            id: { type: "integer" },
            authorName: { type: "string" },
            isOwner: { type: "boolean" },
            body: { type: "string" },
            createdAt: { type: "integer", description: "작성 시각(ms)" },
          },
        },
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "string", description: "한국어 오류 문구" },
          },
        },
      },
    },
  });
}
