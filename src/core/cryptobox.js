// 암호화 형식. 브라우저와 Node(빌드·테스트)가 같은 Web Crypto 코드를 쓴다.
// 파일: [버전 1바이트][nonce 12바이트][AES-GCM 암호문+태그]. AAD = 공개 파일 이름(바꿔치기 방지).

export const FORMAT_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 권고(PBKDF2-HMAC-SHA256)
const IV_BYTES = 12;
const CHECK_TEXT = 'key-check-v1';
const CHECK_AAD = 'check';

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();

export function toB64(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}
export function fromB64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** 비밀번호 → 추출 불가 AES-GCM 키 */
export async function deriveKey(password, salt, iterations = PBKDF2_ITERATIONS, usages = ['decrypt']) {
  if (typeof password !== 'string' || !password) throw new Error('비밀번호가 비어 있음');
  const base = await subtle().importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, usages,
  );
}

export async function encryptBytes(key, plain, aad) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, plain));
  const out = new Uint8Array(1 + IV_BYTES + ct.length);
  out[0] = FORMAT_VERSION;
  out.set(iv, 1);
  out.set(ct, 1 + IV_BYTES);
  return out;
}

/** 실패하면 예외(OperationError: 키가 틀렸거나 내용·이름이 바뀜) */
export async function decryptBytes(key, box, aad) {
  const bytes = new Uint8Array(box);
  if (bytes.length < 1 + IV_BYTES + 16 || bytes[0] !== FORMAT_VERSION) throw new Error('알 수 없는 파일 형식');
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv: bytes.subarray(1, 1 + IV_BYTES), additionalData: enc.encode(aad) },
    key, bytes.subarray(1 + IV_BYTES),
  );
  return new Uint8Array(plain);
}

/** m.json에 넣는 키 확인값: 틀린/바뀐 비밀번호와 손상 파일을 구분한다 */
export async function makeCheck(key) {
  return toB64(await encryptBytes(key, enc.encode(CHECK_TEXT), CHECK_AAD));
}
export async function verifyCheck(key, checkB64) {
  try {
    const plain = await decryptBytes(key, fromB64(checkB64), CHECK_AAD);
    return new TextDecoder().decode(plain) === CHECK_TEXT;
  } catch {
    return false;
  }
}
