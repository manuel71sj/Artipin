// 종단간 암호화(브라우저 전용 WebCrypto). 형식은 iv(12바이트) || AES-256-GCM 암호문+태그(16바이트)다.
// 키는 raw 32바이트의 base64url(43자)이며 링크의 `#k=`에만 실린다. 서버로 보내지 않는다.

const IV_BYTES = 12;

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );

/** 새 키를 만들어 암호화한다. data는 업로드 본문, key는 링크에 붙일 문자열이다. */
export async function encrypt(
  plain: Uint8Array<ArrayBuffer>,
): Promise<{ data: Uint8Array<ArrayBuffer>; key: string }> {
  const cryptoKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, plain),
  );
  const data = new Uint8Array(IV_BYTES + sealed.length);
  data.set(iv);
  data.set(sealed, IV_BYTES);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", cryptoKey));
  return { data, key: toBase64Url(raw) };
}

/** 키가 맞지 않거나 데이터가 변조되면 예외를 던진다. */
export async function decrypt(
  data: Uint8Array<ArrayBuffer>,
  key: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    fromBase64Url(key),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: data.subarray(0, IV_BYTES) },
      cryptoKey,
      data.subarray(IV_BYTES),
    ),
  );
}
