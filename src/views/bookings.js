// 예약 · 이동(같은 탭, 위쪽 전환)
import { bookingTotals } from '../core/money.js';
import { formatDuration } from '../core/now.js';
import { esc, icon, BADGE, money, moneyTotals, krwOf, fxNote, dateLabel, localTime, modeIcon, MODE_LABEL, bookingBadgeOf, linksOf, navButtons, legFrom, legTime } from '../ui.js';

const KIND = { hotel: '숙소', flight: '항공', train: '열차', transfer: '이동', admission: '입장권' };
const ADVANCE = {
  recommended: '사전 예매 권장', time_slot_required: '시간 지정 필수', optional_time_slot: '시간 지정(선택)', optional: '선택',
  weather_dependent: '날씨 보고 결정', no_ticket_for_store: '입장권 필요 없음', not_usually_needed_for_regular_service: '보통 사전 예약 불필요',
};
const PLAN = { candidate: '후보', selected: '정함' };

export const segTabs = (current) => `
  <nav class="seg" aria-label="예약과 이동">
    <a class="seg__item" href="#/bookings"${current === 'bookings' ? ' aria-current="page"' : ''}>예약</a>
    <a class="seg__item" href="#/moves"${current === 'moves' ? ' aria-current="page"' : ''}>이동</a>
  </nav>`;

const kvRow = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : '');
const yesNo = (v, yes, no) => (v == null ? '미확인' : v ? yes : no);

function paymentLine(ctx, p) {
  const m = money(ctx, p.amountMinor, p.currency);
  const shared = p.bookingIds.length > 1 ? ' · 다른 예약과 같은 결제(합계엔 한 번)' : '';
  const paidHere = ctx.paid.has(p.id);
  const state = p.status === 'paid' ? '선결제 완료'
    : paidHere ? '결제 완료로 표시함'
    : p.status === 'unpaid' || p.timing === 'on_site' ? `현장 결제${p.dueDate ? ` · ${dateLabel(p.dueDate)}` : ''}`
    : '결제 상태 미확인';
  const cash = p.cash === 'required' ? ' · 현금 필요' : p.cash === 'unknown' && p.status !== 'paid' ? ' · 카드·현금 미확인' : '';
  const ref = p.reference ? `<small>참고액 ${money(ctx, p.reference.amountMinor, p.currency).orig}(합계 제외)</small>` : '';
  return `<dt>${esc(p.kind === 'city_tax' ? '도시세' : p.kind === 'room' ? '객실' : p.kind === 'airfare' ? '항공권' : '결제')}</dt>
    <dd>${m.orig}${m.krw ? ` <small>${m.krw}</small>` : ''}<small>${state}${cash}${shared}</small>${ref}</dd>`;
}

/** 예약의 길안내 대상: 숙소 주소 / 이동은 첫 구간 출발지 / 입장권은 연결된 일정의 장소 */
function navTo(ctx, b, legs) {
  if (b.kind === 'hotel') return navButtons({ name: b.title, address: b.address, lat: b.lat, lng: b.lng }, 'transit', '숙소 길안내', { small: true });
  if (legs.length) { const f = legFrom(legs[0]); return f ? navButtons(f, 'transit', '출발지 길안내', { small: true }) : ''; }
  const stop = ctx.data.events.find((e) => e.bookingIds.includes(b.id) && e.stops.length)?.stops[0];
  return stop ? navButtons(stop, 'transit', `${stop.name} 길안내`, { small: true }) : '';
}

function bookingTag(ctx, b) {
  const badge = bookingBadgeOf(ctx, b);
  const pays = b.paymentIds.map((id) => ctx.ix.payments.get(id)).filter(Boolean);
  const legs = b.legIds.map((id) => ctx.ix.legs.get(id)).filter(Boolean);
  const t = pays.length ? bookingTotals(pays, ctx.paid) : null;
  let rows = '';
  if (b.kind === 'hotel') {
    rows += kvRow('체크인', `${dateLabel(b.checkIn)} ${b.checkInFrom ? `${b.checkInFrom}부터` : '<small>시각 미확인</small>'}`);
    rows += kvRow('체크아웃', `${dateLabel(b.checkOut)} ${b.checkOutBy ? `${b.checkOutBy}까지` : '<small>시각 미확인</small>'}`);
    rows += kvRow('객실', `${esc(b.room ?? '미확인')} · 조식 ${yesNo(b.breakfast, '포함', '미포함')}${b.nights ? ` · ${b.nights}박` : ''}`);
    if (b.refundability === 'nonrefundable') rows += kvRow('취소', '환불 불가');
    if (b.freeCancelUntil) rows += kvRow('무료 취소', `${dateLabel(b.freeCancelUntil)}까지`);
    rows += kvRow('주소', esc(b.address));
  } else if (legs.length) {
    const first = legs[0], last = legs.at(-1);
    const at = (e) => (e.atUtc ? `${dateLabel(e.local.slice(0, 10))} ${localTime(e.atUtc, e.tz)}` : '');
    rows += kvRow('출발', `${esc(first.from.name ?? '')} ${at(first.from)}`.trim() || '미정');
    rows += kvRow('도착', `${esc(last.to.name ?? '')} ${at(last.to)}`.trim() || '미정');
    if (legs.length > 1) rows += kvRow('구간', `${legs.length}개 · <a href="#/moves">이동에서 보기</a>`);
    else if (first.service) rows += kvRow('편·열차', esc(first.service));
    if (b.planStatus) rows += kvRow('계획', PLAN[b.planStatus] ?? esc(b.planStatus));
  } else if (b.date) {
    rows += kvRow('날짜', `${dateLabel(b.date)}${b.entryLocal ? ` ${b.entryLocal.slice(11, 16)} 입장` : ''}`);
  }
  if (b.advanceBooking) rows += kvRow('예매', ADVANCE[b.advanceBooking] ?? esc(b.advanceBooking));
  if (b.choiceGroup) rows += kvRow('선택', '같은 날 후보 중 한 곳');
  if (b.priceRef?.totalMinor != null) {
    const m = money(ctx, b.priceRef.totalMinor, b.priceRef.currency);
    rows += kvRow('예상 가격', `${m.orig} <small>2인 · 기준 ${dateLabel(b.priceRef.asOf)}${m.krw ? ` · ${m.krw}` : ''}</small>`);
  }
  rows += pays.map((p) => paymentLine(ctx, p)).join('');
  if (t && pays.length > 1) {
    rows += kvRow('총액', moneyTotals(ctx, t.total));
    rows += kvRow('선결제', moneyTotals(ctx, t.paid));
    rows += kvRow('추가 결제', moneyTotals(ctx, t.remaining));
  }
  if (b.notes.length) rows += kvRow('메모', b.notes.map(esc).join('<br>'));
  const shown = b.voucher && ctx.openVouchers?.get(b.voucher);
  const showImg = shown && shown.type.startsWith('image/');
  const links = linksOf(b.contact) + (b.voucher && !showImg ? `<button class="btn btn--sm" type="button" data-voucher="${esc(b.voucher)}" data-type="${esc(b.voucherType ?? '')}">${icon('file', 'icon icon--sm')}바우처 보기</button>` : '');
  return `
  <article class="tag" data-state="${badge.state}" id="b-${esc(b.id)}">
    <div class="tag__band"><span>${badge.label}</span><span class="tag__band-meta">${KIND[b.kind] ?? ''}</span></div>
    <div class="tag__body">
      <h3 class="tag__title">${esc(b.title)}</h3>
      ${rows ? `<dl class="kv">${rows}</dl>` : ''}
      ${navTo(ctx, b, legs)}
      ${links ? `<div class="links">${links}</div>` : ''}
      <div class="voucher" data-voucher-slot="${esc(b.voucher ?? '')}"${showImg ? '' : ' hidden'}>${showImg ? `<img src="${esc(shown.url)}" alt="바우처">` : ''}</div>
    </div>
    <div class="tag__perf" aria-hidden="true"></div>
    <div class="tag__stub"><span class="tag__ref-label">예약 번호</span>${b.ref ? `<span class="tag__ref">${esc(b.ref)}</span>` : `<span class="tag__ref tag__ref--none">${b.status === 'booked' ? '미확인' : '아직 없음'}</span>`}</div>
  </article>`;
}

export function viewBookings(ctx) {
  const t = bookingTotals(ctx.data.payments, ctx.paid);
  const line = (label, totals, strong) => {
    const k = krwOf(ctx, totals);
    return `<div class="sum__row${strong ? ' sum__row--strong' : ''}"><span class="sum__label">${label}</span><span class="sum__value">${moneyTotals(ctx, totals)}${k != null && Object.keys(totals).some((c) => c !== 'KRW') ? `<small>약 ${k.toLocaleString('ko-KR')}원</small>` : ''}</span></div>`;
  };
  const open = ctx.data.bookings.filter((b) => b.status !== 'booked').length;
  const groups = [['hotel', '숙소'], ['flight', '항공'], ['train', '열차·이동'], ['admission', '입장권']];
  const byKind = (k) => ctx.data.bookings.filter((b) => (k === 'train' ? b.kind === 'train' || b.kind === 'transfer' : b.kind === k));
  return `
  ${segTabs('bookings')}
  <section class="sum" aria-label="예약 합계">
    ${line('총액', t.total, true)}
    ${line('선결제', t.paid)}
    ${line('남은 결제', t.remaining)}
    <div class="sum__row"><span class="sum__label">확인 필요</span><span class="sum__value">금액 미확인 ${t.unknownAmount}건 · 결제 상태 미확인 ${t.unknownStatus}건</span></div>
    <div class="sum__row"><span class="sum__label">미예약</span><span class="sum__value">${open}건</span></div>
    <p class="note">같은 결제를 여러 예약이 나눠 써도 한 번만 더했어요 · ${fxNote(ctx)}</p>
  </section>
  <nav class="links" aria-label="예약 종류로 이동">${groups.filter(([k]) => byKind(k).length).map(([k, label]) => `<a class="btn btn--line btn--sm" href="#/bookings/grp-${k}">${label} ${byKind(k).length}</a>`).join('')}</nav>
  ${groups.map(([k, label]) => {
    const list = byKind(k);
    return list.length ? `<section class="section" id="grp-${k}"><h2 class="section__title">${label} ${list.length}</h2>${list.map((b) => bookingTag(ctx, b)).join('')}</section>` : '';
  }).join('')}`;
}

function legTag(ctx, l) {
  const b = ctx.ix.bookings.get(l.bookingId);
  const badge = l.status === 'booked' ? BADGE.booked : BADGE.not_booked;
  const time = (e) => (e.atUtc ? localTime(e.atUtc, e.tz) : '');
  // 출발과 도착의 현지 날짜가 다르면 도착 시각 앞에 날짜를 붙인다(밤 비행 등)
  const arrDate = l.to.local && l.from.local && l.to.local.slice(0, 10) !== l.from.local.slice(0, 10) ? `<small class="leg__date">${dateLabel(l.to.local.slice(0, 10))}</small>` : '';
  const from = legFrom(l);
  const meta = [
    l.service, l.carrier,
    l.coach ? `${l.coach}호차` : null, l.seat ? `좌석 ${l.seat}` : null,
    l.from.terminal ? `터미널 ${l.from.terminal}` : null, l.from.gate ? `게이트 ${l.from.gate}` : null,
    l.from.platform ? `플랫폼 ${l.from.platform}` : null,
    l.durationMin ? formatDuration(l.durationMin * 60000) : null,
  ].filter(Boolean).map(esc).join(' · ');
  const windowText = l.window ? `${l.window.from}–${l.window.to} ${l.window.kind === 'depart' ? '출발 예정' : '도착 목표'}` : '시각 미정';
  const ref = l.ref ?? b?.ref;
  return `
  <article class="tag" data-state="${badge.state}">
    <div class="tag__band"><span>${badge.label}</span><span class="tag__band-meta">${MODE_LABEL[l.mode] ?? '이동'}${l.timetableStatus === 'candidate_unverified_for_date' ? ' · 후보' : ''}</span></div>
    <div class="tag__body">
      <div class="leg">
        <span class="leg__icon">${modeIcon(l.mode)}</span>
        <div>
          <p class="leg__line"><span class="leg__time">${time(l.from) || '—'}</span><span class="leg__place">${esc(l.from.name ?? b?.title ?? '')}</span></p>
          <p class="leg__mid">${meta || (l.from.atUtc ? '' : esc(windowText))}</p>
          <p class="leg__line"><span class="leg__time">${arrDate}${time(l.to) || '—'}</span><span class="leg__place">${esc(l.to.name ?? '')}</span></p>
        </div>
      </div>
      ${from ? navButtons(from, 'transit', '출발지 길안내', { small: true }) : ''}
      ${l.note ? `<p class="note">${esc(l.note)}</p>` : ''}
    </div>
    <div class="tag__perf" aria-hidden="true"></div>
    <div class="tag__stub"><span class="tag__ref-label">예약 번호</span>${ref ? `<span class="tag__ref">${esc(ref)}</span>` : `<span class="tag__ref tag__ref--none">${l.status === 'booked' ? '미확인' : '아직 없음'}</span>`}</div>
  </article>`;
}

export function viewMoves(ctx) {
  const dateOf = (l) => l.from.local?.slice(0, 10) ?? ctx.ix.bookings.get(l.bookingId)?.date ?? '';
  const legs = [...ctx.data.legs].sort((a, b) => legTime(ctx, a).start - legTime(ctx, b).start); // 미정 구간도 희망 시간대로 제자리에
  const groups = new Map();
  for (const l of legs) { const d = dateOf(l); if (!groups.has(d)) groups.set(d, []); groups.get(d).push(l); }
  const dayOf = (date) => ctx.data.days.find((d) => d.date === date);
  const open = legs.filter((l) => l.status !== 'booked').length;
  return `
  ${segTabs('moves')}
  <p class="note">구간 ${legs.length}개 · <b>미예약 ${open}개</b> · 시각은 모두 그 장소의 현지 시각</p>
  ${[...groups].map(([date, list]) => `
    <section class="section">
      <h2 class="group-title">${date ? dateLabel(date, dayOf(date)?.weekday) : '날짜 미정'}${dayOf(date) ? ` · ${esc(dayOf(date).title)}` : ''}</h2>
      ${list.map((l) => legTag(ctx, l)).join('')}
    </section>`).join('')}`;
}
