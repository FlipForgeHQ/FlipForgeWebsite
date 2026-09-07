(() => {
  "use strict";

  const demo = document.querySelector("[data-ff-dic-demo]");
  if (!demo) return;

  const big = demo.querySelector("[data-ff-dic-big]");
  const label = demo.querySelector("[data-ff-dic-label]");
  const copy = demo.querySelector("[data-ff-dic-copy]");
  const from = demo.querySelector("[data-ff-dic-from]");
  const to = demo.querySelector("[data-ff-dic-to]");
  const status = demo.querySelector("[data-ff-dic-status]");
  const steps = [...demo.querySelectorAll("[data-ff-dic-step]")];
  const replay = demo.querySelector("[data-ff-dic-replay]");
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

  const states = [
    {
      big:"24%",
      tone:"warm",
      label:"apparent discount",
      copy:"The listing looks cheap. FlipForge does not treat the headline discount as proof.",
      from:"24% apparent",
      to:"checking",
      status:"Looks like a deal"
    },
    {
      big:"5 / 7",
      tone:"gold",
      label:"comparisons rejected",
      copy:"Wrong grade, parallel, duplicate or identity-mismatched comparisons lose influence.",
      from:"7 found",
      to:"2 usable",
      status:"Evidence filtered"
    },
    {
      big:"2.3%",
      tone:"good",
      label:"supported edge",
      copy:"Once weak comparisons are removed, most of the apparent bargain disappears.",
      from:"24% apparent",
      to:"2.3% supported",
      status:"Value reassessed"
    },
    {
      big:"VERIFY",
      tone:"gold",
      label:"FlipForge decision",
      copy:"The remaining margin is thin and the evidence base is limited. Verify before spending.",
      from:"Looks cheap",
      to:"Evidence says verify",
      status:"Decision ready"
    }
  ];

  let current = 0;
  let timer = null;

  function apply(index, announce = true) {
    current = Math.max(0, Math.min(states.length - 1, index));
    const state = states[current];
    if (big) {
      big.textContent = state.big;
      big.dataset.tone = state.tone;
    }
    if (label) label.textContent = state.label;
    if (copy) copy.textContent = state.copy;
    if (from) from.textContent = state.from;
    if (to) to.textContent = state.to;
    if (status && announce) status.textContent = state.status;
    steps.forEach((step, stepIndex) => {
      if (stepIndex === current) step.setAttribute("aria-current","step");
      else step.removeAttribute("aria-current");
    });
  }

  function stop() {
    window.clearTimeout(timer);
    timer = null;
  }

  function playFrom(index = 0) {
    stop();
    apply(index, false);
    if (reduceMotion) {
      apply(states.length - 1, false);
      return;
    }
    const advance = () => {
      if (current >= states.length - 1) return;
      timer = window.setTimeout(() => {
        apply(current + 1, false);
        advance();
      }, current === 0 ? 2200 : 2000);
    };
    advance();
  }

  steps.forEach((step, index) => {
    step.addEventListener("click", () => {
      stop();
      apply(index);
    });
  });

  replay?.addEventListener("click", () => playFrom(0));

  playFrom(0);
})();
