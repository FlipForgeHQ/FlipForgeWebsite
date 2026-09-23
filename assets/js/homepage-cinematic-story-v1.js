/* FlipForge Cinematic Homepage Visual System v1 */
(() => {
  "use strict";

  const root = document.querySelector("[data-ff-cinematic-story]");
  if (!root) return;

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const panels = [...root.querySelectorAll("[data-ff-cinema-panel]")];

  const activate = panel => {
    panels.forEach(item => item.classList.toggle("is-active", item === panel));
    const step = String(panel?.dataset.ffCinemaPanel || "");
    if (step) root.dataset.activeStep = step;
  };

  if (reduced || typeof IntersectionObserver !== "function") {
    panels.forEach(panel => panel.classList.add("is-active"));
  } else {
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) activate(visible.target);
    }, {
      threshold: [0.2, 0.38, 0.55, 0.72],
      rootMargin: "-18% 0px -24% 0px"
    });
    panels.forEach(panel => observer.observe(panel));
  }

  const receipt = root.querySelector("[data-ff-cinema-receipt]");
  const layers = [...root.querySelectorAll("[data-ff-cinema-layer]")];
  if (receipt && layers.length) {
    const setLayer = layer => {
      const key = layer.dataset.ffCinemaLayer || "";
      receipt.dataset.activeLayer = key;
      layers.forEach(item => {
        const selected = item === layer;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    };

    layers.forEach(layer => {
      layer.setAttribute("role", "button");
      layer.setAttribute("tabindex", "0");
      layer.setAttribute("aria-pressed", "false");
      layer.addEventListener("click", () => setLayer(layer));
      layer.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setLayer(layer);
      });
    });
  }

  if (!reduced && window.matchMedia?.("(pointer:fine)")?.matches) {
    root.querySelectorAll(".ff-cinema-visual").forEach(stage => {
      let raf = 0;
      const reset = () => {
        stage.style.setProperty("--ff-cinema-x", "0");
        stage.style.setProperty("--ff-cinema-y", "0");
      };
      stage.addEventListener("pointermove", event => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const rect = stage.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
          const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
          stage.style.setProperty("--ff-cinema-x", x.toFixed(3));
          stage.style.setProperty("--ff-cinema-y", y.toFixed(3));
        });
      });
      stage.addEventListener("pointerleave", reset);
    });
  }


  const hero = document.querySelector("[data-ff-cinema-hero]");
  if (hero) {
    const heroStates = [
      { key: "identity", kicker: "01 · IDENTITY INTELLIGENCE", title: "PROVE THE CARD", status: "IDENTITY VERIFIED", progress: "25%" },
      { key: "evidence", kicker: "02 · EVIDENCE INTELLIGENCE", title: "TEST THE EVIDENCE", status: "5 REJECTED · 2 TRUSTED", progress: "50%" },
      { key: "risk", kicker: "03 · RISK + ECONOMICS", title: "EXPOSE WHAT CHANGED", status: "UNCERTAINTY VISIBLE", progress: "75%" },
      { key: "decision", kicker: "04 · DECISION INTELLIGENCE", title: "KEEP THE REASON", status: "VERIFY · RECEIPT LOCKED", progress: "100%" }
    ];
    const kicker = hero.querySelector("[data-ff-hero-kicker]");
    const title = hero.querySelector("[data-ff-hero-title]");
    const status = hero.querySelector("[data-ff-hero-status]");
    const progress = hero.querySelector("[data-ff-hero-progress]");
    const steps = [...hero.querySelectorAll("[data-ff-hero-step]")];
    const stage = hero.querySelector(".ff-cinema-hero-stage");
    let index = 0;
    let timer = 0;
    let heroVisible = true;

    const renderHero = next => {
      index = next % heroStates.length;
      const state = heroStates[index];
      hero.dataset.heroState = state.key;
      if (kicker) kicker.textContent = state.kicker;
      if (title) title.textContent = state.title;
      if (status) status.textContent = state.status;
      if (progress) progress.style.width = state.progress;
      steps.forEach(step => step.classList.toggle("is-active", step.dataset.ffHeroStep === state.key));
    };

    const scheduleHero = () => {
      window.clearTimeout(timer);
      if (reduced || !heroVisible) return;
      timer = window.setTimeout(() => {
        renderHero((index + 1) % heroStates.length);
        scheduleHero();
      }, 2100);
    };

    renderHero(0);
    if (!reduced) {
      const heroObserver = new IntersectionObserver(entries => {
        heroVisible = entries.some(entry => entry.isIntersecting);
        if (heroVisible) scheduleHero();
        else window.clearTimeout(timer);
      }, { threshold: 0.12 });
      heroObserver.observe(hero);
      scheduleHero();
    } else {
      renderHero(3);
    }

    if (!reduced && stage && window.matchMedia?.("(pointer:fine)")?.matches) {
      stage.addEventListener("pointermove", event => {
        const rect = stage.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
        stage.style.setProperty("--hero-x", x.toFixed(3));
        stage.style.setProperty("--hero-y", y.toFixed(3));
      }, { passive: true });
      stage.addEventListener("pointerleave", () => {
        stage.style.setProperty("--hero-x", "0");
        stage.style.setProperty("--hero-y", "0");
      }, { passive: true });
    }
  }

  const links = root.querySelectorAll("[data-ff-cinema-cta]");
  links.forEach(link => {
    link.addEventListener("click", () => {
      try {
        const event = String(link.dataset.ffCinemaCta || "cinematic_cta");
        const payload = JSON.stringify({ event, page: "/", placement: "cinematic_homepage" });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/conversion-event", new Blob([payload], { type: "application/json" }));
        }
      } catch (_) {}
    });
  });
})();
