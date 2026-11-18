// 시간대 계산. 브라우저와 Node 양쪽에서 쓰는 순수 함수(의존성 없음).

const partsCache = new Map();
function formatter(tz) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** 해당 시각(UTC ms)에서 tz의 벽시계 값 */
export function wallClock(ms, tz) {
  const p = {};
  for (const { type, value } of formatter(tz).formatToParts(new Date(ms))) p[type] = value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second,
  };
}

/** tz의 UTC 오프셋(분). 예: Asia/Seoul → 540 */
export function offsetMinutes(ms, tz) {
  const w = wallClock(ms, tz);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** 'YYYY-MM-DD' → 그날 00:00 UTC ms. 달력에 없는 날짜(2027-02-30 등)는 Date.UTC가 조용히 넘겨 버리므로 되돌려 확인해 거부한다 */
function dateUtc(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  const ms = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  const back = new Date(ms);
  if (!m || back.getUTCFullYear() !== +m[1] || back.getUTCMonth() !== +m[2] - 1 || back.getUTCDate() !== +m[3]) {
    throw new Error(`달력에 없는 날짜: ${date}`);
  }
  return ms;
}

/** 'HH:MM' → 분. 00:00~23:59만 허용 */
function timeMinutes(time) {
  const m = /^(\d{2}):(\d{2})$/.exec(time ?? '');
  if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(`잘못된 시각: ${time}`);
  return +m[1] * 60 + +m[2];
}

const validator = (fn) => (v) => { try { fn(v); return true; } catch { return false; } };
export const isValidDate = validator(dateUtc);
export const isValidTime = validator(timeMinutes);

/** 현지 날짜 'YYYY-MM-DD' + 시각 'HH:MM' + IANA tz → UTC ms */
export function zonedToUtc(date, time, tz) {
  const naive = dateUtc(date) + timeMinutes(time) * 60000;
  let guess = naive - offsetMinutes(naive, tz) * 60000;
  // 서머타임 경계 보정(한 번 더 맞춤)
  guess = naive - offsetMinutes(guess, tz) * 60000;
  return guess;
}

/** 'YYYY-MM-DDTHH:MM[:SS]' + tz → UTC ms */
export function localIsoToUtc(localIso, tz) {
  const [date, t] = localIso.split('T');
  return zonedToUtc(date, t.slice(0, 5), tz);
}

/** 날짜 문자열 사이 일수 (b - a) */
export function daysBetween(a, b) {
  return Math.round((dateUtc(b) - dateUtc(a)) / 86400000);
}

export function addMinutes(ms, min) { return ms + min * 60000; }

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export function weekdayKo(date) {
  return WEEKDAYS[new Date(dateUtc(date)).getUTCDay()];
}
