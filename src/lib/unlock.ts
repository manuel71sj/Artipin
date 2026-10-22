import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { canManage } from "@/lib/access";
import { appOrigin } from "@/lib/hosts";

const scryptAsync = promisify(scrypt);

const COOKIE_MS = 7 * 24 * 3600 * 1000;
const TICKET_MS = 10 * 60 * 1000;
// 형식을 고정해 timingSafeEqual에 길이가 같은 값만 넘긴다(sig는 HMAC-SHA256의 base64url 43자).
const VALUE = /^(\d+)\.([A-Za-z0-9_-]{43})$/;

const cookieName = (fileId: number) => `artipin_unlock_${fileId}`;
// 저장 형식 "salt:hash"의 salt. 비밀번호를 바꾸면 달라져 쿠키·티켓이 즉시 무효가 된다.
const saltOf = (passwordHash: string) => passwordHash.split(":")[0];

function sign(input: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(input).digest("base64url");
}

// "<exp>.<sig>" 값이 input(exp)에 대한 유효한 서명이고 만료 전인지 본다.
function verifySigned(
  value: string | undefined,
  input: (exp: string) => string,
): boolean {
  const m = value?.match(VALUE);
  if (!m || Number(m[1]) <= Date.now()) return false;
  return timingSafeEqual(Buffer.from(m[2]), Buffer.from(sign(input(m[1]))));
}

/** 비밀번호를 scrypt로 해시해 "salt:hash"(hex)로 돌려준다. */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(pw, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(
  pw: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  const hash = (await scryptAsync(
    pw,
    Buffer.from(saltHex, "hex"),
    64,
  )) as Buffer;
  return timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
}

/** APP_HOST 전용 잠금 해제 쿠키를 설정한다(Route Handler에서만 호출). 파일별이고 7일간 유효하다. */
export async function setUnlockCookie(file: {
  id: number;
  passwordHash: string;
}) {
  const exp = Date.now() + COOKIE_MS;
  (await cookies()).set(
    cookieName(file.id),
    `${exp}.${sign(`unlock|${file.id}|${saltOf(file.passwordHash)}|${exp}`)}`,
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MS / 1000,
      secure: appOrigin().startsWith("https:"),
    },
  );
}

/** 비밀번호가 없거나, 소유자 세션이거나, 유효한 잠금 해제 쿠키가 있으면 true. 잠금 판정은 이 함수 하나로 한다. */
export async function isUnlocked(file: {
  id: number;
  ownerId: number;
  passwordHash: string | null;
}): Promise<boolean> {
  if (file.passwordHash === null) return true;
  const salt = saltOf(file.passwordHash);
  const session = await auth();
  if (await canManage(session, file)) return true;
  const value = (await cookies()).get(cookieName(file.id))?.value;
  return verifySigned(value, (exp) => `unlock|${file.id}|${salt}|${exp}`);
}

/** CONTENT_HOST용 10분짜리 티켓 "<exp>.<sig>". isUnlocked가 참인 렌더에서만 발급한다. */
export function contentTicket(token: string, passwordHash: string): string {
  const exp = Date.now() + TICKET_MS;
  return `${exp}.${sign(`content|${token}|${saltOf(passwordHash)}|${exp}`)}`;
}

export function verifyContentTicket(
  token: string,
  passwordHash: string,
  k: string | undefined,
): boolean {
  const salt = saltOf(passwordHash);
  return verifySigned(k, (exp) => `content|${token}|${salt}|${exp}`);
}
