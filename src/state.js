// 폰별 상태: 체크리스트, 결제 완료 표시, 일정 메모. 이 폰에만 저장(동기화 없음).
// 키는 데이터의 안정된 ID(tasks/costs id, events.key)라서 데이터가 바뀌어도 다른 항목으로 옮겨 붙지 않는다.
// 데이터에서 잠시 빠진 키도 지우지 않고 보관한다(항목이 돌아오면 복구).
const STORE = 'trip-state-v1-check';
let mem = { checks: {}, paid: {}, memos: {} };

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) mem = { checks: {}, paid: {}, memos: {}, ...JSON.parse(raw) };
  } catch { /* 사생활 보호 모드 등: 메모리로만 동작 */ }
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(mem)); } catch { /* 저장 불가 시 이번 실행에서만 유지 */ }
}
load();

export const isChecked = (item) => mem.checks[item.id] ?? item.initiallyDone;
export function setChecked(id, value) { mem.checks[id] = value; save(); }

export const paidSet = () => new Set(Object.keys(mem.paid).filter((k) => mem.paid[k]));
export function setPaid(id, value) { if (value) mem.paid[id] = true; else delete mem.paid[id]; save(); }

export const memoOf = (key) => mem.memos[key] ?? '';
export function setMemo(key, text) { if (text.trim()) mem.memos[key] = text; else delete mem.memos[key]; save(); }

export function counts() {
  return { checks: Object.keys(mem.checks).length, paid: Object.keys(mem.paid).length, memos: Object.keys(mem.memos).length };
}
export function resetAll() { mem = { checks: {}, paid: {}, memos: {} }; save(); }
