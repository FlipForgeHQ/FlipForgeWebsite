/* FlipForge homepage "Inside the app" (v1). Shows one real app screen at a time: Discover, Evaluate, Decision Receipt.
 * Accessible tabs: arrow keys, Home and End move between screens. Without this script every screen is shown.
 * No external media, no provider calls, no device storage. */
(() => {
  'use strict';
  const root = document.querySelector('[data-ff-app]');
  if (!root) return;
  const tabs = Array.from(root.querySelectorAll('[data-app-tab]'));
  const panels = Array.from(root.querySelectorAll('[data-app-panel]'));
  if (!tabs.length || tabs.length !== panels.length) return;

  function select(index, focus) {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
      panels[i].classList.toggle('ff10-app-enter', on);
    });
    const screen = panels[index].querySelector('.ff10-app-window');
    if (screen) screen.scrollTop = 0;
    if (focus) tabs[index].focus();
  }

  const track = placement => document.dispatchEvent(new CustomEvent('ff:conversion', {detail: {event: 'app_screen_viewed', placement}}));

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      select(i, false);
      track(`app-${tab.dataset.appTab}`);
    });
    tab.addEventListener('keydown', event => {
      const last = tabs.length - 1;
      const next = {ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last}[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(next, true);
      track(`app-${tabs[next].dataset.appTab}`);
    });
  });

  root.classList.add('ff10-app-ready');
  select(Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true')), false);
})();
