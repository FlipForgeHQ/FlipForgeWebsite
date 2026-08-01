(() => {
  const headerOffset = () => {
    const header = document.querySelector('.site-header');
    return header ? Math.ceil(header.getBoundingClientRect().height) + 18 : 18;
  };

  const targetForHash = (hash) => {
    if (!hash || hash === '#') return null;
    try {
      return document.getElementById(decodeURIComponent(hash.slice(1)));
    } catch {
      return null;
    }
  };

  const alignToHash = (hash, behavior = 'auto') => {
    const target = targetForHash(hash);
    if (!target) return false;

    const top = Math.max(
      0,
      target.getBoundingClientRect().top + window.scrollY - headerOffset(),
    );

    window.scrollTo({ top, behavior });
    return true;
  };

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;

    const hash = link.getAttribute('href');
    if (!targetForHash(hash)) return;

    event.preventDefault();
    history.pushState(null, '', hash);
    requestAnimationFrame(() => alignToHash(hash, 'smooth'));
  });

  window.addEventListener('hashchange', () => {
    requestAnimationFrame(() => alignToHash(window.location.hash, 'smooth'));
  });

  const realignInitialHash = () => {
    if (!window.location.hash) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => alignToHash(window.location.hash, 'auto'));
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', realignInitialHash, { once: true });
  } else {
    realignInitialHash();
  }

  window.addEventListener('load', () => {
    if (!window.location.hash) return;
    setTimeout(() => alignToHash(window.location.hash, 'auto'), 75);
  }, { once: true });
})();
