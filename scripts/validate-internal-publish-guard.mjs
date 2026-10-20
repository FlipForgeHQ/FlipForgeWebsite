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
for (const p of ["/netlify/*", "/scripts/*", "/contracts/*", "/docs/*", "/*.md", "/package.json", "/netlify.toml"]) {
  check(`guard covers ${p}`, guard.includes(`"${p}"`));
}
check("guard leaves identity email templates reachable", !guard.includes("identity-emails"));
check("guard declares no rate limit", !/\brateLimit\s*:/.test(guard));
check("guard does not cover public folders", !/"\/(assets|brand|saas-prototype|marketing-preview|api)\/\*"/.test(guard));

console.log(`validate-internal-publish-guard: ${total - failures.length}/${total} passed`);
if (failures.length) process.exit(1);
