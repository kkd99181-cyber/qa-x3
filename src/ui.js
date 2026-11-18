// 화면 공용 조각. 모든 문자열은 esc()를 거쳐 넣는다.
import { formatMoney, toKRW, bookingBadge } from './core/money.js';
import { wallClock, zonedToUtc } from './core/tz.js';
import { googleUrl, appleUrl } from './core/maps.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

export const BADGE = {
  booked: { state: 'booked', label: '예약 완료' },
  pay_on_site: { state: 'onsite', label: '현장 결제 필요' },
  not_booked: { state: 'open', label: '미예약' },
  plan: { state: 'plan', label: '일정' },
};
export const chip = (b) => `<span class="chip chip--${b.state}">${b.label}</span>`;

const MODE_ICON = { flight: 'plane', train: 'train', bus: 'bus', ferry: 'bus', taxi: 'car', transfer: 'car', walk: 'walk', stay: 'bed', visit: 'tag' };
export const modeIcon = (mode) => icon(MODE_ICON[mode] ?? 'tag');
export const MODE_LABEL = { flight: '항공', train: '열차', bus: '버스', ferry: '배', taxi: '택시', transfer: '이동', walk: '도보' };

export function index(data) {
  const byDay = new Map(data.days.map((d) => [d.id, []]));
  for (const e of data.events) byDay.get(e.dayId)?.push(e);
  return {
    bookings: new Map(data.bookings.map((b) => [b.id, b])),
    payments: new Map(data.payments.map((p) => [p.id, p])),
    legs: new Map(data.legs.map((l) => [l.id, l])),
    days: new Map(data.days.map((x) => [x.id, x])),
    eventsByDay: byDay,
    audioByEvent: new Map(data.audio.places.flatMap((p) => p.eventIds.map((id) => [id, p]))),
  };
}

/** 초 → "1:05" */
export function formatLength(sec) {
  if (!Number.isFinite(sec)) return '0:00';
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const tzLabel = (ctx, tz) => (tz === ctx.data.trip.homeTz ? '한국 시각' : '현지 시각');
export const localTime = (ms, tz) => wallClock(ms, tz).time;
export function dateLabel(date, weekday) {
  const [, m, d] = date.split('-').map(Number);
  return `${m}.${d}${weekday ? ` (${weekday})` : ''}`;
}

/** 원래 통화 + 원화 환산(임시 환율이면 '임시') */
export function money(ctx, minor, currency) {
  const orig = formatMoney(minor, currency, ctx.data.fx.digits);
  if (minor == null) return { orig, krw: '' };
  if (currency === 'KRW') return { orig, krw: '' };
  const k = toKRW(minor, currency, ctx.data.fx);
  return { orig, krw: k == null ? '환율 없음' : `약 ${k.toLocaleString('ko-KR')}원` };
}
export const moneyTotals = (ctx, totals) => Object.entries(totals).map(([c, v]) => formatMoney(v, c, ctx.data.fx.digits)).join(' · ') || '—';
export function krwOf(ctx, totals) {
  let sum = 0;
  for (const [c, v] of Object.entries(totals)) {
    const k = toKRW(v, c, ctx.data.fx);
    if (k == null) return null;
    sum += k;
  }
  return sum;
}
export const fxNote = (ctx) => `환율 기준 ${dateLabel(ctx.data.fx.asOf)}${ctx.data.fx.confirmed ? '' : ' · 임시 환율'}`;

/** 일정·구간 상태 배지. 구간이 연결돼 있으면 구간 상태가 우선 */
export function eventBadge(ctx, ev) {
  const legs = ev.legIds.map((id) => ctx.ix.legs.get(id)).filter(Boolean);
  const states = legs.length
    ? legs.map((l) => (l.status === 'booked' ? bookingBadge({ ...ctx.ix.bookings.get(l.bookingId), status: 'booked' }, ctx.ix.payments, ctx.paid) : 'not_booked'))
    : ev.bookingIds.map((id) => ctx.ix.bookings.get(id)).filter(Boolean).map((b) => bookingBadge(b, ctx.ix.payments, ctx.paid));
  for (const k of ['not_booked', 'pay_on_site', 'booked']) if (states.includes(k)) return BADGE[k];
  return BADGE.plan;
}
export const bookingBadgeOf = (ctx, b) => BADGE[bookingBadge(b, ctx.ix.payments, ctx.paid)];

/**
 * 길안내 버튼 한 쌍: Google 지도(주 버튼) + Apple 지도(대체, 항상 함께).
 * place: { name, address, lat, lng, query } · kind: 이동 수단(경로 모드 결정)
 */
export function navButtons(place, kind, label = '길안내', { small = false } = {}) {
  const g = googleUrl(place, kind);
  if (!g) return '';
  const name = esc(place.name ?? place.query ?? place.address ?? '');
  const sm = small ? ' btn--sm' : '';
  return `<div class="nav-pair">
    <a class="btn${sm}" href="${esc(g)}" target="_blank" rel="noopener" aria-label="Google 지도로 ${name} 길안내">${icon('nav', small ? 'icon icon--sm' : 'icon')}${esc(label)}</a>
    <a class="btn btn--line${sm} nav-pair__alt" href="${esc(appleUrl(place, kind))}" target="_blank" rel="noopener" aria-label="Apple 지도로 ${name} 길안내">Apple 지도</a>
  </div>`;
}

/**
 * 구간의 대략적인 시작·끝(UTC ms). 시각이 정해진 구간은 그대로,
 * 미정 구간은 희망 시간대(window) → 연결된 일정 → 그날 저녁 순으로 추정한다(정렬·"다음 이동" 판단용).
 */
export function legTime(ctx, l) {
  if (l.from.atUtc) return { start: l.from.atUtc, end: l.to.atUtc ?? l.from.atUtc };
  const b = ctx.ix.bookings.get(l.bookingId);
  const date = b?.date;
  if (!date) return { start: Infinity, end: Infinity };
  const day = ctx.data.days.find((d) => d.date === date);
  const tz = (day && ctx.ix.eventsByDay.get(day.id)?.[0]?.tz) ?? ctx.data.trip.homeTz;
  if (l.window) return { start: zonedToUtc(date, l.window.from, tz), end: zonedToUtc(date, l.window.to, tz) };
  const linked = ctx.data.events.filter((e) => e.bookingIds.includes(l.bookingId));
  if (linked.length) return { start: Math.min(...linked.map((e) => e.startUtc)), end: Math.max(...linked.map((e) => e.endUtc)) };
  // 단서가 없으면(예: 공항 → 숙소) 그날 도착하는 시각 정해진 구간 뒤로, 그것도 없으면 정오
  const arrivals = ctx.data.legs.filter((x) => x.to.atUtc && x.to.local?.slice(0, 10) === date).map((x) => x.to.atUtc);
  const start = arrivals.length ? Math.max(...arrivals) : zonedToUtc(date, '12:00', tz);
  return { start, end: Math.max(start, zonedToUtc(date, '23:59', tz)) };
}

/** 구간 제목: 출발 → 도착(이름이 없으면 예약 제목) */
export const legTitle = (l, b) => (l.from.name && l.to.name ? `${l.from.name} → ${l.to.name}` : (l.from.name ?? l.to.name ?? b?.title ?? '이동'));

/** 구간 출발지(역·공항) */
export const legFrom = (l) => (l?.from.name || l?.from.address ? { name: l.from.name, address: l.from.address } : null);

export function linksOf(contact) {
  const out = [];
  if (contact.phone) out.push(`<a class="btn btn--line btn--sm" href="tel:${esc(contact.phone.replace(/[^+\d]/g, ''))}">${icon('phone', 'icon icon--sm')}전화</a>`);
  if (contact.email) out.push(`<a class="btn btn--line btn--sm" href="mailto:${esc(contact.email)}">${icon('mail', 'icon icon--sm')}메일</a>`);
  if (contact.url) out.push(`<a class="btn btn--line btn--sm" href="${esc(contact.url)}" target="_blank" rel="noopener">${icon('link', 'icon icon--sm')}공식 페이지</a>`);
  return out.join('');
}
