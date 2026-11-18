// 일정: 날짜 탭 + 그날 안내판(행을 펼치면 설명·길안내·연결 예약·메모)
import { findNowNext, currentDayId } from '../core/now.js';
import { esc, chip, eventBadge, localTime, dateLabel, bookingBadgeOf, navButtons, formatLength } from '../ui.js';
import { memoOf } from '../state.js';


/** "21:00-22:30경" → ["21:00", "22:30경"], "해질 무렵" → ["17:30", "해질 무렵"] */
function splitLabel(label, ev) {
  const m = /^(\d{1,2}:\d{2})(.*)$/.exec(label.replace(/\[[^\]]+\]/, '').trim());
  if (m) return [m[1], m[2].replace(/^\s*[-→~]\s*/, '').trim()];
  return [localTime(ev.startUtc, ev.tz), label];
}

/** 오디오 가이드: 동선 순서 트랙(제목·길이·위치 힌트). 트랙이 없는 대상 장소는 준비 중 */
function guideList(ctx, ev, guide, tracks) {
  if (!tracks.length) {
    return guide || ev.kind === 'visit' ? '<p class="note">오디오 가이드 준비 중</p>' : '';
  }
  const np = ctx.nowPlaying;
  return `<ol class="tracks" aria-label="${esc(guide.title)} 오디오 가이드">${tracks.map((t, i) => {
    const on = np && np.placeId === guide.id && np.trackId === t.id;
    return `<li><button class="track${on ? ' track--on' : ''}" type="button" data-play-place="${esc(guide.id)}" data-play-index="${i}" aria-label="${esc(t.title)} 재생${on ? '(재생 중)' : ''}">
      <span class="track__n">${i + 1}</span>
      <span class="track__main"><span class="track__title">${esc(t.title)}</span><span class="track__sub">${t.durationSec ? formatLength(t.durationSec) : ''}${t.locationHint ? ` · ${esc(t.locationHint)}` : ''}</span></span>
      <svg class="icon" aria-hidden="true"><use href="#i-${on && np.playing ? 'pause' : 'play'}"/></svg>
    </button></li>`;
  }).join('')}</ol>`;
}

/** 하루 안내판. details=true면 행을 펼쳐 메모까지 */
export function board(ctx, day, { details }) {
  const live = findNowNext(ctx.data.events, ctx.nowMs).current; // 진행 중 행은 하나만
  const events = ctx.ix.eventsByDay.get(day.id) ?? [];
  if (!events.length) return '<p class="empty">이날은 아직 일정이 없어요</p>';
  // 한국 시각과 현지 시각이 섞인 날에만 행마다 표시(현지끼리 시간대 이름만 다른 경우는 표시 안 함)
  const home = ctx.data.trip.homeTz;
  const mixedTz = events.some((e) => e.tz === home) && events.some((e) => e.tz !== home);
  const rows = events.map((ev) => {
    const when = ev === live ? 'now' : ctx.nowMs >= ev.startUtc ? 'past' : 'next';
    const badge = eventBadge(ctx, ev);
    const [main, sub] = ev.approx && ev.timeLabel ? splitLabel(ev.timeLabel, ev) : [localTime(ev.startUtc, ev.tz), ''];
    const tz = mixedTz ? `<span class="board__tz">${ev.tz === ctx.data.trip.homeTz ? '한국' : '현지'}</span>` : '';
    const memo = memoOf(ev.key);
    const guide = ctx.ix.audioByEvent?.get(ev.id);
    const tracks = guide?.tracks.filter((t) => t.file) ?? [];
    const head = `
      <p class="board__time">${esc(main)}${sub ? `<small>${esc(sub)}</small>` : ''}${tz}</p>
      <div class="board__main">
        <p class="board__title">${esc(ev.title)}</p>
        ${ev.detail && !details ? `<p class="board__detail">${esc(ev.detail)}</p>` : ''}
        ${badge.state !== 'plan' || memo || tracks.length ? `<p class="board__chips">${badge.state !== 'plan' ? chip(badge) : ''}${tracks.length ? `<span class="chip chip--quiet">가이드 ${tracks.length}</span>` : ''}${memo ? '<span class="chip chip--quiet">메모</span>' : ''}</p>` : ''}
      </div>`;
    if (!details) return `<li class="board__row" data-when="${when}">${head}</li>`;
    const open = ctx.openRows.has(ev.key) ? ' open' : '';
    const bookings = ev.bookingIds.map((id) => ctx.ix.bookings.get(id)).filter(Boolean);
    return `
    <li class="board__row board__row--details" data-when="${when}">
      <details data-row="${ev.key}"${open}>
        <summary>${head}</summary>
        <div class="board__more">
          ${ev.detail ? `<p class="board__detail">${esc(ev.detail)}</p>` : ''}
          ${ev.stops.map((s) => navButtons(s, ev.kind, s.name, { small: true })).join('')}
          ${bookings.length ? `<div class="links">${bookings.map((b) => `<a class="btn btn--line btn--sm" href="#/bookings/${esc(b.id)}">${esc(b.title)} · ${bookingBadgeOf(ctx, b).label}</a>`).join('')}</div>` : ''}
          ${guideList(ctx, ev, guide, tracks)}
          <label class="memo">
            <span class="field__label">메모(이 폰에만 저장)</span>
            <textarea data-memo="${ev.key}" rows="3">${esc(memo)}</textarea>
          </label>
        </div>
      </details>
    </li>`;
  });
  return `<ol class="board" aria-label="${esc(day.title)} 일정">${rows.join('')}</ol>`;
}

export function viewDays(ctx, dayId) {
  const day = ctx.ix.days.get(dayId) ?? ctx.ix.days.get(currentDayId(ctx.data, ctx.nowMs)) ?? ctx.data.days[0];
  if (!day) return '<p class="empty">일정이 없어요</p>';
  const todayId = currentDayId(ctx.data, ctx.nowMs);
  const tabs = ctx.data.days.map((d) => `
    <a class="days__item" role="tab" href="#/days/${d.id}" aria-selected="${d.id === day.id}"${d.id === todayId ? ' data-today="true"' : ''}>${d.weekday}<b>${Number(d.date.slice(8))}</b></a>`).join('');
  const stayBooking = day.stay?.bookingId ? ctx.ix.bookings.get(day.stay.bookingId) : null;
  return `
  <nav class="days" role="tablist" aria-label="날짜">${tabs}</nav>
  <section class="section">
    <div class="section__head"><h2 class="section__title">${day.n}일차 · ${esc(day.title)}</h2><p class="section__aside">${dateLabel(day.date, day.weekday)}</p></div>
    ${day.stay ? `<p class="note">숙박 <b>${esc(day.stay.name)}</b>${day.stay.nth ? ` · ${day.stay.nth}/${day.stay.total}박` : ''}${stayBooking ? ` · <a href="#/bookings/${esc(stayBooking.id)}">예약 보기</a>` : ''}</p>` : ''}
    ${board(ctx, day, { details: true })}
    ${day.notes.length ? `<div class="list">${day.notes.map((n) => `<div class="list__row"><span class="list__main"><span class="list__sub">${esc(n.label)}</span><span>${esc(n.text)}</span></span></div>`).join('')}</div>` : ''}
  </section>`;
}
