(() => {
  // Keep navigation and game/search actions on this site, except when the user opens a search result.
  const notice = document.createElement('div');
  notice.className = 'site-stay-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  document.body.append(notice);
  let noticeTimer;

  function showNotice() {
    notice.textContent = 'Search results stay here. External pages are not opened.';
    notice.classList.add('visible');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.remove('visible'), 3500);
  }

  // Block legacy scripts that open Google in a new tab.
  window.open = () => { showNotice(); return null; };

  // Allow external search-result links, but keep blocking other external links.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    if (link.closest('.search-result')) return;
    let destination;
    try { destination = new URL(link.href, window.location.href); } catch (_) { return; }
    if (destination.origin !== window.location.origin) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showNotice();
    }
  }, true);

  const searchDescription = document.querySelector('#web .section-heading .muted');
  if (searchDescription) searchDescription.textContent = 'Search here for DuckDuckGo results, with a Wikipedia fallback if DuckDuckGo is unavailable. Open a result to visit its site.';
})();
