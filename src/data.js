// 암호화된 앱 데이터 열기. m.json(공개 메타) → 저장된 키 또는 비밀번호 → d/*.bin 복호화.
import { deriveKey, decryptBytes, verifyCheck, fromB64 } from './core/cryptobox.js';
import { loadKey, saveKey, clearKey } from './keystore.js';

/** 화면이 구분해서 보여 줄 실패 종류 */
export class OpenError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

async function fetchOk(url, as) {
  const res = await fetch(url);
  if (!res.ok) throw new OpenError('missing', `파일을 열 수 없어요 (${res.status})`);
  return as === 'json' ? res.json() : new Uint8Array(await res.arrayBuffer());
}

let currentKey = null; // 연 뒤 바우처·오디오를 풀 때 쓰는 키(메모리에만)

async function decryptData(key, meta) {
  const box = await fetchOk(meta.data, 'bin');
  try {
    return JSON.parse(new TextDecoder().decode(await decryptBytes(key, box, meta.data)));
  } catch {
    throw new OpenError('corrupt', '일정 파일이 손상됐어요');
  }
}

/**
 * 저장된 키로 연다. 키가 없거나(첫 실행) 맞지 않으면(비밀번호 변경) 'locked'를 던진다.
 * @returns {Promise<object>} 앱 데이터
 */
export async function openWithStoredKey() {
  const meta = await fetchOk('m.json', 'json');
  const stored = await loadKey();
  if (!stored) throw new OpenError('locked', 'first');
  if (stored.salt !== meta.salt || stored.iterations !== meta.iterations || !(await verifyCheck(stored.key, meta.check))) {
    await clearKey(); // 오래된 키로 계속 실패하지 않게 지우고 다시 입력받는다
    throw new OpenError('locked', 'changed');
  }
  const data = await decryptData(stored.key, meta);
  currentKey = stored.key;
  return data;
}

/** 비밀번호로 연다. 맞으면 키만 저장한다(비밀번호 원문은 버림) */
export async function openWithPassword(password) {
  const meta = await fetchOk('m.json', 'json');
  const key = await deriveKey(password, fromB64(meta.salt), meta.iterations);
  if (!(await verifyCheck(key, meta.check))) throw new OpenError('wrong', '비밀번호가 맞지 않아요');
  const data = await decryptData(key, meta);
  await saveKey(key, meta.salt, meta.iterations);
  currentKey = key;
  return data;
}

/** 암호문(이미 받은 것)을 풀어 Blob URL로. 평문은 메모리에만 있다 */
export async function decryptAsset(name, box, type) {
  if (!currentKey) throw new OpenError('locked', 'first');
  try {
    return URL.createObjectURL(new Blob([await decryptBytes(currentKey, box, name)], { type }));
  } catch {
    throw new OpenError('corrupt', '파일이 손상됐어요');
  }
}

/** 암호문이 이 키로 인증되는지만 확인(평문은 바로 버림) */
export async function verifyAsset(name, box) {
  if (!currentKey) throw new OpenError('locked', 'first');
  try { await decryptBytes(currentKey, box, name); return true; } catch { return false; }
}

/** 암호화된 파일(바우처 등)을 받아 풀기 */
export async function openAsset(name, type) {
  if (!currentKey) throw new OpenError('locked', 'first');
  return decryptAsset(name, await fetchOk(name, 'bin'), type);
}

/** 메모리의 키를 버린다(명시적 잠금) */
export function forgetKey() { currentKey = null; }

export { clearKey };
