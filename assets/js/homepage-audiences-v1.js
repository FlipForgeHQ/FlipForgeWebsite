/* FlipForge homepage audience selector (v1). Shows one audience at a time inside the same FlipForge framework.
 * Accessible tabs: arrow keys, Home and End move between audiences. Without this script every audience is shown.
 * No external media, no provider calls, no device storage. */
(() => {
  'use strict';
  const root = document.querySelector('[data-ff-aud]');
  if (!root) return;
  const tabs = Array.from(root.querySelectorAll('[data-aud-tab]'));
  const panels = Array.from(root.querySelectorAll('[data-aud-panel]'));
  if (!tabs.length || tabs.length !== panels.length) return;

  function select(index, focus) {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
      panels[i].classList.toggle('ff10-aud-enter', on);
    });
    if (focus) tabs[index].focus();
    // On narrow screens the selector scrolls sideways: keep the chosen audience in view without moving the page.
    const strip = tabs[index].parentElement;
    if (strip.scrollWidth > strip.clientWidth) {
      const left = tabs[index].offsetLeft - strip.offsetLeft;
      if (left < strip.scrollLeft || left + tabs[index].offsetWidth > strip.scrollLeft + strip.clientWidth) {
        strip.scrollTo({left: Math.max(0, left - 20), behavior: 'smooth'});
      }
    }
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i, false));
    tab.addEventListener('keydown', event => {
      const last = tabs.length - 1;
      const next = {ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last}[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(next, true);
    });
  });

  root.classList.add('ff10-aud-ready');
  select(Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true')), false);
})();
