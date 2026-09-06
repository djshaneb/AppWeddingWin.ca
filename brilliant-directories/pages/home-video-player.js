// Homepage SEO 1: replace only the playNiagara script in content_footer_html.
// A ready Vimeo iframe is not necessarily playing, especially in a WebView.
(function () {
  function init() {
    const card = document.querySelector('.ww-nws-video-card');
    const iframe = card && card.querySelector('.ww-nws-video-iframe');
    const button = card && card.querySelector('.ww-nws-play');
    if (!card || !iframe || !button || card.getAttribute('data-ww-video-bound') === '1') return;
    card.setAttribute('data-ww-video-bound', '1');

    const origin = 'https://player.vimeo.com';
    let ready = false;
    let wantsPlay = false;
    let manualPending = false;
    let timer = null;
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function send(method, value) {
      if (!iframe.contentWindow) return;
      const message = { method: method };
      if (value !== undefined) message.value = value;
      iframe.contentWindow.postMessage(message, origin);
    }

    function clearTimer() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    }

    function showPoster(failed) {
      clearTimer();
      wantsPlay = false;
      manualPending = false;
      card.classList.remove('is-loading', 'is-playing', 'is-video-ready');
      if (failed) card.classList.add('is-video-fallback');
      else card.classList.remove('is-video-fallback');
      button.setAttribute('aria-label', 'Play Niagara Wedding Show preview video');
    }

    function showPlaying() {
      clearTimer();
      wantsPlay = false;
      manualPending = false;
      card.classList.remove('is-loading', 'is-video-fallback');
      card.classList.add('is-video-ready', 'is-playing');
    }

    function requestPlay() {
      // Called synchronously from a tap when ready; do not defer it to a promise.
      send('setMuted', true);
      send('play');
    }

    function subscribe() {
      ['play', 'timeupdate', 'pause', 'ended', 'error'].forEach(function (name) {
        send('addEventListener', name);
      });
    }

    function markReady() {
      if (ready) return;
      ready = true;
      subscribe();
      // Keep both poster and Play button visible until actual playback begins.
      if (wantsPlay) requestPlay();
    }

    function loadAndPlay(userInitiated) {
      if (card.classList.contains('is-playing')) return;
      if (card.classList.contains('is-loading') && (!ready || !userInitiated || manualPending)) return;
      let source;
      try {
        source = new URL(iframe.getAttribute('data-src'));
        if (source.origin !== origin || !(new RegExp('^/video/[0-9]+$')).test(source.pathname)) return;
      } catch (_error) { return; }
      wantsPlay = true;
      manualPending = Boolean(userInitiated);
      card.classList.remove('is-video-fallback');
      card.classList.add('is-loading');
      clearTimer();
      timer = window.setTimeout(function () { showPoster(true); }, 6500);
      if (ready) {
        requestPlay();
      } else if (!iframe.getAttribute('src')) {
        iframe.setAttribute('src', source.href);
      } else {
        // The iframe can already be loaded but its ready message was missed.
        send('ping');
      }
    }

    window.addEventListener('message', function (event) {
      if (event.origin !== origin || event.source !== iframe.contentWindow) return;
      let data;
      try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; }
      catch (_error) { return; }
      if (!data || typeof data !== 'object') return;
      if (data.event === 'ready' || data.method === 'ping') {
        markReady();
      } else if (data.event === 'play' ||
                 (data.event === 'timeupdate' && data.data && Number(data.data.seconds) > 0)) {
        showPlaying();
      } else if (data.event === 'pause' || data.event === 'ended') {
        showPoster(false);
      } else if (data.event === 'error' && (!data.data || data.data.method === 'play')) {
        showPoster(true);
      }
    });
    iframe.addEventListener('load', function () {
      subscribe();
      send('ping');
    });
    button.addEventListener('click', function () { loadAndPlay(true); });

    // Retain the existing below-the-fold lazy start. Respect reduced motion:
    // the video loads only after an explicit Play tap for those visitors.
    if (reducedMotion) return;
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            loadAndPlay();
            observer.disconnect();
          }
        });
      }, { rootMargin: '420px 0px 420px 0px', threshold: 0.08 });
      observer.observe(card);
    } else {
      let started = false;
      function onScroll() {
        if (started) return;
        const rect = card.getBoundingClientRect();
        if (rect.top < window.innerHeight + 420 && rect.bottom > -420) {
          started = true;
          loadAndPlay();
          window.removeEventListener('scroll', onScroll);
        }
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
