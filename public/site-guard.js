(() => {
  // Prevent legacy Google links/popups and search-result links from navigating away.
  const notice = document.createElement('div');
  notice.className = 'site-stay-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  document.body.append(notice);
  let noticeTimer;

  function showNotice() {
    notice.textContent = 'You are staying on this site. Search results show previews here; external pages are not opened.';
    notice.classList.add('visible');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.remove('visible'), 3500);
  }

  // Block old scripts that try to open Google in a new tab.
  window.open = () => { showNotice(); return null; };

  // Capture before the browser follows any link, including links added later by scripts.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    let destination;
    try { destination = new URL(link.href, window.location.href); } catch (_) { return; }
    if (destination.origin !== window.location.origin) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showNotice();
    }
  }, true);

  // Make same-site behavior explicit for the web search section.
  const description = document.querySelector('#web .section-heading .muted');
  if (description) description.textContent = 'Search DuckDuckGo and read result previews here. External pages are not opened.';
})();
