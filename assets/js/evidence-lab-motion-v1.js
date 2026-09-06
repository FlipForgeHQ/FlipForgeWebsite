/* FlipForge Evidence Lab guided motion v1 */
(() => {
  const directory = document.querySelector('.ff-lab-directory');
  const sections = [...document.querySelectorAll('.ff-lab-section[id]')];
  if (!directory || !sections.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const links = [...directory.querySelectorAll('a[href^="#"]')];
  const linkById = new Map(links.map((link) => [link.getAttribute('href').slice(1), link]));

  document.body.classList.add('ff-lab-motion-ready');

  document.querySelectorAll('.ff-lab-grid, .ff-lab-proof, .ff-lab-case').forEach((group) => {
    [...group.children].forEach((child, index) => child.style.setProperty('--ff-lab-i', index));
  });

  const setActive = (id) => {
    links.forEach((link) => {
      if (linkById.get(id) === link) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
  };

  if (!reduceMotion) {
    links.forEach((link) => {
      link.addEventListener('click', (event) => {
        const target = document.querySelector(link.getAttribute('href'));
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', link.getAttribute('href'));
      });
    });
  }

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('is-visible');
    });
  }, { threshold: 0.16, rootMargin: '0px 0px -10% 0px' });

  sections.forEach((section) => revealObserver.observe(section));

  const activeObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    if (visible[0]) setActive(visible[0].target.id);
  }, { threshold: [0.2, 0.35, 0.55, 0.75], rootMargin: '-24% 0px -52% 0px' });

  sections.forEach((section) => activeObserver.observe(section));

  const initialId = location.hash.slice(1);
  if (initialId && linkById.has(initialId)) setActive(initialId);
  else setActive(sections[0].id);
})();
