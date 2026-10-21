// Show/hide button for every password field on FlipForge sign-in, invitation and password-reset forms.
//
// Display only: the button switches the field between hidden and visible text. It never reads, stores,
// logs or sends the password, and every field returns to hidden when its form is submitted, so a visible
// password is never left on screen after signing in.

const STYLE_ID = "ff-password-visibility-style";
const ENHANCED = "data-ff-password-toggle-ready";
const SHOW_LABEL = "Show password";
const HIDE_LABEL = "Hide password";

const EYE =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const EYE_OFF =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a10.3 10.3 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

const STYLESHEET_PATH = "/assets/css/flipforge-password-visibility-v1.css";

let sequence = 0;
let submitListenerInstalled = false;

// A same-origin stylesheet, never an inline <style>: the homepage (where invitation links land) only
// allows style-src 'self'.
function ensureStyles(doc) {
  let link = doc.getElementById(STYLE_ID);
  if (!link) {
    link = doc.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.href = STYLESHEET_PATH;
    (doc.head || doc.documentElement).appendChild(link);
  }
  return link;
}

// The button stays hidden until its stylesheet applies, so it never flashes as an unstyled button under the
// field. If the stylesheet fails it is shown anyway (it still works).
function revealWhenStyled(link, button) {
  if (!link || link.sheet) return;
  button.hidden = true;
  const reveal = () => { button.hidden = false; };
  link.addEventListener("load", reveal, { once: true });
  link.addEventListener("error", reveal, { once: true });
  setTimeout(reveal, 4000);
}

// Text of the enclosing <label> without the button, so screen readers keep announcing the field as
// "Password" rather than "Password Show password".
function labelText(input) {
  const label = input.closest("label");
  if (!label) return "";
  let text = "";
  label.childNodes.forEach(node => {
    if (node.nodeType === 3) text += node.textContent;
  });
  return text.replace(/\s+/g, " ").trim();
}

function setVisible(input, button, visible) {
  input.type = visible ? "text" : "password";
  button.setAttribute("aria-pressed", visible ? "true" : "false");
  button.setAttribute("aria-label", visible ? HIDE_LABEL : SHOW_LABEL);
  button.title = visible ? HIDE_LABEL : SHOW_LABEL;
  button.innerHTML = visible ? EYE_OFF : EYE;
}

export function enhancePasswordInput(input) {
  if (!input || input.hasAttribute(ENHANCED) || input.type !== "password") return false;
  const doc = input.ownerDocument;
  const link = ensureStyles(doc);
  input.setAttribute(ENHANCED, "");
  if (!input.id) input.id = `ff-password-${++sequence}`;
  if (!input.hasAttribute("aria-label") && !input.hasAttribute("aria-labelledby")) {
    const name = labelText(input);
    if (name) input.setAttribute("aria-label", name);
  }
  const wrapper = doc.createElement("span");
  wrapper.className = "ff-password-field";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const button = doc.createElement("button");
  button.type = "button";
  button.className = "ff-password-toggle";
  button.setAttribute("aria-controls", input.id);
  button.setAttribute("data-ff-password-toggle", "");
  setVisible(input, button, false);
  // Keep the caret in the field: pressing the button must not take focus away while typing.
  button.addEventListener("mousedown", event => event.preventDefault());
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    setVisible(input, button, input.type === "password");
    try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
  });
  revealWhenStyled(link, button);
  wrapper.appendChild(button);
  return true;
}

export function hideAllPasswords(root) {
  root.querySelectorAll(`input[${ENHANCED}]`).forEach(input => {
    const button = input.parentNode?.querySelector?.("button.ff-password-toggle");
    if (button) setVisible(input, button, false);
    else input.type = "password";
  });
}

export function enablePasswordVisibility(root = document) {
  if (!root || typeof root.querySelectorAll !== "function") return 0;
  let count = 0;
  root.querySelectorAll('input[type="password"]').forEach(input => {
    if (enhancePasswordInput(input)) count += 1;
  });
  const doc = root.ownerDocument || root;
  if (!submitListenerInstalled && doc.addEventListener) {
    submitListenerInstalled = true;
    // Capture phase: runs before the form's own submit handler reads the field.
    doc.addEventListener("submit", event => {
      if (event.target && typeof event.target.querySelectorAll === "function") hideAllPasswords(event.target);
    }, true);
  }
  return count;
}

// Forms rendered later (invitation, password reset, the in-app sign-in panel) are picked up as they appear.
export function watchPasswordInputs(doc = document) {
  const start = () => {
    enablePasswordVisibility(doc);
    if (typeof MutationObserver !== "function" || !doc.body) return;
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.('input[type="password"]')) enhancePasswordInput(node);
          else if (node.querySelector?.('input[type="password"]')) enablePasswordVisibility(node);
        }
      }
    });
    observer.observe(doc.body, { childList: true, subtree: true });
  };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
