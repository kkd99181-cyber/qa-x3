// 설정: 데이터·앱 정보, 업데이트 확인, 오디오(A6 자리), 비밀번호 다시 입력, 이 폰 기록 지우기
import { esc, dateLabel, fxNote } from '../ui.js';
import { counts } from '../state.js';

export function viewSettings(ctx) {
  const c = counts();
  const gen = new Date(ctx.data.generatedAt);
  return `
  <section class="section">
    <h2 class="section__title">데이터</h2>
    <div class="sum">
      <div class="sum__row"><span class="sum__label">일정 갱신</span><span class="sum__value">${ctx.data.source.updatedOn ? dateLabel(ctx.data.source.updatedOn) : '—'}</span></div>
      <div class="sum__row"><span class="sum__label">앱 데이터 만든 시각</span><span class="sum__value">${gen.getMonth() + 1}월 ${gen.getDate()}일 ${String(gen.getHours()).padStart(2, '0')}:${String(gen.getMinutes()).padStart(2, '0')}</span></div>
      <div class="sum__row"><span class="sum__label">앱 버전</span><span class="sum__value mono" id="app-version">—</span></div>
      <div class="sum__row"><span class="sum__label">환율</span><span class="sum__value">${esc(fxNote(ctx))}</span></div>
    </div>
    <button class="btn btn--line" type="button" data-action="check-update">업데이트 확인</button>
    <p class="note" id="update-status" role="status"></p>
  </section>
  <section class="section">
    <h2 class="section__title">오디오 가이드</h2>
    <div id="audio-dl" class="sum" aria-live="polite"><p class="note">확인 중</p></div>
  </section>
  <section class="section">
    <h2 class="section__title">이 폰</h2>
    <p class="note">체크 ${c.checks}개 · 결제 완료 표시 ${c.paid}개 · 메모 ${c.memos}개가 이 폰에만 저장돼 있어요</p>
    <button class="btn btn--line" type="button" data-action="relock">비밀번호 다시 입력</button>
    <button class="btn btn--line" type="button" data-action="reset-state">이 폰의 체크·메모 지우기</button>
  </section>`;
}
