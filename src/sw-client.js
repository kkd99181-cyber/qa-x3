// 서비스 워커 등록과 업데이트 배너. 업데이트 실패·오프라인이면 조용히 기존 버전으로 계속 동작한다.
export function setupServiceWorker({ banner, button }) {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  const show = (reg) => {
    if (!reg.waiting || !navigator.serviceWorker.controller) return;
    banner.hidden = false;
    button.onclick = () => { button.disabled = true; reg.waiting?.postMessage('SKIP_WAITING'); };
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    show(reg);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') show(reg); });
    });
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
}
