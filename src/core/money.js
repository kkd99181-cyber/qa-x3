// 금액: 최소화폐단위(정수) 규칙. null = 미확인(0과 다름).

export function formatMoney(minor, currency, digits = { KRW: 0 }) {
  if (minor == null) return '미확인';
  const d = digits[currency] ?? 2;
  const value = minor / 10 ** d;
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency', currency, minimumFractionDigits: value % 1 ? d : 0, maximumFractionDigits: d,
  }).format(value);
}

/** 원화 환산(정수 원). 환율 없으면 null */
export function toKRW(minor, currency, fx) {
  if (minor == null) return null;
  if (currency === 'KRW') return minor;
  const rate = fx.toKRW[currency];
  if (rate == null) return null;
  const d = fx.digits[currency] ?? 2;
  return Math.round((minor / 10 ** d) * rate);
}

/** 예약 상태 배지: 미예약 / 현장 결제 필요 / 예약 완료 */
export function bookingBadge(booking, paymentsById, paidLocal = new Set()) {
  if (booking.status !== 'booked') return 'not_booked';
  const onSite = booking.paymentIds
    .map(id => paymentsById.get(id))
    .some(p => p && !paidLocal.has(p.id) && p.status !== 'paid' && (p.timing === 'on_site' || p.status === 'unpaid'));
  return onSite ? 'pay_on_site' : 'booked';
}

/**
 * 현지에서 낼 돈 요약.
 * - 대상: 결제 안 됨(unpaid) 또는 현장 결제(on_site). 폰에서 '결제 완료' 체크한 건 제외
 * - 확인 필요: 결제 상태 미확인(unknown) — 합계에 넣지 않고 따로 보여 줌
 */
export function onSiteSummary(payments, fx, paidLocal = new Set()) {
  const due = [], unknown = [];
  for (const p of payments) {
    if (p.status === 'paid' || paidLocal.has(p.id)) continue;
    if (p.status === 'unpaid' || p.timing === 'on_site') due.push(p);
    else unknown.push(p);
  }
  const byDate = (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
  due.sort(byDate); unknown.sort(byDate);
  const totals = {};
  let krw = 0, krwComplete = true;
  for (const p of due) {
    if (p.amountMinor == null) { krwComplete = false; continue; }
    totals[p.currency] = (totals[p.currency] ?? 0) + p.amountMinor;
    const k = toKRW(p.amountMinor, p.currency, fx);
    if (k == null) krwComplete = false; else krw += k;
  }
  return { due, unknown, totals, krwTotal: krw, krwComplete };
}

/**
 * 예약 화면 요약: 통화별 총액·선결제·남은 결제. 여러 예약이 같은 결제를 참조해도 결제 단위로 한 번만 센다.
 * 폰에서 결제 완료로 표시한 것은 선결제 쪽으로 옮긴다. 금액 미확인(null)은 합계에 넣지 않고 개수만 센다.
 */
export function bookingTotals(payments, paidLocal = new Set()) {
  const add = (o, c, v) => { o[c] = (o[c] ?? 0) + v; };
  const total = {}, paid = {}, remaining = {};
  let unknownAmount = 0, unknownStatus = 0;
  for (const p of payments) {
    if (p.amountMinor == null) { unknownAmount++; continue; }
    add(total, p.currency, p.amountMinor);
    if (p.status === 'paid' || paidLocal.has(p.id)) add(paid, p.currency, p.amountMinor);
    else if (p.status === 'unpaid' || p.timing === 'on_site') add(remaining, p.currency, p.amountMinor);
    else unknownStatus++;
  }
  return { total, paid, remaining, unknownAmount, unknownStatus };
}
