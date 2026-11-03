// Guards that internal repository files are not served from the published site root.
import fs from "node:fs";
const failures = [];
let total = 0;
const check = (name, ok) => { total += 1; if (!ok) failures.push(name); console.log(`${ok ? "PASS" : "FAIL"} ${name}`); };
const read = rel => fs.readFileSync(rel, "utf8");

const toml = read("netlify.toml");
const guard = read("netlify/modern-functions/internal-path-guard.mjs");
const strip = read("scripts/strip-internal-from-publish.mjs");
const command = (toml.match(/command\s*=\s*"([^"]+)"/) || [])[1] || "";

check("publish directory is the repository root (why this guard exists)", /publish\s*=\s*"\."/.test(toml));
check("strip step is the last build step", /node scripts\/strip-internal-from-publish\.mjs$/.test(command.trim()));
check("strip step only runs inside a Netlify build or when asked", /process\.env\.NETLIFY !== "true"/.test(strip));
check("strip step never removes netlify/ or node_modules/", !/remove\(\s*["'](netlify|node_modules)["']/.test(strip));
for (const dir of ["docs", "deploy-triggers", "legal"]) check(`strip step removes ${dir}/`, strip.includes(`"${dir}"`));
check("strip step removes root markdown and deploy trigger files", /\\\.md\$/.test(strip) && /deploy\|force\|trigger/.test(strip));
check("guard answers 404 without a redirect rule", /status:\s*404/.test(guard) && !read("_redirects").includes("/netlify/"));
check("guard does not set preferStatic", !/preferStatic\s*:/.test(guard));
for (const p of ["/netlify/*", "/scripts/*", "/contracts/*", "/docs/*", "/*.md", "/package.json", "/netlify.toml", "/saas-prototype/validate*", "/app/beta/validate*"]) {
  check(`guard covers ${p}`, guard.includes(`"${p}"`));
}
check("guard leaves identity email templates reachable", !guard.includes("identity-emails"));
check("guard declares no rate limit", !/\brateLimit\s*:/.test(guard));
check("guard does not cover public folders", !/"\/(assets|brand|saas-prototype|marketing-preview|api)\/\*"/.test(guard));

// Served app and site files never carry the data provider's name, in their path or their content.
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
const served = [
  ...walk("saas-prototype").filter(rel => !/\/validate[^/]*$/.test(rel)),
  ...walk("assets").filter(rel => /\.(js|css|html|json|svg)$/.test(rel)),
  ...fs.readdirSync(".").filter(name => /\.(html|js|json|webmanifest|xml|txt)$/.test(name) && !/^(package|package-lock)\.json$/.test(name))
].filter(rel => !/\.(png|jpe?g|webp|gif|mp4|woff2?)$/.test(rel));
const PROVIDER_NAME = /card[\s_-]*sight/i;
// Provider permission from 2026-10-26 allows ONLY this historical credit on Data Use.
// All other served files, including the customer app, must remain provider-neutral.
const APPROVED_SOURCE_CREDIT = "<p>Historical FlipForge research used observations supplied by <a href=\"https://cardsight.ai/\" rel=\"noopener noreferrer\">CardSight AI</a>. FlipForge independently applies its own card-matching, evidence rules, calculations, and decision logic. The data source does not determine or endorse FlipForge decisions. Provider-backed completed-sale evidence remains suspended in the Private Beta.</p>";
check("approved Data Use historical source credit exists", read("data-use.html").includes(APPROVED_SOURCE_CREDIT));
const named = served.filter(rel => {
  const source = rel === "data-use.html" ? read(rel).replace(APPROVED_SOURCE_CREDIT, "") : read(rel);
  return PROVIDER_NAME.test(rel) || PROVIDER_NAME.test(source);
});
check(`served files name no unapproved provider (${served.length} scanned)`, named.length === 0);
if (named.length) console.log(`  named in: ${named.join(", ")}`);

console.log(`validate-internal-publish-guard: ${total - failures.length}/${total} passed`);
if (failures.length) process.exit(1);
