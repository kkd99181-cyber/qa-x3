// 준비: 그룹별 체크리스트(폰별 저장)
import { esc, icon, dateLabel } from '../ui.js';
import { isChecked } from '../state.js';

export function viewCheck(ctx) {
  const groups = new Map();
  for (const c of ctx.data.checklist) { if (!groups.has(c.groupLabel)) groups.set(c.groupLabel, []); groups.get(c.groupLabel).push(c); }
  const done = ctx.data.checklist.filter(isChecked).length;
  return `
  <p class="note"><b>${done}/${ctx.data.checklist.length}</b> 완료 · 체크는 이 폰에만 저장돼요</p>
  ${[...groups].map(([label, items]) => `
  <section class="section">
    <div class="section__head"><h2 class="section__title">${esc(label)}</h2><p class="section__aside">${items.filter(isChecked).length}/${items.length}</p></div>
    <div class="list">${items.map((c) => `
      <label class="list__row check">
        <input type="checkbox" data-check="${esc(c.id)}"${isChecked(c) ? ' checked' : ''}>
        <span class="check__box">${icon('check')}</span>
        <span class="list__main">
          <span class="list__title">${esc(c.title)}</span>
          ${c.details || c.due ? `<span class="list__sub">${c.due ? `<b>${dateLabel(c.due)}까지</b> · ` : ''}${esc(c.details ?? '')}</span>` : ''}
        </span>
      </label>
      ${c.links.length ? `<div class="list__row links">${c.links.map((u) => `<a class="btn btn--line btn--sm" href="${esc(u)}" target="_blank" rel="noopener">${icon('link', 'icon icon--sm')}공식 안내</a>`).join('')}</div>` : ''}`).join('')}
    </div>
  </section>`).join('')}`;
}
