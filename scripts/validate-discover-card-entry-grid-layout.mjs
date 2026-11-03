import fs from "node:fs";

// The card-box focus cue is the Discover owner's (customer-discovery.js) since Nov 3 2026; it only adds a class to the
// input and inserts no hint into the form grid. The guided builder and serial details span the full grid row.
const emphasisPath = "saas-prototype/discover-card-entry-emphasis-v1.css";
const emphasis = fs.readFileSync(emphasisPath, "utf8");
const discovery = fs.readFileSync("saas-prototype/customer-discovery.js", "utf8");
const guidedCss = fs.readFileSync("saas-prototype/beta-guided-discover-v1.css", "utf8");

function requireText(text, expected, message) {
  if (!text.includes(expected)) throw new Error(message);
}

function rejectText(text, forbidden, message) {
  if (text.includes(forbidden)) throw new Error(message);
}

rejectText(discovery, 'insertAdjacentElement("beforebegin", hint)', "Discover must not insert a hint into the form grid.");
if (fs.existsSync("saas-prototype/guided-discover-focus-fix-v1.js")) throw new Error("The focus-fix layer must stay removed.");
requireText(guidedCss, ".ffguided-entry{grid-column:1/-1", "The guided builder must span the full form row.");
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
