(() => {
  "use strict";

  const status = document.getElementById("paddle-checkout-status");
  const token = String(window.FLIPFORGE_PADDLE_CLIENT_TOKEN || "").trim();

  function setStatus(message, state = "ready") {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  if (!token.startsWith("live_") || /\s/.test(token) || token.length > 512) {
    setStatus("Secure checkout is temporarily unavailable. Please return to FlipForge and try again later.", "error");
    return;
  }

  if (!window.Paddle || typeof window.Paddle.Initialize !== "function") {
    setStatus("Paddle checkout could not be loaded. Please refresh the page or try again later.", "error");
    return;
  }

  try {
    window.Paddle.Initialize({
      token,
      checkout: {
        settings: {
          displayMode: "overlay",
          theme: "dark",
          locale: "en"
        }
      }
    });

    const transactionId = new URLSearchParams(window.location.search).get("_ptxn");
    if (transactionId && /^txn_[a-z0-9]{26}$/.test(transactionId)) {
      setStatus("Opening your secure Paddle checkout…");
    } else {
      setStatus("Secure checkout is ready. Return to FlipForge and choose a plan to begin.");
    }
  } catch (_) {
    setStatus("Paddle checkout could not be initialized. Please return to FlipForge and try again later.", "error");
  }
})();
