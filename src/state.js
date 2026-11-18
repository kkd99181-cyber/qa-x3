// 폰별 상태: 체크리스트, 결제 완료 표시, 일정 메모. 이 폰에만 저장(동기화 없음).
// 키는 데이터의 안정된 ID(tasks/costs id, events.key)라서 데이터가 바뀌어도 다른 항목으로 옮겨 붙지 않는다.
// 데이터에서 잠시 빠진 키도 지우지 않고 보관한다(항목이 돌아오면 복구).
// 항목마다 따로 저장한다: `${STORE}:c:<id>` 체크('true'/'false'), `:p:<id>` 결제('1'/'0'), `:m:<key>` 메모(''=지움).
// 그래서 같은 폰의 두 탭이 동시에 써도 서로 다른 항목을 덮지 않는다(Web Storage는 탭 사이 잠금을 보장하지 않음).
// 예전 한 덩어리 기록(STORE)은 지우지 않고 읽기 전용 대체값으로만 쓴다. 해제·빈 메모는 '0'·''를 남겨 예전 값이 되살아나지 않게 한다.
const STORE = 'trip-state-v1-check';
const PREFIX = `${STORE}:`;
const FIELD = { c: 'checks', p: 'paid', m: 'memos' };
const fallback = new Map(); // 저장에 실패한 항목(사생활 보호 모드·용량 부족): 이번 실행에서만 유지

function legacy() {
  try { return JSON.parse(localStorage.getItem(STORE)) ?? {}; } catch { return {}; }
}
const fromLegacy = (old, kind, id) => {
  const v = old[FIELD[kind]]?.[id];
  if (v === undefined) return null;
  return kind === 'c' ? String(!!v) : kind === 'p' ? (v ? '1' : '0') : String(v);
};
function get(kind, id) {
  const k = `${kind}:${id}`;
  if (fallback.has(k)) return fallback.get(k);
  try { const v = localStorage.getItem(PREFIX + k); if (v !== null) return v; } catch { /* 메모리 대체값만 */ }
  return fromLegacy(legacy(), kind, id);
}
function set(kind, id, value) {
  const k = `${kind}:${id}`;
  try { localStorage.setItem(PREFIX + k, value); fallback.delete(k); } catch { fallback.set(k, value); }
}
/** 종류별 현재 값 전체: 예전 기록 < 항목 키 < 메모리 대체값 */
function all(kind) {
  const out = new Map();
  const old = legacy();
  for (const id of Object.keys(old[FIELD[kind]] ?? {})) out.set(id, fromLegacy(old, kind, id));
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${PREFIX}${kind}:`)) out.set(key.slice(PREFIX.length + 2), localStorage.getItem(key));
    }
  } catch { /* 메모리 대체값만 */ }
  for (const [k, v] of fallback) if (k.startsWith(`${kind}:`)) out.set(k.slice(2), v);
  return out;
}

export const isChecked = (item) => { const v = get('c', item.id); return v === null ? item.initiallyDone : v === 'true'; };
export const setChecked = (id, value) => set('c', id, String(!!value));

export const paidSet = () => new Set([...all('p')].filter(([, v]) => v === '1').map(([id]) => id));
export const setPaid = (id, value) => set('p', id, value ? '1' : '0');

export const memoOf = (key) => get('m', key) ?? '';
export const setMemo = (key, text) => set('m', key, text.trim() ? text : '');

export function counts() {
  return { checks: all('c').size, paid: paidSet().size, memos: [...all('m').values()].filter((v) => v).length };
}
/** 이 앱의 기록만 지운다: 예전 키(STORE) 그 자체와 `${STORE}:`로 시작하는 항목 키(검증 앱 접두어 `${STORE}-check`와 겹치지 않음) */
export function resetAll() {
  fallback.clear();
  try {
    const mine = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k === STORE || k?.startsWith(PREFIX)) mine.push(k); }
    for (const k of mine) localStorage.removeItem(k);
  } catch { /* 저장소를 쓸 수 없으면 메모리만 비움 */ }
}
