// On every page, first script after the stylesheet: sets up the offline copy.
(function () {
  if (!('serviceWorker' in navigator)) return;
  const base = new URL('..', document.currentScript.src);
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname })
      .catch(e => console.warn('The offline copy could not be set up:', e.message));
  });
})();
