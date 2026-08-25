import fs from "node:fs";

const focusPath = "saas-prototype/guided-discover-focus-fix-v1.js";
const emphasisPath = "saas-prototype/discover-card-entry-emphasis-v1.css";
const focus = fs.readFileSync(focusPath, "utf8");
const emphasis = fs.readFileSync(emphasisPath, "utf8");

function requireText(text, expected, message) {
  if (!text.includes(expected)) throw new Error(message);
}

function rejectText(text, forbidden, message) {
  if (text.includes(forbidden)) throw new Error(message);
}

requireText(
  focus,
  '(form || label || input).insertAdjacentElement("beforebegin", hint);',
  "Discover direct hint must be inserted before the form so it cannot consume a form grid column."
);
rejectText(
  focus,
  '(label || input).insertAdjacentElement("beforebegin", hint);',
  "Discover direct hint must not be inserted as a child of the form grid."
);
requireText(
  emphasis,
  '.customer-discovery-form > label:has(input[name="exactCardQuery"]){',
  "Card Identity full-width styling must target the identity label directly rather than :first-child."
);
rejectText(
  emphasis,
  ".customer-discovery-form > label:first-child",
  "Card Identity layout must not depend on being the form's first child."
);

console.log("PASS | Discover card entry keeps guidance outside the grid and preserves a full-width identity field.");
