/* FlipForge homepage Decision Challenge (v1). A fictional listing, the visitor's call, then the investigation one
 * finding at a time, the FlipForge decision and how it compares with the call. Same illustrative numbers as the
 * price demo below it. No external media, no provider calls, no device storage. */
(() => {
  'use strict';
  const root = document.querySelector('[data-ff-challenge]');
  if (!root) return;
  const step = name => root.querySelector(`[data-chal-step="${name}"]`);
  const choices = Array.from(root.querySelectorAll('[data-chal-choice]'));
  const findings = Array.from(root.querySelectorAll('[data-chal-finding]'));
  const next = root.querySelector('[data-chal-next]');
  const progress = root.querySelector('[data-chal-progress]');
  const reveal = root.querySelector('[data-chal-reveal]');
  const restart = root.querySelector('[data-chal-restart]');
  const change = root.querySelector('[data-chal-change]');
  const track = (event, placement) => document.dispatchEvent(new CustomEvent('ff:conversion', {detail: {event, placement}}));

  const REVEALS = {
    buy: 'You chose to buy. The listing looked $355 under its comp, but that comp was a different grade. The evidence supports about $500, and at $425 you would be $65 over what keeps your margin.',
    investigate: 'You chose to investigate first. That instinct is the point: a $355 “discount” became a PASS once the evidence was checked.',
    pass: 'You chose to pass. FlipForge agrees, and now you can see why: $65 above Max Buy, on thin evidence.'
  };
  const AFTER = ' At $335 or less, the same card and evidence would be a BUY. Try it below.';
  let shown = 0;
  let choice = '';

  function show(el) {
    el.hidden = false;
    el.classList.remove('ff10-chal-in');
    void el.offsetWidth; // restart the entrance animation
    el.classList.add('ff10-chal-in');
  }

  function reset() {
    shown = 0;
    choice = '';
    choices.forEach(button => { button.disabled = false; button.setAttribute('aria-pressed', 'false'); });
    ['investigate', 'decision', 'reveal'].forEach(name => { step(name).hidden = true; });
    findings.forEach(item => { item.hidden = true; });
    next.hidden = false;
  }

  function nextFinding() {
    if (shown < findings.length) {
      show(findings[shown]);
      shown++;
      progress.textContent = `${shown} of ${findings.length} findings`;
      next.textContent = shown < findings.length ? 'Next finding' : 'See the FlipForge decision';
      return;
    }
    next.hidden = true;
    progress.textContent = '';
    show(step('decision'));
    reveal.textContent = REVEALS[choice] + AFTER;
    show(step('reveal'));
    track('challenge_completed', `challenge-${choice}`);
  }

  choices.forEach(button => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      if (choice) return;
      choice = button.dataset.chalChoice;
      choices.forEach(other => { other.disabled = true; other.setAttribute('aria-pressed', other === button ? 'true' : 'false'); });
      show(step('investigate'));
      nextFinding();
      next.focus({preventScroll: true});
      track('challenge_answered', `challenge-${choice}`);
    });
  });
  next.addEventListener('click', nextFinding);
  restart.addEventListener('click', () => { reset(); choices[0].focus(); });
  change.addEventListener('click', () => track('demo_interacted', 'challenge'));

  const slider = document.querySelector('[data-ffdemo] [data-asking]');
  if (slider) slider.addEventListener('input', () => track('demo_interacted', 'demo'), {once: true});

  root.classList.add('ff10-chal-ready');
  reset();
})();
