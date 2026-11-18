// 지금: 진행 중 · 다음 꼬리표 · 다음 이동 · 오늘 안내판 / 출발 전 D-day · 남은 준비
import { findNowNext, tripPhase, dDay, currentDayId, formatDuration } from '../core/now.js';
import { esc, chip, eventBadge, tzLabel, localTime, modeIcon, MODE_LABEL, dateLabel, BADGE, navButtons, legFrom, legTime, legTitle } from '../ui.js';
import { isChecked } from '../state.js';
import { board } from './days.js';

function nextTag(ctx, ev) {
  const badge = eventBadge(ctx, ev);
  const leg = ev.legIds.map((id) => ctx.ix.legs.get(id))[0];
  const booking = ev.bookingIds.map((id) => ctx.ix.bookings.get(id)).find(Boolean);
  const depart = leg && ev.legRole === 'depart';
  const dest = depart ? leg.to.name : ev.title;
  const route = depart ? `${esc(leg.from.name)} 출발` : esc(ev.detail ?? '');
  const fields = [];
  if (leg?.service) fields.push(['편·열차', leg.service]);
  if (leg?.seat) fields.push(['좌석', leg.seat]);
  if (leg?.from.platform) fields.push(['플랫폼', leg.from.platform]);
  if (leg?.from.gate) fields.push(['게이트', leg.from.gate]);
  if (leg?.from.terminal) fields.push(['터미널', leg.from.terminal]);
  if (leg?.durationMin) fields.push(['소요', formatDuration(leg.durationMin * 60000)]);
  // 출발 구간이면 출발지(역·공항)로, 아니면 일정 장소로
  const target = depart ? legFrom(leg) : ev.stops[0];
  const ref = leg?.ref ?? booking?.ref;
  const stub = badge.state === 'plan' ? '' : `
    <div class="tag__perf" aria-hidden="true"></div>
    <div class="tag__stub">
      <span class="tag__ref-label">예약 번호</span>
      ${ref ? `<span class="tag__ref">${esc(ref)}</span>` : `<span class="tag__ref tag__ref--none">${badge.state === 'open' ? '아직 없음' : '미확인'}</span>`}
    </div>`;
  return `
  <article class="tag" data-state="${badge.state}" aria-label="다음 일정">
    <div class="tag__band"><span>${badge.label}</span><span class="tag__band-meta">다음</span></div>
    <div class="tag__body">
      ${route ? `<p class="tag__route">${route}</p>` : ''}
      <h2 class="tag__dest">${esc(dest)}</h2>
      <div class="tag__when">
        ${ev.approx && ev.timeLabel
          ? `<p class="tag__time tag__time--label">${esc(ev.timeLabel)}<small>${tzLabel(ctx, ev.tz)}</small></p>`
          : `<p class="tag__time">${localTime(ev.startUtc, ev.tz)}<small>${tzLabel(ctx, ev.tz)}</small></p>`}
        <p class="tag__countdown">${formatDuration(ev.startUtc - ctx.nowMs)}<small>남음</small></p>
      </div>
      ${fields.length ? `<dl class="tag__fields">${fields.map(([k, v]) => `<div class="field"><dt class="field__label">${k}</dt><dd class="field__value">${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    </div>
    ${target ? `<div class="tag__actions">${navButtons(target, depart ? 'transit' : ev.kind, depart ? '출발지 길안내' : '길안내')}</div>` : ''}
    ${stub}
  </article>`;
}

function nowCard(ctx, ev, next) {
  if (!ev) {
    const wait = next ? `다음 일정까지 ${formatDuration(next.startUtc - ctx.nowMs)}` : '남은 일정 없음';
    return `<div class="now now--idle"><p class="now__time">—</p><p class="now__title">진행 중인 일정 없음</p><p class="now__meta">${wait}</p></div>`;
  }
  // 항공·열차는 도착지 현지 시각으로 끝을 보여 준다
  const leg = ev.legRole === 'depart' ? ctx.ix.legs.get(ev.legIds[0]) : null;
  const endTz = leg?.to.tz ?? ev.tz;
  const stop = leg ? null : ev.stops[0];
  return `
  <div class="now" aria-label="지금 일정">
    <p class="now__time">${localTime(ev.endUtc, endTz)}<small>${endTz === ev.tz ? '까지' : `${tzLabel(ctx, endTz)} 도착`}</small></p>
    <p class="now__title">${esc(ev.title)}</p>
    <p class="now__meta">${esc(ev.timeLabel ?? '')}${ev.stops[0] ? ` · ${esc(ev.stops[0].name)}` : ''}</p>
    ${stop ? `<div class="now__nav">${navButtons(stop, ev.kind, '길안내', { small: true })}</div>` : ''}
  </div>`;
}

/** 다음 이동 구간(다음 일정이 이동이 아닐 때 따로 보여 줌). 시각 미정 구간은 날짜 기준 */
function nextMove(ctx, next) {
  // 시각이 정해진 구간은 출발 전인 것, 미정 구간은 추정 끝이 아직 안 지난 것
  const leg = ctx.data.legs
    .map((l) => ({ l, t: legTime(ctx, l) }))
    .filter(({ t }) => Number.isFinite(t.start)) // 날짜도 시각도 없는 구간은 다음 이동이 아님(이동 화면의 '날짜 미정'에만)
    .filter(({ l, t }) => (l.from.atUtc ? t.start > ctx.nowMs : t.end > ctx.nowMs))
    .sort((a, b) => a.t.start - b.t.start)[0]?.l;
  if (!leg || (next && next.legIds.includes(leg.id))) return '';
  const b = ctx.ix.bookings.get(leg.bookingId);
  const badge = leg.status === 'booked' ? BADGE.booked : BADGE.not_booked;
  const when = leg.from.atUtc
    ? `${dateLabel(leg.from.local.slice(0, 10))} ${localTime(leg.from.atUtc, leg.from.tz)} 출발`
    : `${dateLabel(b.date)} ${leg.window ? `${leg.window.from}–${leg.window.to} ${leg.window.kind === 'depart' ? '출발 예정' : '도착 목표'}` : '시각 미정'}`;
  const from = legFrom(leg);
  return `
  <div class="list">
    <a class="list__row" href="#/moves" aria-label="다음 이동, 이동 화면 열기">
      <span class="leg__icon">${modeIcon(leg.mode)}</span>
      <span class="list__main">
        <span class="list__title">${esc(legTitle(leg, b))}</span>
        <span class="list__sub">다음 ${MODE_LABEL[leg.mode] ?? '이동'} · ${esc(when)}</span>
      </span>
      ${chip(badge)}
    </a>
    ${from ? `<div class="list__row">${navButtons(from, 'transit', '출발지 길안내', { small: true })}</div>` : ''}
  </div>`;
}

function prepList(ctx) {
  const todo = ctx.data.checklist.filter((c) => !isChecked(c));
  const top = [...todo].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999')).slice(0, 3);
  return `
  <section class="section">
    <div class="section__head"><h2 class="section__title">남은 준비 ${todo.length}개</h2><a class="section__aside" href="#/check">전체 보기</a></div>
    ${top.length ? `<div class="list">${top.map((c) => `
      <a class="list__row" href="#/check">
        <span class="list__main"><span class="list__title">${esc(c.title)}</span><span class="list__sub">${esc(c.groupLabel)}${c.due ? ` · ${dateLabel(c.due)}까지` : ''}</span></span>
      </a>`).join('')}</div>` : '<p class="empty">준비를 모두 마쳤어요</p>'}
  </section>`;
}

export function viewNow(ctx) {
  const phase = tripPhase(ctx.data, ctx.nowMs);
  const { current, next } = findNowNext(ctx.data.events, ctx.nowMs);
  const parts = [];
  if (phase === 'before') {
    const n = dDay(ctx.data, ctx.nowMs);
    parts.push(`<section class="section"><div class="dday"><p class="dday__num">D-${n}</p><p class="dday__text">출발까지</p></div></section>`);
  }
  if (phase === 'during') parts.push(`<section class="section">${nowCard(ctx, current, next)}</section>`);
  if (next) parts.push(`<section class="section">${nextTag(ctx, next)}</section>`);
  if (phase !== 'after') {
    const mv = nextMove(ctx, next);
    if (mv) parts.push(`<section class="section">${mv}</section>`);
  }
  if (phase === 'before') parts.push(prepList(ctx));
  if (phase === 'after') parts.push('<p class="empty">여행이 끝났어요. 수고했어요</p>');
  const day = ctx.ix.days.get(currentDayId(ctx.data, ctx.nowMs));
  if (day && phase !== 'after') {
    parts.push(`<section class="section"><div class="section__head"><h2 class="section__title">${phase === 'before' ? '첫날' : '오늘'} · ${esc(day.title)}</h2><a class="section__aside" href="#/days/${day.id}">${dateLabel(day.date, day.weekday)}</a></div>${board(ctx, day, { details: false })}</section>`);
  }
  return parts.join('');
}
