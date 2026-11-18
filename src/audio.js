// 오디오 가이드: 앱 전체가 공유하는 <audio> 하나 + 아래쪽 재생 막대 + 암호문 캐시(전체 내려받기).
// - 오프라인 보관은 암호문(a/*.bin)만. 재생할 때 메모리에서 풀어 Blob URL로 넣고, 트랙 변경·닫기·잠금 때 해제한다.
// - 캐시 이름은 서비스 워커와 같은 규칙(`trip:<경로>:audio`). 앱 갱신으로 지워지지 않고, 같은 공개 이름이면 다시 받지 않는다.
import { decryptAsset, verifyAsset } from './data.js';
import { formatLength as fmt } from './ui.js';

const audio = () => document.getElementById('audio');
const bar = () => document.getElementById('player');
const audioCache = () => caches.open(`tripcheck:${new URL('./', location.href).pathname}:audio`); // 서비스 워커와 같은 이름 규칙

let queue = [];        // 지금 장소의 트랙들
let place = null;
let index = -1;
let url = null;        // 지금 트랙의 Blob URL
let token = 0;         // 트랙 변경·닫기·잠금 때 증가 → 늦게 끝난 복호화 결과는 버림
let onChange = () => {};

export const nowPlaying = () => (index >= 0 ? { placeId: place?.id, trackId: queue[index]?.id, playing: !audio().paused } : null);

// 저장 실패(공간 부족 등)는 예외로 올린다. 실시간 재생 쪽만 호출부에서 무시한다
const put = (cache, name, bytes) => cache.put(name, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }));

/** 네트워크에서 암호문 받기(HTTP 캐시를 거치지 않음 — 다시 시도할 때 같은 손상 응답을 받지 않게) */
async function fetchCipher(name) {
  const res = await fetch(name, { cache: 'no-store' });
  if (!res.ok) throw new Error(`오디오를 받지 못했어요 (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * 트랙을 풀어 Blob URL로. 캐시 → (인증 실패면 그 항목을 지우고) 네트워크.
 * 네트워크에서 받은 암호문은 AES-GCM 인증(복호화)에 성공한 뒤에만 캐시에 넣는다.
 */
async function trackUrl(t) {
  const cache = await audioCache().catch(() => null);
  const hit = await cache?.match(t.file);
  if (hit) {
    try {
      return await decryptAsset(t.file, new Uint8Array(await hit.arrayBuffer()), typeOf(t));
    } catch (err) {
      if (err?.kind === 'locked') throw err;
      await cache.delete(t.file); // 손상된 캐시 항목 → 지우고 다시 받기
    }
  }
  const bytes = await fetchCipher(t.file);
  const url = await decryptAsset(t.file, bytes, typeOf(t)); // 인증 실패면 여기서 예외 → 캐시에 넣지 않음
  if (cache) await put(cache, t.file, bytes).catch(() => {}); // 재생은 저장 실패와 무관하게 계속(다음에 다시 받음)
  return url;
}

/** 원본 형식(빌드가 확장자로 기록). 없으면 MP3로 가정 */
const typeOf = (t) => t.type ?? 'audio/mpeg';

function releaseUrl() {
  if (url) URL.revokeObjectURL(url);
  url = null;
}

async function load(i, autoplay = true) {
  const t = queue[i];
  if (!t?.file) return;
  const my = ++token;
  index = i;
  renderBar('loading');
  try {
    const next = await trackUrl(t);
    if (my !== token) { URL.revokeObjectURL(next); return; } // 그사이 다른 트랙·닫기·잠금
    const el = audio();
    el.src = next;
    releaseUrl();
    url = next;
    setMeta(t);
    if (autoplay) await el.play().catch(() => {}); // 자동 재생이 막히면 재생 버튼으로
    renderBar();
  } catch (err) {
    if (my !== token) return;
    renderBar('error', err.message ?? '재생하지 못했어요');
  }
}

/** 장소의 트랙 재생 시작 */
export function playPlace(p, trackIndex = 0) {
  place = p;
  queue = p.tracks.filter((t) => t.file);
  return load(Math.min(trackIndex, queue.length - 1));
}

export const next = () => (index < queue.length - 1 ? load(index + 1) : undefined);
export const prev = () => {
  const el = audio();
  if (el.currentTime > 3 || index === 0) { el.currentTime = 0; return undefined; }
  return load(index - 1);
};
export function toggle() {
  const el = audio();
  if (!el.src) return;
  if (el.paused) el.play().catch(() => {}); else el.pause();
}

/** 재생 막대 닫기·잠금: 재생 중지, Blob 해제, 진행 중 작업 무효화 */
export function stop() {
  token++;
  const el = audio();
  el.pause();
  el.removeAttribute('src');
  el.load();
  releaseUrl();
  queue = []; place = null; index = -1;
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = null;
    try { navigator.mediaSession.playbackState = 'none'; } catch { /* 일부 브라우저 미지원 */ }
  }
  renderBar();
}

// ── Media Session(잠금화면·이어폰 조작). 지원하지 않는 동작은 건너뛴다 ──
function setMeta(t) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: place?.title ?? '', album: '여행 오디오 가이드' });
  } catch { /* MediaMetadata 미지원 */ }
}
function bindMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const set = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch { /* 미지원 동작 */ } };
  set('play', () => audio().play().catch(() => {}));
  set('pause', () => audio().pause());
  set('previoustrack', () => prev());
  set('nexttrack', () => next());
  set('seekto', (d) => { if (Number.isFinite(d.seekTime)) audio().currentTime = d.seekTime; });
  set('seekbackward', (d) => { audio().currentTime = Math.max(0, audio().currentTime - (d.seekOffset || 10)); });
  set('seekforward', (d) => { audio().currentTime = Math.min(audio().duration || 0, audio().currentTime + (d.seekOffset || 10)); });
}
function syncPosition() {
  const el = audio();
  if (!('mediaSession' in navigator) || !Number.isFinite(el.duration)) return;
  try {
    navigator.mediaSession.playbackState = el.paused ? 'paused' : 'playing';
    navigator.mediaSession.setPositionState?.({ duration: el.duration, position: Math.min(el.currentTime, el.duration), playbackRate: el.playbackRate || 1 });
  } catch { /* 위치 정보 미지원 */ }
}

// ── 재생 막대 ──
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ico = (id) => `<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;

function renderBar(state = null, message = '') {
  const el = audio();
  const b = bar();
  const t = queue[index];
  document.body.classList.toggle('has-player', !!t);
  if (!t) { b.hidden = true; b.innerHTML = ''; onChange(); return; }
  b.hidden = false;
  const playing = !el.paused;
  b.innerHTML = `
    <div class="player__info">
      <p class="player__title">${esc(t.title)}</p>
      <p class="player__sub">${state === 'loading' ? '여는 중' : state === 'error' ? `<span class="lock__error">${esc(message)}</span>` : `${esc(place?.title ?? '')} · ${index + 1}/${queue.length}${t.locationHint ? ` · ${esc(t.locationHint)}` : ''}`}</p>
    </div>
    <div class="player__seek">
      <span class="player__time" id="p-cur">${fmt(el.currentTime)}</span>
      <input type="range" id="p-seek" min="0" max="${Number.isFinite(el.duration) ? el.duration : 0}" step="0.1" value="${el.currentTime || 0}" aria-label="재생 위치" ${Number.isFinite(el.duration) ? '' : 'disabled'}>
      <span class="player__time" id="p-dur">${fmt(el.duration)}</span>
    </div>
    <div class="player__ctrls">
      <button class="player__btn" type="button" data-p="prev" aria-label="이전 트랙">${ico('prev')}</button>
      ${state === 'error'
        ? `<button class="player__btn player__btn--main" type="button" data-p="retry" aria-label="다시 시도">${ico('retry')}</button>`
        : `<button class="player__btn player__btn--main" type="button" data-p="toggle" aria-label="${playing ? '일시정지' : '재생'}" ${state === 'loading' ? 'disabled' : ''}>${ico(playing ? 'pause' : 'play')}</button>`}
      <button class="player__btn" type="button" data-p="next" aria-label="다음 트랙" ${index >= queue.length - 1 ? 'disabled' : ''}>${ico('next')}</button>
      <button class="player__btn" type="button" data-p="close" aria-label="재생 막대 닫기">${ico('close')}</button>
    </div>`;
  onChange();
}

function tick() {
  const el = audio();
  const cur = document.getElementById('p-cur');
  const seek = document.getElementById('p-seek');
  if (cur) cur.textContent = fmt(el.currentTime);
  if (seek && document.activeElement !== seek) { seek.max = Number.isFinite(el.duration) ? el.duration : 0; seek.value = el.currentTime; seek.disabled = !Number.isFinite(el.duration); }
  const dur = document.getElementById('p-dur');
  if (dur) dur.textContent = fmt(el.duration);
}

/** 한 번만: 공유 오디오 요소·막대 이벤트 연결. changed: 막대 상태가 바뀔 때(화면 목록의 재생 표시 갱신용) */
export function setupPlayer({ changed } = {}) {
  onChange = changed ?? onChange;
  const el = audio();
  el.addEventListener('timeupdate', () => { tick(); syncPosition(); });
  el.addEventListener('loadedmetadata', () => { tick(); syncPosition(); });
  el.addEventListener('play', () => { renderBar(); syncPosition(); });
  el.addEventListener('pause', () => { renderBar(); syncPosition(); });
  el.addEventListener('ended', () => { if (index < queue.length - 1) load(index + 1); else renderBar(); });
  bar().addEventListener('click', (e) => {
    const a = e.target.closest('[data-p]')?.dataset.p;
    if (a === 'toggle') toggle();
    if (a === 'prev') prev();
    if (a === 'next') next();
    if (a === 'close') stop();
    if (a === 'retry') load(index);
  });
  bar().addEventListener('input', (e) => { if (e.target.id === 'p-seek') el.currentTime = Number(e.target.value); });
  bindMediaSession();
}

// ── 전체 내려받기 ──
/** 트랙 목록에서 받을 것·받은 것 계산 */
export async function audioStatus(data) {
  const tracks = data.audio.places.flatMap((p) => p.tracks).filter((t) => t.file);
  const cache = await audioCache().catch(() => null);
  let have = 0, haveBytes = 0, total = 0;
  for (const t of tracks) {
    total += t.bytes ?? 0;
    if (await cache?.match(t.file)) { have++; haveBytes += t.bytes ?? 0; }
  }
  return { count: tracks.length, have, total, haveBytes };
}

/**
 * 받지 않은 트랙만 받는다(공개 이름이 같으면 이미 받은 것으로 침). 끝나면 지금 데이터에 없는 옛 트랙은 지운다.
 * progress({ done, count, bytes, total, failed })
 */
export async function downloadAll(data, progress = () => {}) {
  const tracks = data.audio.places.flatMap((p) => p.tracks).filter((t) => t.file);
  const cache = await audioCache();
  const total = tracks.reduce((s, t) => s + (t.bytes ?? 0), 0);
  let done = 0, bytes = 0, failed = 0, noSpace = 0;
  for (const t of tracks) {
    // 이미 있는 항목도 인증해 본다(손상된 옛 항목은 지우고 다시 받음)
    const hit = await cache.match(t.file);
    if (hit && await verifyAsset(t.file, new Uint8Array(await hit.arrayBuffer()))) {
      done++; bytes += t.bytes ?? 0; progress({ done, count: tracks.length, bytes, total, failed }); continue;
    }
    if (hit) await cache.delete(t.file);
    try {
      const buf = await fetchCipher(t.file);
      if (!(await verifyAsset(t.file, buf))) throw new Error('인증 실패'); // 인증된 암호문만 보관
      await put(cache, t.file, buf); // 저장 실패도 실패로 센다(아래 catch) — 완료는 저장 성공 뒤에만
      done++; bytes += buf.byteLength;
    } catch (err) {
      failed++;
      if (err?.name === 'QuotaExceededError') noSpace++;
    }
    progress({ done, count: tracks.length, bytes, total, failed, noSpace });
  }
  if (!failed) { // 정리: 지금 데이터가 쓰지 않는 옛 트랙
    const keep = new Set(tracks.map((t) => new URL(t.file, location.href).href));
    for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
  }
  return { done, count: tracks.length, bytes, total, failed, noSpace };
}
