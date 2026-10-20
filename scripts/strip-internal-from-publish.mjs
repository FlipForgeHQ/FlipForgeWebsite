// Final build step: remove internal-only files from the publish directory (the repository root).
//
// Runs last in the netlify.toml build command, after every validator has read what it needs. It never touches
// netlify/ (the function bundler reads it after the build), node_modules/, or anything a served page references.
// netlify/modern-functions/internal-path-guard.mjs answers 404 for internal folders that cannot be deleted here.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
if (!fs.existsSync(path.join(root, "netlify.toml"))) {
  console.error("strip-internal-from-publish: run from the repository root");
  process.exit(1);
}
// Safety: only strip inside a Netlify build, or when explicitly asked, so a local run never deletes a working copy.
if (process.env.NETLIFY !== "true" && process.env.FLIPFORGE_STRIP_INTERNAL !== "1") {
  console.log("strip-internal-from-publish: skipped (not a Netlify build; set FLIPFORGE_STRIP_INTERNAL=1 to run)");
  process.exit(0);
}

const removed = [];
const remove = rel => {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return;
  fs.rmSync(full, { recursive: true, force: true });
  removed.push(rel);
};

for (const dir of ["docs", "deploy-triggers", "legal"]) remove(dir);
for (const name of fs.readdirSync(root)) {
  if (/\.md$/i.test(name)) remove(name);
  else if (/^(deploy|force|trigger)[-\w.]*\.txt$/i.test(name)) remove(name);
}
for (const dir of ["brand", "marketing"]) {
  for (const name of ["README.md"]) remove(path.join(dir, name));
}

console.log(`strip-internal-from-publish: removed ${removed.length} internal paths`);
for (const rel of removed) console.log(`  - ${rel}`);
