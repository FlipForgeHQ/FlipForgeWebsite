// Dependency-free extraction of the text a script can show: string literals and the static parts of template
// literals. Comments, regular-expression literals and code (identifiers, property names) are skipped, so internal
// names such as providerRows or a `// <provider>` comment are never reported as customer text.
//
// extractStringFragments(source) -> [{ text, line, kind: "string" | "template" }]
const REGEX_PREFIX_KEYWORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "instanceof", "yield", "await"]);

export function extractStringFragments(source) {
  const src = String(source || "");
  const out = [];
  let i = 0;
  let line = 1;
  let lastSignificant = ""; // last non-space char outside strings/comments, or a keyword marker
  let lastWord = "";

  const regexAllowed = () => lastSignificant === "" || "(,=:[!&|?{};+-*%<>~^".includes(lastSignificant) || REGEX_PREFIX_KEYWORDS.has(lastWord);

  function readQuoted(quote) {
    const startLine = line;
    let text = "";
    i += 1;
    while (i < src.length && src[i] !== quote) {
      if (src[i] === "\\") { text += src.slice(i, i + 2); if (src[i + 1] === "\n") line += 1; i += 2; continue; }
      if (src[i] === "\n") line += 1;
      text += src[i];
      i += 1;
    }
    i += 1;
    out.push({ text, line: startLine, kind: "string" });
  }

  function readTemplate() {
    let text = "";
    let startLine = line;
    i += 1;
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") { text += src.slice(i, i + 2); i += 2; continue; }
      if (src[i] === "$" && src[i + 1] === "{") {
        out.push({ text, line: startLine, kind: "template" });
        text = "";
        i += 2;
        readCode("}");
        startLine = line;
        continue;
      }
      if (src[i] === "\n") line += 1;
      text += src[i];
      i += 1;
    }
    i += 1;
    out.push({ text, line: startLine, kind: "template" });
  }

  function readRegex() {
    i += 1;
    let inClass = false;
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "\n") break;
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) { i += 1; break; }
      i += 1;
    }
    while (i < src.length && /[a-z]/i.test(src[i])) i += 1;
  }

  // Reads code until the matching `until` brace (for template expressions) or the end of the source.
  function readCode(until) {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      const next = src[i + 1];
      if (c === "\n") { line += 1; i += 1; continue; }
      if (/\s/.test(c)) { i += 1; continue; }
      if (c === "/" && next === "/") { while (i < src.length && src[i] !== "\n") i += 1; continue; }
      if (c === "/" && next === "*") {
        const end = src.indexOf("*/", i + 2);
        const stop = end < 0 ? src.length : end + 2;
        for (let k = i; k < stop; k += 1) if (src[k] === "\n") line += 1;
        i = stop;
        continue;
      }
      if (c === "'" || c === '"') { readQuoted(c); lastSignificant = "a"; lastWord = ""; continue; }
      if (c === "`") { readTemplate(); lastSignificant = "a"; lastWord = ""; continue; }
      if (c === "/" && regexAllowed()) { readRegex(); lastSignificant = "a"; lastWord = ""; continue; }
      if (until && c === "{") depth += 1;
      if (until && c === "}") {
        if (depth === 0) { i += 1; lastSignificant = "a"; lastWord = ""; return; }
        depth -= 1;
      }
      if (/[A-Za-z0-9_$]/.test(c)) {
        let word = "";
        while (i < src.length && /[A-Za-z0-9_$]/.test(src[i])) { word += src[i]; i += 1; }
        lastWord = word;
        lastSignificant = REGEX_PREFIX_KEYWORDS.has(word) ? "(" : "a";
        continue;
      }
      // ")" and "]" end an expression, so a following "/" is division.
      lastSignificant = c === ")" || c === "]" ? "a" : c;
      lastWord = "";
      i += 1;
    }
  }

  readCode("");
  return out;
}
