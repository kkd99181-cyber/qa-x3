// 현지에서 낼 돈: 날짜순 항목 + 결제 완료 체크(폰별) + 통화별·원화 합계 + 확인 필요
import { onSiteSummary } from '../core/money.js';
import { esc, icon, money, moneyTotals, krwOf, dateLabel } from '../ui.js';

const checkRow = (ctx, p, checked) => {
  const m = money(ctx, p.amountMinor, p.currency);
  const cash = p.cash === 'required' ? '현금 필요' : p.cash === 'unknown' ? '카드·현금 미확인' : '';
  return `
  <label class="list__row check">
    <input type="checkbox" data-paid="${esc(p.id)}"${checked ? ' checked' : ''}>
    <span class="check__box">${icon('check')}</span>
    <span class="list__main"><span class="list__title">${esc(p.label)}</span><span class="list__sub">${p.dueDate ? dateLabel(p.dueDate) : '날짜 미정'}${cash ? ` · ${cash}` : ''}</span></span>
    <span class="amount${p.amountMinor == null ? ' amount--unknown' : ''}"><span class="amount__orig">${m.orig}</span>${m.krw ? `<span class="amount__krw">${m.krw}</span>` : ''}</span>
  </label>`;
};

export function viewMoney(ctx) {
  const s = onSiteSummary(ctx.data.payments, ctx.data.fx, ctx.paid);
  const markedPaid = ctx.data.payments.filter((p) => p.status !== 'paid' && ctx.paid.has(p.id));
  const krw = krwOf(ctx, s.totals);
  const missing = s.due.filter((p) => p.amountMinor == null).length;
  const cash = ctx.data.cashPlanning;
  return `
  <section class="section">
    <div class="list">
      ${s.due.length ? s.due.map((p) => checkRow(ctx, p, false)).join('') : '<p class="list__row note">현지에서 낼 돈이 없어요</p>'}
      <div class="total">
        <span class="total__label">남은 합계</span>
        <span class="total__value">${moneyTotals(ctx, s.totals)}<small>${krw != null && Object.keys(s.totals).some((c) => c !== 'KRW') ? `약 ${krw.toLocaleString('ko-KR')}원 · ` : ''}환율 기준 ${dateLabel(ctx.data.fx.asOf)}${missing ? ` · 금액 미확인 ${missing}건 제외` : ''}</small></span>
      </div>
    </div>
    ${ctx.data.fx.confirmed ? '' : '<p class="note"><span class="flag">임시 환율</span> 원화 환산은 참고용이에요</p>'}
  </section>
  ${s.unknown.length ? `
  <section class="section">
    <div class="section__head"><h2 class="section__title">확인 필요 ${s.unknown.length}</h2><p class="section__aside">합계에 넣지 않음</p></div>
    <div class="list">${s.unknown.map((p) => {
      const ref = p.reference ? `참고액 ${money(ctx, p.reference.amountMinor, p.currency).orig}` : '';
      const what = p.amountMinor == null ? '금액·결제 방식 미확인' : '선결제인지 현장 결제인지 미확인';
      return `<div class="list__row"><span class="list__main"><span class="list__title">${esc(p.label)}</span><span class="list__sub">${p.dueDate ? dateLabel(p.dueDate) : '날짜 미정'} · ${what}${ref ? ` · ${ref}` : ''}</span></span><span class="amount${p.amountMinor == null ? ' amount--unknown' : ''}"><span class="amount__orig">${money(ctx, p.amountMinor, p.currency).orig}</span></span></div>`;
    }).join('')}</div>
  </section>` : ''}
  ${markedPaid.length ? `
  <section class="section">
    <div class="section__head"><h2 class="section__title">결제 완료로 표시함 ${markedPaid.length}</h2><p class="section__aside">이 폰에만 저장</p></div>
    <div class="list">${markedPaid.map((p) => checkRow(ctx, p, true)).join('')}</div>
  </section>` : ''}
  ${cash?.notes ? `<section class="section"><h2 class="section__title">현금 메모</h2><p class="note">${esc(cash.notes)}</p></section>` : ''}`;
}
