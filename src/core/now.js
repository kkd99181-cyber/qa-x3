// "지금 뭐 하는 중이지? / 다음엔 어디로?" 계산. 순수 함수.
import { wallClock, daysBetween } from './tz.js';

/** 진행 중 일정(가장 늦게 시작한 것)과 다음 일정 */
export function findNowNext(events, nowMs) {
  let current = null;
  for (const e of events) {
    if (e.startUtc <= nowMs && nowMs < e.endUtc && (!current || e.startUtc >= current.startUtc)) current = e;
  }
  const next = events.find(e => e.startUtc > nowMs && e !== current) ?? null;
  return { current, next };
}

/** 여행 단계: 출발 전 / 여행 중 / 끝 */
export function tripPhase(data, nowMs) {
  const first = data.events[0];
  const last = data.events.at(-1);
  if (!first || nowMs < first.startUtc) return 'before';
  if (nowMs >= last.endUtc) return 'after';
  return 'during';
}

/** 출발까지 남은 날(한국 날짜 기준). 출발 당일 0 */
export function dDay(data, nowMs) {
  const today = wallClock(nowMs, data.trip.homeTz).date;
  return daysBetween(today, data.trip.startDate);
}

/** 지금 보여 줄 일차: 진행 중·다음 일정의 일차, 없으면 현지 날짜 */
export function currentDayId(data, nowMs) {
  const { current, next } = findNowNext(data.events, nowMs);
  const phase = tripPhase(data, nowMs);
  if (phase === 'before') return data.days[0]?.id ?? null;
  if (phase === 'after') return data.days.at(-1)?.id ?? null;
  if (current) return current.dayId;
  const tz = next?.tz ?? data.trip.homeTz;
  const date = wallClock(nowMs, tz).date;
  return data.days.find(d => d.date === date)?.id ?? next?.dayId ?? null;
}

/** 남은 시간 → "1시간 20분", "3일" */
export function formatDuration(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m ? `${h}시간 ${m}분` : `${h}시간`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `${d}일 ${hh}시간` : `${d}일`;
}

/** 일정의 현지 시각 표시 */
export function formatLocalTime(ms, tz) {
  return wallClock(ms, tz).time;
}
