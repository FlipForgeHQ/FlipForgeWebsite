import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "netlify/modern-functions/bulk-evaluate.js"), "utf8");
const results = [];
const check = (name, condition) => results.push({ name, passed: Boolean(condition) });

check("001 GET-only page endpoint", source.includes('event.httpMethod !== "GET"'));
check("002 response is HTML", source.includes('"Content-Type": "text/html; charset=utf-8"'));
check("003 response is no-store", source.includes('"Cache-Control": "no-store"'));
check("004 batch limit is 25", source.includes("MAX_ROWS=25"));
check("005 CSV upload is present", source.includes('type="file"') && source.includes('accept=".csv,text/csv"'));
check("006 template download is present", source.includes("flipforge-bulk-evaluate-template.csv"));
check("007 fixed authoritative endpoint", source.includes('ENDPOINT="/api/v1/evaluations"'));
check("008 POST uses same-origin credentials", source.includes('method:"POST"') && source.includes('credentials:"same-origin"'));
check("009 caching disabled for writes", source.includes('cache:"no-store"'));
check("010 redirects refused", source.includes('redirect:"error"'));
check("011 correlation header is sent", source.includes('"X-Correlation-Id":correlation'));
check("012 idempotency header is sent", source.includes('"Idempotency-Key":requestId'));
check("013 browser does not set Authorization", !source.includes('"Authorization"'));
check("014 browser does not set tenant header", !/X-FlipForge-Tenant-Id/i.test(source));
check("015 Smart Opportunity authority required", source.includes('meta.authority!=="Smart Opportunity"'));
check("016 existing PSA authority required", source.includes('meta.gradingAuthority!=="Existing PSA intelligence"'));
check("017 SQLite persistence required", source.includes("d.persistedToSqlite!==true"));
check("018 tenant ownership required", source.includes("d.tenantOwned!==true"));
check("019 no transaction authority required", source.includes("d.transactionAuthorized!==false"));
check("020 isolation default deny required", source.includes('isolation.defaultAccess!=="DENY"'));
check("021 decision states bounded", source.includes('new Set(["BUY","WATCH","VERIFY","PASS"])'));
check("022 money converts to integer cents", source.includes("BigInt(p[0])*100n"));
check("023 HTTP(S) URLs only", source.includes('["http:","https:"]'));
check("024 required columns enforced", ["externalListingId", "cardIdentity", "listingUrl", "itemPrice"].every(key => source.includes(`\"${key}\"`)));
check("025 sequential evaluation", source.includes("for(const r of rows)") && source.includes("await submit(r)"));
check("026 completed batch cannot rerun", source.includes("running||completed") && source.includes("completed=!rows.some"));
check("027 auth/quota stop statuses", source.includes("[401,403,429].includes(e.status)"));
check("028 user acknowledgment required", source.includes("!ack.checked"));

check("029 Phase 7 proof version is locked", source.includes('PROOF_VERSION="FF_25_CARD_PROOF_V1"'));
check("030 successful rows preserve authoritative request ids", source.includes('r.requestId=String(data.requestId||"")') && source.includes("d.requestId!==requestId"));
check("031 proof mode requires 25 explicitly tagged rows", source.includes('rows.length===25') && source.includes('r.data.proofStudy') && source.includes('===PROOF_VERSION'));
check("032 proof export requires completed identity-verified rows", source.includes('r.status==="COMPLETE"&&r.identityVerified===true'));
check("033 proof sport allocation is pre-registered", source.includes('c.MLB===7') && source.includes('c.NFL===6') && source.includes('c.NBA===6') && source.includes('c.NHL===6'));
check("034 Phase 7 template contains 7/6/6/6 slots", source.includes('Array(7).fill("MLB")') && source.includes('Array(6).fill("NFL")') && source.includes('Array(6).fill("NBA")') && source.includes('Array(6).fill("NHL")'));
check("035 Phase 7 template activates proof mode", source.includes('proofStudy,sport,externalListingId') && source.includes('sports.map(s=>PROOF_VERSION+","+s'));
check("036 proof handoff is explicitly audit-only", source.includes('auditExportOnly:true') && source.includes('sourceOfTruth:"SQLITE"'));
check("037 proof export carries authority locks", source.includes('accuracyClaimAuthorized:false') && source.includes('selfTrainingAuthority:false') && source.includes('transactionAuthority:false'));
check("038 proof export never sends a proof cohort write", !source.includes('fetch("/api/v1/proof-cohorts') && !source.includes("fetch('/api/v1/proof-cohorts"));
check("039 proof handoff does not expose tenant context", !source.includes('trusted-tenant-context') && !source.includes('tenantId:'));
check("040 no browser persistence is introduced", !/localStorage|sessionStorage|indexedDB/i.test(source));
check("041 customer wording avoids SQLite implementation detail in row status", source.includes('saved to FlipForge') && !source.includes('saved to SQLite'));
check("042 Day-0 request ID is visible in results", source.includes("<th>Day-0 ID</th>") && source.includes('esc(r.requestId||"—")'));

check("043 proof identity preflight uses only server-owned Card Intelligence routes", source.includes('CARD_SEARCH="/api/v1/card-intelligence/search"') && source.includes('CARD_RESOLVE="/api/v1/card-intelligence/resolve"'));
check("044 Card Intelligence response contract preserves authority", source.includes('meta.authority==="Smart Opportunity"') && source.includes('meta.gradingAuthority==="Existing PSA intelligence"'));
check("045 identity preflight refuses provider leakage and side effects", source.includes('data.providerIdentifierExposed===false') && source.includes('data.rawProviderPayloadExposed===false') && source.includes('data.providerPayloadPersisted===false') && source.includes('data.soldEvidenceAccepted===false') && source.includes('data.smartOpportunityRecalculated===false') && source.includes('data.transactionAuthority===false'));
check("046 proof identity preflight requires one exact selectable candidate", source.includes('candidates.length!==1') && source.includes('row.exactCardCandidate===true') && source.includes('row.selectionToken'));
check("047 proof identity preflight resolves opaque selection token", source.includes('cardApi(CARD_RESOLVE,{selectionToken:candidates[0].selectionToken})'));
check("048 proof identity preflight requires ready-for-evaluation identity", source.includes('resolved.readyForEvaluation!==true') && source.includes('r.identityVerified=true'));
check("049 all identity preflight occurs before Day-0 submission", source.indexOf('await resolveProofIdentity(r)') < source.lastIndexOf('await submit(r)'));
check("050 a failed proof identity preflight submits no Day-0 evaluations", source.includes('Identity preflight failed.') && source.includes('No Day-0 evaluations were submitted.') && source.includes('return}message.className="status";message.textContent="All 25 identities verified. Submitting Day-0 evaluations…"'));
check("051 normal Bulk Evaluate does not require proof mode", source.includes('const isProof=proofMode();if(isProof){') && source.includes('r.detail=isProof?"Identity verified · submitting authoritative evaluation…":"Submitting authoritative evaluation…"'));
check("052 proof export records identity preflight provenance", source.includes('identityPreflight:{required:true,allResolved:true,source:"server-owned-card-intelligence-search-resolve"}'));
check("053 governed eBay Browse provider IDs are accepted", source.includes('const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:|-]{0,179}$/;'));

let embeddedScriptParses = false;
let embeddedScriptError = "";
try {
  const sandbox = { exports: {} };
  vm.runInNewContext(source, sandbox, { filename: "bulk-evaluate.js" });
  const page = await sandbox.exports.handler({ httpMethod: "GET" });
  const generatedHtml = String(page?.body || "");
  const scriptMatch = generatedHtml.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
  if (!scriptMatch) throw new Error("Rendered Bulk Evaluate HTML did not contain an inline script.");
  new vm.Script(scriptMatch[1], { filename: "bulk-evaluate-browser.js" });
  embeddedScriptParses = true;
} catch (error) {
  embeddedScriptError = error instanceof Error ? String(error.stack || `${error.name}: ${error.message}`) : String(error);
}
check("054 embedded Bulk Evaluate browser script parses", embeddedScriptParses);
check("055 CSV chooser is visible instead of hidden behind a label", source.includes('id="file" type="file"') && !source.includes('.upload input{display:none}'));
check("056 selected CSV filename is visible", source.includes('id="selected-file"') && source.includes('"Selected: "+selectedFile.name'));
check("057 explicit same-file load retry is available", source.includes('id="load-file"') && source.includes('loadFile.addEventListener("click"'));
check("058 choosing a CSV still auto-loads it", source.includes('file.addEventListener("change"') && source.includes('if(selectedFile)load(selectedFile)'));
check("059 CSV loading gives immediate visible feedback", source.includes('message.textContent="Loading "+f.name+"…"'));

const failed = results.filter(result => !result.passed);
for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
if (embeddedScriptError) console.error(`Rendered Bulk Evaluate parser error:\n${embeddedScriptError}`);
console.log(`\nBulk Evaluate endpoint validation: ${results.length - failed.length}/${results.length} passed.`);
if (failed.length) process.exitCode = 1;