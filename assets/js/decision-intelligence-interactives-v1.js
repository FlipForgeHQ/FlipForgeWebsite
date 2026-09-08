(() => {
  "use strict";

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const state = { choice: null, changed: null, evidenceDone: false, identityDone: false, decisionDone: false };
  const timers = new Set();
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const delay = (fn, ms) => {
    const id = window.setTimeout(() => { timers.delete(id); fn(); }, reduceMotion ? 0 : ms);
    timers.add(id);
    return id;
  };
  const emit = (event, placement = "decision-intelligence") => {
    window.dispatchEvent(new CustomEvent("flipforge:conversion", { detail: { event, placement } }));
  };
  const transition = update => {
    if (!reduceMotion && document.startViewTransition) return document.startViewTransition(update);
    update();
    return null;
  };
  const scrollToStage = id => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };
  const pulse = (element, keyframes) => {
    if (!element || reduceMotion || !element.animate) return;
    element.animate(keyframes, { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)" });
  };

  function initRail() {
    const stages = qa("[data-world-stage]");
    const links = qa("[data-world-rail]");
    if (!stages.length || !links.length) return;
    const setCurrent = name => links.forEach(link => {
      if (link.dataset.worldRail === name) link.setAttribute("aria-current", "step");
      else link.removeAttribute("aria-current");
    });
    if (!window.IntersectionObserver) return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.dataset?.worldStage) setCurrent(visible.target.dataset.worldStage);
    }, { threshold: [0.3, 0.5, 0.72] });
    stages.forEach(stage => observer.observe(stage));
  }

  function initEntry() {
    const choices = qa("[data-world-choice]");
    const result = q("[data-world-choice-result]");
    const enter = q("[data-world-enter]");
    const original = q("[data-world-original-call]");
    const rethinkChoice = q("[data-world-rethink-choice]");
    const finaleChoice = q("[data-world-finale-choice]");
    if (!choices.length || !enter) return;

    choices.forEach(button => button.addEventListener("click", () => {
      const choice = button.dataset.worldChoice;
      state.choice = choice;
      transition(() => {
        choices.forEach(candidate => candidate.setAttribute("aria-pressed", String(candidate === button)));
        result.innerHTML = `You chose <strong>${choice}</strong>. FlipForge hasn’t decided yet.`;
        enter.hidden = false;
        original.textContent = choice;
        rethinkChoice.textContent = choice;
        finaleChoice.textContent = choice;
      });
      emit("di_choice_recorded", `choice-${choice.toLowerCase()}`);
      pulse(button, [{ transform:"scale(1)" }, { transform:"scale(1.025)" }, { transform:"scale(1)" }]);
    }));

    enter.addEventListener("click", () => {
      if (!state.choice) return;
      emit("di_world_entered", "entry");
      document.body.dataset.ffWorldEntered = "true";
      scrollToStage("evidence");
      delay(() => runEvidence(true), reduceMotion ? 0 : 520);
    });
  }

  const evidenceRoot = q("#evidence");
  const evidenceButton = q("[data-world-evidence-run]");
  const evidenceConsole = q("#world-evidence-results");
  const evidenceRows = qa("[data-world-comp]");
  const evidenceCount = q("[data-world-evidence-count]");
  const valueShift = q("[data-world-value-shift]");
  const evidenceVerdict = q("[data-world-evidence-verdict]");
  const rethink = q("[data-world-rethink]");

  function resetEvidence() {
    state.evidenceDone = false;
    evidenceRows.forEach(row => { row.removeAttribute("data-state"); q("em", row).textContent = ""; });
    evidenceCount.textContent = "7 IN REVIEW";
    q("div:first-child strong", valueShift).textContent = "24.0%";
    q("div:last-child strong", valueShift).textContent = "—";
    evidenceVerdict.removeAttribute("data-state");
    q("strong", evidenceVerdict).textContent = "WAITING";
    q("p", evidenceVerdict).textContent = "Qualified evidence gets the final vote.";
    evidenceButton.textContent = "Inspect the 7 comps";
    evidenceButton.removeAttribute("disabled");
    evidenceConsole.setAttribute("aria-busy", "false");
    rethink.hidden = true;
  }

  function runEvidence(fromEntry = false) {
    if (!evidenceButton || state.evidenceDone) {
      if (state.evidenceDone && !fromEntry) { resetEvidence(); delay(() => runEvidence(false), 120); }
      return;
    }
    emit("di_evidence_started", "world-evidence");
    evidenceConsole.setAttribute("aria-busy", "true");
    evidenceButton.setAttribute("disabled", "");
    evidenceButton.textContent = "Testing evidence…";
    evidenceRows.forEach(row => { row.removeAttribute("data-state"); q("em", row).textContent = ""; });

    const rejected = evidenceRows.filter(row => row.dataset.worldComp === "reject");
    const accepted = evidenceRows.filter(row => row.dataset.worldComp === "accept");
    rejected.forEach((row, index) => delay(() => {
      row.dataset.state = "reject";
      q("em", row).textContent = row.dataset.reason;
      evidenceCount.textContent = `${6-index} IN REVIEW`;
      pulse(row, [{ transform:"translateX(0)" }, { transform:"translateX(10px)" }]);
    }, 120 + index * 150));
    accepted.forEach((row, index) => delay(() => {
      row.dataset.state = "accept";
      q("em", row).textContent = row.dataset.reason;
      pulse(row, [{ boxShadow:"0 0 0 rgba(212,175,55,0)" }, { boxShadow:"0 0 22px rgba(212,175,55,.13)" }, { boxShadow:"0 0 0 rgba(212,175,55,0)" }]);
    }, 930 + index * 150));

    delay(() => { evidenceCount.textContent = "2 EXACT SURVIVE"; }, 1180);
    delay(() => {
      transition(() => {
        q("div:first-child strong", valueShift).innerHTML = "<s>24.0%</s>";
        q("div:last-child strong", valueShift).textContent = "2.3%";
      });
      pulse(valueShift, [{ opacity:.65 }, { opacity:1 }]);
    }, 1380);
    delay(() => {
      evidenceVerdict.dataset.state = "done";
      q("strong", evidenceVerdict).textContent = "VERIFY";
      q("p", evidenceVerdict).textContent = "The evidence changed the decision.";
      evidenceConsole.setAttribute("aria-busy", "false");
      evidenceButton.removeAttribute("disabled");
      evidenceButton.textContent = "Replay the evidence";
      state.evidenceDone = true;
      rethink.hidden = false;
      emit("di_evidence_completed", "world-evidence");
      pulse(evidenceVerdict, [{ transform:"translateY(5px)", opacity:.5 }, { transform:"translateY(0)", opacity:1 }]);
    }, 1720);
  }

  function initEvidence() {
    if (!evidenceRoot || !evidenceButton) return;
    evidenceButton.addEventListener("click", () => runEvidence(false));
    qa("[data-world-rethink]").forEach(button => button.addEventListener("click", () => {
      const answer = button.dataset.worldRethink;
      state.changed = answer === "change";
      const result = q("[data-world-rethink-result]");
      if (state.changed) {
        result.innerHTML = "<strong>The evidence changed your decision.</strong> That is the point.";
        emit("di_decision_changed", "world-evidence");
      } else {
        result.textContent = "You kept your call — with more evidence in front of you.";
        emit("di_decision_kept", "world-evidence");
      }
      qa("[data-world-rethink]").forEach(candidate => candidate.setAttribute("aria-pressed", String(candidate === button)));
    }));
  }

  function initIdentity() {
    const button = q("[data-world-identity-run]");
    const consoleEl = q("#world-identity-results");
    const checks = qa("[data-world-check]");
    const base = q('[data-world-card="base"]');
    const silver = q('[data-world-card="silver"]');
    const result = q("[data-world-identity-result]");
    const next = q('[data-world-next="decision"]');
    if (!button || !consoleEl) return;

    const reset = () => {
      state.identityDone = false;
      checks.forEach(check => { check.removeAttribute("data-state"); q("b", check).textContent = "—"; });
      base.removeAttribute("data-state"); silver.removeAttribute("data-state");
      result.textContent = "Run the identity check before the price gets influence.";
      button.textContent = "Check the card";
      consoleEl.setAttribute("aria-busy", "false");
      next.hidden = true;
    };

    button.addEventListener("click", () => {
      if (state.identityDone) { reset(); return; }
      emit("di_identity_started", "world-identity");
      consoleEl.setAttribute("aria-busy", "true");
      button.setAttribute("disabled", "");
      button.textContent = "Checking identity…";
      checks.forEach((check, index) => delay(() => {
        const fail = check.dataset.worldCheck === "fail";
        check.dataset.state = fail ? "fail" : "pass";
        q("b", check).textContent = fail ? "BASE ≠ SILVER" : "MATCH";
        if (fail) {
          base.dataset.state = "disconnect";
          silver.dataset.state = "target";
          pulse(base, [{ transform:"translateX(0)", opacity:1 }, { transform:"translateX(-16px)", opacity:.25 }]);
        }
      }, 80 + index * 165));
      delay(() => {
        result.innerHTML = "<strong>SAME PLAYER. SAME SET. SAME NUMBER.</strong><br><b>NOT THE SAME MARKET.</b><br>Exact card confirmed: Silver Prizm · PSA 10.";
        consoleEl.setAttribute("aria-busy", "false");
        button.removeAttribute("disabled");
        button.textContent = "Replay identity check";
        state.identityDone = true;
        next.hidden = false;
        emit("di_identity_completed", "world-identity");
      }, 980);
    });
  }

  function initDecision() {
    const button = q("[data-world-decision-run]");
    const consoleEl = q("#world-decision-results");
    const deal = q(".ff-world-deal-card p");
    const naive = q("[data-world-naive-buy]");
    const risks = qa("[data-world-risk]");
    const final = q("[data-world-final]");
    const finale = q("#world-finale");
    const finaleCopy = q("[data-world-finale-copy]");
    if (!button || !consoleEl || !finale) return;

    const reset = () => {
      state.decisionDone = false;
      deal.removeAttribute("data-state");
      naive.textContent = "LOOKS LIKE BUY";
      risks.forEach(risk => risk.removeAttribute("data-state"));
      final.removeAttribute("data-state");
      q("strong", final).textContent = "WAITING";
      q("p", final).textContent = "Price is only one input.";
      consoleEl.setAttribute("aria-busy", "false");
      button.textContent = "Challenge the deal";
      finale.hidden = true;
    };

    button.addEventListener("click", () => {
      if (state.decisionDone) { scrollToStage("world-finale"); return; }
      emit("di_challenge_started", "world-decision");
      consoleEl.setAttribute("aria-busy", "true");
      button.setAttribute("disabled", "");
      button.textContent = "Challenging the deal…";
      delay(() => { deal.dataset.state = "challenged"; naive.textContent = "BUY ASSUMPTION CHALLENGED"; }, 100);
      risks.forEach((risk,index) => delay(() => { risk.dataset.state = "on"; }, 260 + index * 210));
      delay(() => {
        final.dataset.state = "done";
        q("strong", final).textContent = "VERIFY";
        q("p", final).textContent = "Cheap isn’t enough.";
        consoleEl.setAttribute("aria-busy", "false");
        button.removeAttribute("disabled");
        button.textContent = "See what changed";
        state.decisionDone = true;
        finale.hidden = false;
        if (state.choice) {
          const ending = state.changed === true ? "You changed your first call after the evidence changed." : "You saw the same price through a stronger evidence lens.";
          finaleCopy.textContent = `${ending} FlipForge tests whether the evidence deserves your confidence before the decision stands.`;
        }
        emit("di_challenge_completed", "world-decision");
        emit("di_world_completed", "finale");
        pulse(final, [{ transform:"translateY(6px)", opacity:.5 }, { transform:"translateY(0)", opacity:1 }]);
      }, 1120);
    });
  }

  function initNextButtons() {
    qa("[data-world-next]").forEach(button => button.addEventListener("click", () => scrollToStage(button.dataset.worldNext)));
  }

  initRail();
  initEntry();
  initEvidence();
  initIdentity();
  initDecision();
  initNextButtons();
})();
