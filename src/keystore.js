// 추출 불가 CryptoKey를 IndexedDB에 보관한다. 비밀번호 원문은 저장하지 않는다.
const DB = 'trip-keys-check';
const STORE = 'keys';
const ID = 'data';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

/** @returns {Promise<{key: CryptoKey, salt: string, iterations: number} | undefined>} */
export const loadKey = () => tx('readonly', (s) => s.get(ID)).catch(() => undefined);
export const saveKey = (key, salt, iterations) => tx('readwrite', (s) => s.put({ key, salt, iterations }, ID));
export const clearKey = () => tx('readwrite', (s) => s.delete(ID)).catch(() => {});
