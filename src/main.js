// 앱 셸: 잠금 → 데이터 → 해시 라우팅 → 화면 렌더 + 화면 안 조작(체크·결제·메모·바우처·설정)
import { openWithStoredKey, openWithPassword, openAsset, clearKey, forgetKey, OpenError } from './data.js';
import { setupServiceWorker } from './sw-client.js';
import { findNowNext, tripPhase } from './core/now.js';
import { wallClock } from './core/tz.js';
import { esc, index, tzLabel } from './ui.js';
import { setChecked, setPaid, setMemo, paidSet, resetAll } from './state.js';
import { viewNow } from './views/now.js';
import { viewDays } from './views/days.js';
import { viewBookings, viewMoves } from './views/bookings.js';
import { viewMoney } from './views/money.js';
import { viewCheck } from './views/check.js';
import { viewSettings } from './views/settings.js';
import { setupPlayer, playPlace, stop as stopAudio, nowPlaying, audioStatus, downloadAll } from './audio.js';

const $ = (id) => document.getElementById(id);

const ROUTES = {
  now: { title: '지금', tab: 'now', render: (ctx) => viewNow(ctx) },
  days: { title: '일정', tab: 'days', render: (ctx, arg) => viewDays(ctx, arg) },
  bookings: { title: '예약', tab: 'bookings', render: (ctx) => viewBookings(ctx) },
  moves: { title: '이동', tab: 'bookings', render: (ctx) => viewMoves(ctx) },
  money: { title: '현지에서 낼 돈', tab: 'money', render: (ctx) => viewMoney(ctx) },
  check: { title: '준비', tab: 'check', render: (ctx) => viewCheck(ctx) },
  settings: { title: '설정', tab: null, render: (ctx) => viewSettings(ctx) },
};

let data = null;
let ix = null;
let locked = true;      // 잠금·오류 화면에서는 어떤 경로로도 복호화 데이터를 다시 그리지 않는다
let session = 0;        // 잠금·화면 이탈 때 늘려서, 늦게 끝난 바우처 복호화 결과를 버린다
let lastRoute = null;
const openRows = new Set(); // 펼친 일정 행(다시 그려도 유지)
const openVouchers = new Map(); // 연 바우처: 공개 이름 → { url(Blob), type }. 같은 화면에서 다시 그려도 유지

/** 연 바우처의 Blob URL 해제(화면 이탈·잠금·페이지 종료) */
function releaseVouchers() {
  for (const v of openVouchers.values()) URL.revokeObjectURL(v.url);
  openVouchers.clear();
  session++;
}

function route() {
  const [, name = 'now', arg = null] = location.hash.match(/^#\/(\w+)(?:\/([\w-]+))?/) ?? [];
  return { name: ROUTES[name] ? name : 'now', arg };
}

function render() {
  if (locked || !data) return;
  const nowMs = Date.now();
  const { name, arg } = route();
  if (lastRoute !== null && name !== lastRoute) releaseVouchers(); // 예약 화면을 떠나면 바우처 닫음
  lastRoute = name;
  const r = ROUTES[name];
  for (const a of document.querySelectorAll('.tabbar__item')) {
    if (a.dataset.tab === r.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  if (name === 'settings') $('settings-btn').setAttribute('aria-current', 'page'); else $('settings-btn').removeAttribute('aria-current');
  $('appbar-title').textContent = r.title;
  const nn = findNowNext(data.events, nowMs);
  const tz = nn.current?.tz ?? (tripPhase(data, nowMs) === 'during' ? nn.next?.tz : null) ?? data.trip.homeTz;
  const w = wallClock(nowMs, tz);
  const ctx = { data, ix, nowMs, paid: paidSet(), openRows, openVouchers, nowPlaying: nowPlaying() };
  $('appbar-meta').textContent = `${w.m}월 ${w.d}일 ${w.time} ${tzLabel(ctx, tz)}`;
  $('view').innerHTML = r.render(ctx, arg);
  if (name === 'settings') { showVersion(); showAudioStatus(); }
  if (name === 'bookings' && arg) (document.getElementById(`b-${arg}`) ?? document.getElementById(arg))?.scrollIntoView({ block: 'start' });
  if (name === 'days') document.querySelector('.days__item[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

/** 입력 중(메모)에는 주기적 다시 그리기를 건너뛴다 */
const typing = () => document.activeElement?.matches?.('#view textarea, #view input');

function showVersion() {
  const ctl = navigator.serviceWorker?.controller;
  if (!ctl) return;
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.version && $('app-version')) $('app-version').textContent = e.data.version; }, { once: true });
  ctl.postMessage('VERSION');
}

function bindViewEvents() {
  const view = $('view');
  view.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.check) { setChecked(t.dataset.check, t.checked); render(); }
    else if (t.dataset.paid) { setPaid(t.dataset.paid, t.checked); render(); }
  });
  // 메모는 입력할 때마다 바로 저장한다(앱이 곧바로 닫히거나 새로고침돼도 남도록)
  view.addEventListener('input', (e) => { if (e.target.dataset.memo) setMemo(e.target.dataset.memo, e.target.value); });
  view.addEventListener('toggle', (e) => {
    const key = e.target.dataset?.row;
    if (key) { if (e.target.open) openRows.add(key); else openRows.delete(key); }
  }, true);
  view.addEventListener('click', async (e) => {
    const v = e.target.closest('[data-voucher]');
    if (v) return showVoucher(v);
    const tr = e.target.closest('[data-play-place]');
    if (tr) {
      const p = data.audio.places.find((x) => x.id === tr.dataset.playPlace);
      const np = nowPlaying();
      if (p && np && np.placeId === p.id && np.trackId === p.tracks.filter((t) => t.file)[Number(tr.dataset.playIndex)]?.id) {
        const el = document.getElementById('audio');
        if (el.paused) el.play().catch(() => {}); else el.pause(); // 같은 트랙을 다시 누르면 재생/일시정지
      } else if (p) playPlace(p, Number(tr.dataset.playIndex));
      return;
    }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'relock') await lockApp('first');
    if (a.dataset.action === 'audio-dl') return runDownload();
    if (a.dataset.action === 'reset-state' && confirm('이 폰의 체크, 결제 완료 표시, 메모를 모두 지울까요?')) { resetAll(); render(); }
    if (a.dataset.action === 'check-update') {
      const status = $('update-status');
      status.textContent = '확인 중';
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        await reg?.update();
        status.textContent = reg?.waiting || reg?.installing ? '새 버전을 받았어요. 위의 업데이트를 누르세요' : '최신이에요';
      } catch {
        status.textContent = '지금은 확인할 수 없어요(오프라인). 기존 데이터로 계속 쓸 수 있어요';
      }
    }
  });
}

async function showVoucher(btn) {
  const name = btn.dataset.voucher;
  const type = btn.dataset.type;
  const token = session;
  btn.disabled = true;
  try {
    let url = await openAsset(name, type);
    if (token !== session || locked) { URL.revokeObjectURL(url); return; } // 그사이 잠금·화면 이동 → 버림
    const had = openVouchers.get(name);
    if (had) { URL.revokeObjectURL(url); url = had.url; } // 다시 그린 버튼으로 두 번 요청된 경우: 먼저 연 Blob 하나만 유지
    else openVouchers.set(name, { url, type });
    // 이미지는 화면 안에, 그 밖(PDF)은 "바우처 열기" 링크로 표시(다시 그려도 유지).
    // 복호화가 늦어 사용자 동작이 만료되면 새 창이 막힐 수 있어서, 아직 활성일 때만 바로 연다(빈 창을 미리 열지 않음)
    if (!type.startsWith('image/') && navigator.userActivation?.isActive !== false) window.open(url, '_blank', 'noopener');
    render();
  } catch (err) {
    if (token !== session || locked) return;
    const slot = btn.closest('.tag')?.querySelector('[data-voucher-slot]');
    if (slot) { slot.innerHTML = `<p class="lock__error">${esc(err.message ?? '바우처를 열지 못했어요')}</p>`; slot.hidden = false; }
  } finally {
    btn.disabled = false;
  }
}

const kb = (n) => (!n ? '0KB' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
let downloading = false;

/** 설정 화면의 오디오 내려받기 상태(비동기로 채움) */
async function showAudioStatus(progress) {
  const box = $('audio-dl');
  if (!box || !data) return;
  const s = progress ?? await audioStatus(data);
  if (!$('audio-dl') || locked) return;
  if (!s.count) { box.innerHTML = '<p class="note">오디오 가이드 준비 중이에요. 트랙이 생기면 여기서 한 번에 받아요</p>'; return; }
  const all = s.have === s.count || s.done === s.count;
  const done = s.done ?? s.have;
  const bytes = s.bytes ?? s.haveBytes;
  box.innerHTML = `
    <div class="sum__row"><span class="sum__label">트랙</span><span class="sum__value">${done}/${s.count}개 · ${kb(bytes)} / ${kb(s.total)}</span></div>
    <progress max="${s.count}" value="${done}" aria-label="내려받기 진행"></progress>
    ${s.failed ? `<p class="lock__error">${s.failed}개를 ${s.noSpace ? '저장하지 못했어요(폰 저장 공간 부족). 공간을 비운 뒤' : '받지 못했어요. 와이파이에서'} 다시 시도하세요</p>` : ''}
    ${all ? '<p class="note"><b>모두 받았어요.</b> 비행기 모드에서도 들을 수 있어요(암호화된 채로 이 폰에 보관)</p>' : ''}
    ${all ? '' : `<button class="btn" type="button" data-action="audio-dl" ${downloading ? 'disabled' : ''}>${downloading ? '받는 중' : s.failed ? '다시 시도' : '오디오 전체 내려받기'}</button>`}
    ${all ? '' : '<p class="note">와이파이에서 한 번 받아 두면 오프라인으로 들을 수 있어요</p>'}`;
}

async function runDownload() {
  if (downloading || !data) return;
  downloading = true;
  const my = data;
  try {
    await showAudioStatus({ ...(await audioStatus(my)), done: undefined });
    const res = await downloadAll(my, (p) => { if (data === my) showAudioStatus(p); });
    downloading = false;
    if (data === my) showAudioStatus(res);
  } catch {
    downloading = false;
    if (data === my) showAudioStatus({ ...(await audioStatus(my)), failed: 1 });
  }
}

/** 명시적 잠금: 메모리 데이터·키·바우처와 저장 키를 모두 지우고 잠금 화면 */
async function lockApp(reason) {
  locked = true;
  stopAudio(); // 재생 중지·Blob 해제·진행 중 복호화 무효화
  releaseVouchers();
  data = null;
  ix = null;
  openRows.clear();
  forgetKey();
  await clearKey();
  showLock(reason);
}

let booted = false;
function boot(d) {
  data = d;
  ix = index(data);
  locked = false;
  lastRoute = null;
  document.body.classList.remove('locked');
  render();
  if (booted) return;
  booted = true;
  bindViewEvents();
  setupPlayer({ changed: () => { if (!locked && !typing()) render(); } });
  addEventListener('pagehide', releaseVouchers);
  addEventListener('hashchange', () => { if (locked) return; render(); $('view').focus({ preventScroll: true }); if (!location.hash.match(/^#\/bookings\/./)) scrollTo(0, 0); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !typing()) render(); });
  setInterval(() => { if (!typing()) render(); }, 30 * 1000);
}

/** 비밀번호 화면. reason: first | changed */
function showLock(reason) {
  locked = true;
  document.body.classList.add('locked');
  $('appbar-title').textContent = '일정';
  $('appbar-meta').textContent = '';
  const changed = reason === 'changed';
  $('view').innerHTML = `
  <form class="tag lock" data-state="plan" id="lock" novalidate>
    <div class="tag__band"><span>두 사람 전용</span></div>
    <div class="tag__body">
      <h2 class="lock__title">${changed ? '비밀번호가 바뀌었어요' : '비밀번호를 입력하세요'}</h2>
      <p class="note">${changed ? '새 비밀번호를 한 번 입력하면 다시 기억돼요' : '처음 한 번만 입력하면 이 폰에 기억돼요'}</p>
      <label class="field-input">
        <span class="field__label">비밀번호</span>
        <input class="input" id="pw" type="password" name="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" required>
      </label>
      <p class="lock__error" id="pw-error" role="alert"></p>
      <button class="btn" type="submit" id="pw-btn">열기</button>
    </div>
  </form>`;
  const form = $('lock');
  const input = $('pw');
  input.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('pw-btn');
    if (!input.value) { $('pw-error').textContent = '비밀번호를 입력하세요'; return; }
    btn.disabled = true; btn.textContent = '확인 중';
    $('pw-error').textContent = '';
    try {
      const d = await openWithPassword(input.value);
      input.value = '';
      boot(d);
    } catch (err) {
      input.value = '';
      if (err instanceof OpenError && err.kind === 'wrong') { $('pw-error').textContent = err.message; input.focus(); }
      else showError(err);
    } finally {
      btn.disabled = false; btn.textContent = '열기';
    }
  });
}

/** 손상·누락 등 복구 화면. 다시 열기 또는 비밀번호 다시 입력 */
function showError(err) {
  locked = true;
  document.body.classList.add('locked');
  const msg = err instanceof OpenError ? err.message : '일정을 열지 못했어요';
  $('view').innerHTML = `
  <div class="empty">
    <p><b>${esc(msg)}</b></p>
    <p class="note">앱을 다시 열거나, 업데이트 배너가 보이면 눌러 주세요</p>
    <div class="lock__actions">
      <button class="btn" type="button" id="retry">다시 열기</button>
      <button class="btn btn--line" type="button" id="relock">비밀번호 다시 입력</button>
    </div>
  </div>`;
  $('retry').onclick = () => location.reload();
  $('relock').onclick = () => lockApp('first');
}

async function start() {
  setupServiceWorker({ banner: $('update'), button: $('update-btn') });
  try {
    boot(await openWithStoredKey());
  } catch (err) {
    if (err instanceof OpenError && err.kind === 'locked') showLock(err.message);
    else showError(err);
  }
}

start();
