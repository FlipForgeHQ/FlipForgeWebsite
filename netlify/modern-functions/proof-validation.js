exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { Allow: "GET", "Content-Type": "text/plain; charset=utf-8" },
      body: "Method not allowed"
    };
  }

  const html = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>FlipForge | Proof & Validation</title>
<style>
:root{--bg:#07090d;--panel:#0e131a;--line:#27313d;--text:#f5f7fa;--muted:#98a4b3;--gold:#f6a916;--green:#27d17f;--blue:#61a8ff;--red:#ff8b8b;--amber:#f2c66d}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.banner{padding:9px 18px;background:#111722;border-bottom:1px solid var(--line);font-size:12px;letter-spacing:.04em}.banner strong{color:var(--gold);margin-right:10px}.shell{max-width:1380px;margin:auto;padding:20px}.top{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:20px}.brand{font-weight:900;letter-spacing:.08em}.brand span{color:var(--gold)}a{color:var(--blue)}.button,button{border:1px solid var(--line);border-radius:10px;background:#151c25;color:var(--text);padding:10px 14px;font:inherit;font-weight:750;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.primary{background:var(--gold);border-color:var(--gold);color:#15100a}.button:disabled,button:disabled{opacity:.45;cursor:not-allowed}.panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden}.head{padding:20px;border-bottom:1px solid var(--line)}h1{margin:4px 0 8px;font-size:30px}.head p,.note{margin:0;color:var(--muted)}.body{padding:20px;display:grid;gap:16px}.actions{display:flex;gap:10px;flex-wrap:wrap}.upload input{display:none}.ack{display:flex;gap:10px;align-items:flex-start;padding:13px;border:1px solid var(--line);border-radius:10px;background:#0a0f15}.ack input{margin-top:3px;accent-color:var(--gold)}.status{padding:12px 14px;border-radius:10px;background:#0a0f15;border:1px solid var(--line)}.error{border-color:#6b3333;color:#ffd0d0}.success{border-color:#245d43;color:#b9f4d6}.warning{border-color:#6f5a25;color:#f5d99a}.tablewrap{overflow:auto;border:1px solid var(--line);border-radius:12px}table{width:100%;border-collapse:collapse;min-width:1050px}th,td{padding:10px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:11px;text-transform:uppercase;color:var(--muted);letter-spacing:.07em}td small{display:block;color:var(--muted);margin-top:3px}.pill{font-size:11px;font-weight:850;padding:4px 8px;border-radius:999px;background:#17202b;white-space:nowrap}.complete{color:var(--green)}.running{color:var(--blue)}.failed{color:var(--red)}.selected{color:var(--amber)}.boundary{padding:13px;border:1px solid #5c4619;background:#171309;border-radius:10px;color:#d5c18f}.cohort{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.cohort div{padding:12px;border:1px solid var(--line);border-radius:10px;background:#0a0f15}.cohort span{display:block;color:var(--muted);font-size:12px}.cohort strong{display:block;margin-top:3px}.progress{height:8px;background:#111821;border-radius:99px;overflow:hidden}.progress>span{display:block;height:100%;background:var(--gold);width:0}.hidden{display:none!important}@media(max-width:800px){.shell{padding:12px}.top{align-items:flex-start;flex-direction:column}.actions>*{width:100%}.cohort{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="banner"><strong>FLIPFORGE PRIVATE BETA</strong> Prospective proof study · Immutable Day-0 decisions · No transaction authority</div>
<div class="shell">
  <div class="top"><div class="brand">FLIP<span>FORGE</span> · PROOF & VALIDATION</div><a class="button" href="/app/#/evaluate">Back to Evaluate</a></div>
  <section class="panel">
    <div class="head"><div class="note">25-card prospective validation study</div><h1>Day 0 Cohort Intake</h1><p>Upload the fixed card manifest, preflight every identity against connected active listings, then create one immutable proof cohort from the authoritative saved evaluations.</p></div>
    <div class="body">
      <div class="boundary"><strong>Study rule:</strong> FlipForge uses the first evaluation-eligible listing returned for each exact-card query. You cannot pick a cheaper or more attractive result. Active asking prices remain discovery inputs and never become sold evidence.</div>
      <div class="cohort"><div><span>Cohort ID</span><strong>FF-PROOF-001</strong></div><div><span>Study</span><strong>Day 0 Four-Sport Validation</strong></div><div><span>Checkpoints</span><strong>Day 7 · 14 · 30 · 90 · 180</strong></div></div>
      <div id="message" class="status">Load the official cohort or upload the 25-card CSV.</div>
      <div class="progress"><span id="progress"></span></div>
      <div class="actions">
        <button id="official" type="button">Load official 25-card cohort</button>
        <label class="button upload">Upload CSV<input id="file" type="file" accept=".csv,text/csv"></label>
        <button id="template" type="button">Download official CSV</button>
        <button id="preflight" class="primary" type="button" disabled>Validate 25 Cards</button>
      </div>
      <label class="ack"><input id="ack" type="checkbox" disabled><span>I understand this will create 25 governed evaluations, may use evaluation allowance, and will permanently lock the completed request IDs into an immutable proof cohort.</span></label>
      <div class="actions">
        <button id="run" class="primary" type="button" disabled>Run Day 0 & Lock Cohort</button>
        <button id="audit" type="button" disabled>Download Day-0 audit CSV</button>
        <a id="cohortLink" class="button hidden" href="#">Open saved cohort JSON</a>
      </div>
      <div id="results"></div>
    </div>
  </section>
</div>
<script>
(() => {
"use strict";
const DISCOVER="/api/v1/discover",EVALUATE="/api/v1/evaluations",COHORTS="/api/v1/proof-cohorts";
const COHORT_ID="FF-PROOF-001",COHORT_NAME="Day 0 Four-Sport Validation",MAX_ROWS=25,MAX_FILE=256000;
const REQUIRED=["evaluation_id","sport","year","set","player","card_number","parallel","grader","grade"];
const DECISIONS=new Set(["BUY","WATCH","VERIFY","PASS"]),SAFE_REQUEST=/^[A-Za-z0-9._-]{8,100}$/;
const OFFICIAL=`evaluation_id,sport,year,set,player,card_number,parallel,grader,grade
D0-001,MLB,2011,Topps Update,Mike Trout,US175,BASE,PSA,10
D0-002,MLB,2018,Topps Update,Shohei Ohtani,US1,BASE,PSA,10
D0-003,MLB,2018,Topps Chrome,Ronald Acuna Jr.,193,BASE,PSA,10
D0-004,MLB,2019,Topps Chrome,Fernando Tatis Jr.,203,BASE,PSA,10
D0-005,MLB,2018,Topps Update,Juan Soto,US300,BASE,PSA,10
D0-006,MLB,1989,Upper Deck,Ken Griffey Jr.,1,STAR ROOKIE,PSA,9
D0-007,MLB,1993,SP,Derek Jeter,279,FOIL BASE,PSA,9
D0-008,NFL,2017,Panini Prizm,Patrick Mahomes II,269,BASE,PSA,9
D0-009,NFL,2018,Panini Prizm,Josh Allen,205,BASE,PSA,10
D0-010,NFL,2020,Panini Prizm,Joe Burrow,307,BASE,PSA,10
D0-011,NFL,2020,Panini Prizm,Justin Herbert,325,BASE,PSA,10
D0-012,NFL,2020,Panini Prizm,Justin Jefferson,398,BASE,PSA,10
D0-013,NFL,2023,Panini Prizm,CJ Stroud,339,BASE,PSA,10
D0-014,NBA,2003,Topps Chrome,LeBron James,111,BASE,PSA,9
D0-015,NBA,2009,Topps,Stephen Curry,321,BASE,PSA,9
D0-016,NBA,2018,Panini Prizm,Luka Doncic,280,BASE,PSA,10
D0-017,NBA,2019,Panini Prizm,Zion Williamson,248,BASE,PSA,10
D0-018,NBA,2020,Panini Prizm,Anthony Edwards,258,BASE,PSA,10
D0-019,NBA,2023,Panini Prizm,Victor Wembanyama,136,BASE,PSA,10
D0-020,NHL,2005,Upper Deck,Sidney Crosby,201,YOUNG GUNS,PSA,9
D0-021,NHL,2015,Upper Deck,Connor McDavid,201,YOUNG GUNS,PSA,10
D0-022,NHL,2016,Upper Deck,Auston Matthews,201,YOUNG GUNS,PSA,10
D0-023,NHL,2019,Upper Deck,Jack Hughes,201,YOUNG GUNS,PSA,10
D0-024,NHL,2019,Upper Deck,Cale Makar,493,YOUNG GUNS,PSA,10
D0-025,NHL,2020,Upper Deck,Kirill Kaprizov,451,YOUNG GUNS,PSA,10`;
let rows=[],busy=false,preflightComplete=false,cohort=null;
const $=s=>document.querySelector(s),file=$("#file"),preflight=$("#preflight"),run=$("#run"),ack=$("#ack"),message=$("#message"),results=$("#results"),progress=$("#progress"),audit=$("#audit"),cohortLink=$("#cohortLink");
const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
function id(prefix="proof-"){const suffix=(globalThis.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2);return prefix+suffix}
function parseCsv(text){const out=[];let row=[],field="",q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else q=false}else field+=c}else if(c==='"')q=true;else if(c===','){row.push(field);field=""}else if(c==='\n'){row.push(field.replace(/\r$/,"");out.push(row);row=[];field=""}else field+=c}if(q)throw Error("CSV has an unclosed quoted field.");if(field.length||row.length){row.push(field.replace(/\r$/,"");out.push(row)}return out.filter(r=>r.some(v=>String(v).trim()))}
function normalizeHeader(v){return String(v||"").replace(/^\uFEFF/,"").trim().toLowerCase().replace(/[\s-]+/g,"_")}
function exactQuery(d){const parallel=String(d.parallel||"").trim();return [d.year,d.set,d.player,"#"+d.card_number,parallel,d.grader,d.grade].filter(Boolean).join(" ").replace(/\s+/g," ").trim()}
function dollars(cents){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format((Number(cents)||0)/100)}
function setMessage(text,tone=""){message.className="status"+(tone?" "+tone:"");message.textContent=text}
function setProgress(done,total){progress.style.width=(total?Math.round(done/total*100):0)+"%"}
function validateManifest(text){const rec=parseCsv(text);if(rec.length!==26)throw Error("This study requires exactly 25 card rows plus the header.");const headers=rec[0].map(normalizeHeader),missing=REQUIRED.filter(k=>!headers.includes(k));if(missing.length)throw Error("Missing required columns: "+missing.join(", "));const seen=new Set();return rec.slice(1).map((vals,i)=>{const d={};headers.forEach((h,c)=>{if(h)d[h]=String(vals[c]??"").trim()});for(const k of REQUIRED)if(!d[k])throw Error("Row "+(i+2)+" is missing "+k+".");if(!/^D0-\d{3}$/i.test(d.evaluation_id))throw Error("Row "+(i+2)+" has an invalid evaluation_id.");if(seen.has(d.evaluation_id.toUpperCase()))throw Error("Duplicate evaluation_id: "+d.evaluation_id);seen.add(d.evaluation_id.toUpperCase());return{number:i+2,data:d,query:exactQuery(d),status:"READY",detail:"",candidate:null,requestId:"",opportunityId:"",decision:"",confidence:"",risk:""}})}
function render(){preflight.disabled=busy||rows.length!==MAX_ROWS||preflightComplete;ack.disabled=!preflightComplete||busy;run.disabled=busy||!preflightComplete||!ack.checked||rows.some(r=>!r.candidate)||rows.some(r=>r.status==="ERROR")||Boolean(cohort);audit.disabled=!rows.some(r=>r.requestId);run.textContent=busy?"Working…":cohort?"Cohort locked":"Run Day 0 & Lock Cohort";if(!rows.length){results.innerHTML="";return}results.innerHTML='<div class="tablewrap"><table><thead><tr><th>ID</th><th>Exact card</th><th>Selected listing</th><th>Ask</th><th>Decision</th><th>Status</th></tr></thead><tbody>'+rows.map(r=>{const ask=r.candidate?dollars(r.candidate.ask):"—";const listing=r.candidate?'<a href="'+esc(r.candidate.url)+'" target="_blank" rel="noopener noreferrer">'+esc(r.candidate.provider||"Listing")+'</a><small>'+esc(r.candidate.externalId||"")+'</small>':"—";return'<tr><td><strong>'+esc(r.data.evaluation_id)+'</strong><small>'+esc(r.data.sport)+'</small></td><td><strong>'+esc(r.query)+'</strong><small>'+esc(r.detail||"")+'</small></td><td>'+listing+'</td><td>'+ask+'</td><td>'+esc(r.decision||"—")+'</td><td><span class="pill '+(r.status==="COMPLETE"?"complete":r.status==="ERROR"?"failed":r.status==="CHECKING"||r.status==="EVALUATING"?"running":r.status==="SELECTED"?"selected":"")+'">'+esc(r.status)+'</span></td></tr>'}).join("")+'</tbody></table></div>'}
async function jsonRequest(path,{method="GET",body=null,requestId=""}={}){const corr=id("proof-corr-");const headers={Accept:"application/json","X-Correlation-Id":corr};if(body!==null)headers["Content-Type"]="application/json; charset=utf-8";if(requestId)headers["Idempotency-Key"]=requestId;const response=await fetch(path,{method,headers,body:body===null?undefined:JSON.stringify(body),credentials:"same-origin",cache:"no-store",redirect:"error"});const text=await response.text();let payload={};try{payload=text?JSON.parse(text):{}}catch(_){throw Object.assign(Error("FlipForge gateway returned invalid JSON."),{status:response.status})}if(!response.ok){const e=payload&&payload.error?payload.error:{};throw Object.assign(Error(e.message||"Request failed with status "+response.status),{status:response.status,code:e.code||"REQUEST_FAILED"})}return{payload,corr}}
function validateMeta(p,corr){return p&&p.meta&&p.meta.contractVersion==="1.0"&&p.meta.authority==="Smart Opportunity"&&p.meta.gradingAuthority==="Existing PSA intelligence"&&p.meta.correlationId===corr&&p.data}
async function discoverRow(r){const out=await jsonRequest(DISCOVER,{method:"POST",body:{exactCardQuery:r.query,limit:10,targetMaxBuyCents:0}});if(!validateMeta(out.payload,out.corr))throw Error("Discovery response failed the FlipForge authority contract.");const d=out.payload.data;if(d.kind!=="discover"||d.readOnly!==true||d.discoveryPersisted!==false||d.activeListingsAreCompletedSaleEvidence!==false||!Array.isArray(d.items))throw Error("Discovery response failed the study boundary.");const item=d.items.find(v=>v&&v.evaluationEligible===true&&v.evaluationRequest&&typeof v.evaluationRequest==="object");if(!item)throw Error("No evaluation-eligible active listing was returned for this exact card.");const e=item.evaluationRequest;const required=["externalListingId","marketplace","cardIdentity","listingUrl","itemPriceCents","shippingCents","buyerPremiumCents","taxCents"];for(const k of required)if(e[k]===undefined||e[k]===null||e[k]==="")throw Error("Selected listing is missing "+k+".");r.candidate={evaluationRequest:e,externalId:String(e.externalListingId),url:String(e.listingUrl),provider:String(item.providerDisplayName||e.marketplace||"Connected source"),ask:Number(e.itemPriceCents)+Number(e.shippingCents)+Number(e.buyerPremiumCents)+Number(e.taxCents)};r.status="SELECTED";r.detail="First evaluation-eligible listing returned; selection locked for this run."}
async function evaluateRow(r){const requestId=("proof-"+r.data.evaluation_id.toLowerCase()+"-"+id("").replace(/[^A-Za-z0-9._-]/g,"")).slice(0,100);if(!SAFE_REQUEST.test(requestId))throw Error("Could not generate a safe Day-0 request ID.");const out=await jsonRequest(EVALUATE,{method:"POST",body:r.candidate.evaluationRequest,requestId});if(!validateMeta(out.payload,out.corr))throw Error("Evaluation response failed the FlipForge authority contract.");const d=out.payload.data,decision=d&&d.decision,isolation=d&&d.tenantIsolation;if(!d||!decision||!isolation||d.requestId!==requestId||d.persistedToSqlite!==true||d.tenantOwned!==true||d.transactionAuthorized!==false||isolation.enforced!==true||isolation.defaultAccess!=="DENY"||!DECISIONS.has(String(decision.recommendation||"").toUpperCase()))throw Error("Saved evaluation failed the tenant-owned Smart Opportunity contract.");r.requestId=requestId;r.opportunityId=String(d.opportunityId||"");r.decision=String(decision.recommendation||"").toUpperCase();r.confidence=Number(decision.confidence);r.risk=Number(decision.risk);r.status="COMPLETE";r.detail=(decision.exactTrustedCompCount??0)+" accepted exact comp(s) · immutable Day-0 snapshot saved"}
async function createCohort(){const requestIds=rows.map(r=>r.requestId);if(requestIds.length!==25||requestIds.some(v=>!SAFE_REQUEST.test(v)))throw Error("All 25 completed request IDs are required before cohort lock.");const out=await jsonRequest(COHORTS,{method:"POST",body:{cohortId:COHORT_ID,name:COHORT_NAME,requestIds}});if(!validateMeta(out.payload,out.corr))throw Error("Proof cohort response failed the FlipForge authority contract.");const d=out.payload.data;if(!d||d.kind!=="proof-cohort-detail"||d.cohortId!==COHORT_ID||d.immutable!==true||d.memberCount!==25||d.day0SnapshotCount!==25||d.originalDecisionsPreserved!==true)throw Error("Proof cohort did not confirm all 25 immutable Day-0 members.");return d}
async function loadText(text){try{rows=validateManifest(text);preflightComplete=false;cohort=null;ack.checked=false;cohortLink.classList.add("hidden");setProgress(0,25);setMessage("25 cards loaded. Validate them before any Day-0 evaluations are saved.");render()}catch(e){rows=[];preflightComplete=false;setMessage(e.message,"error");render()}}
file.addEventListener("change",async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;if(f.size>MAX_FILE){setMessage("CSV is too large.","error");return}loadText(await f.text())});
$("#official").addEventListener("click",()=>loadText(OFFICIAL));
$("#template").addEventListener("click",()=>download(OFFICIAL,"flipforge-proof-cohort-25.csv","text/csv"));
preflight.addEventListener("click",async()=>{if(busy||rows.length!==25)return;busy=true;preflightComplete=false;setMessage("Preflighting all 25 cards. No evaluations are being saved yet.");render();let failed=0;for(let i=0;i<rows.length;i++){const r=rows[i];r.status="CHECKING";r.detail="Searching connected active listings…";setProgress(i,25);render();try{await discoverRow(r)}catch(e){r.status="ERROR";r.detail=(e.code?e.code+": ":"")+e.message;failed++}setProgress(i+1,25);render()}busy=false;preflightComplete=failed===0;if(preflightComplete){setMessage("Preflight passed: all 25 cards have a deterministic first eligible listing. Review the table, acknowledge the study lock, then run Day 0.","success")}else{setMessage(failed+" card(s) failed preflight. No Day-0 cohort was created and no evaluations were submitted.","error")}render()});
ack.addEventListener("change",render);
run.addEventListener("click",async()=>{if(busy||!preflightComplete||!ack.checked||cohort)return;busy=true;setMessage("Running authoritative Day-0 evaluations. Do not close this page.");setProgress(0,26);render();let failed=false;for(let i=0;i<rows.length;i++){const r=rows[i];r.status="EVALUATING";r.detail="Submitting governed Smart Opportunity evaluation…";render();try{await evaluateRow(r)}catch(e){r.status="ERROR";r.detail=(e.code?e.code+": ":"")+e.message;failed=true;setMessage("Day 0 stopped at "+r.data.evaluation_id+". Completed rows remain saved, but the cohort was NOT locked.","error");break}setProgress(i+1,26);render()}if(!failed){try{cohort=await createCohort();setProgress(26,26);setMessage("FF-PROOF-001 is locked with all 25 immutable Day-0 snapshots. Automatic checkpoint collection can now take over.","success");cohortLink.href=COHORTS+"/"+encodeURIComponent(COHORT_ID);cohortLink.classList.remove("hidden")}catch(e){setMessage((e.code?e.code+": ":"")+e.message,"error")}}busy=false;render()});
audit.addEventListener("click",()=>{const headers=["evaluation_id","query","external_listing_id","listing_url","all_in_ask","request_id","opportunity_id","decision","confidence","risk"];const lines=[headers.join(",")].concat(rows.filter(r=>r.requestId).map(r=>[r.data.evaluation_id,r.query,r.candidate.externalId,r.candidate.url,(r.candidate.ask/100).toFixed(2),r.requestId,r.opportunityId,r.decision,r.confidence,r.risk].map(csvCell).join(",")));download(lines.join("\n"),"flipforge-FF-PROOF-001-day0-audit.csv","text/csv")});
function csvCell(v){const s=String(v??"");return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function download(text,name,type){const b=new Blob([text],{type:type+";charset=utf-8"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u)}
render();
})();
</script>
</body>
</html>`;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'"
    },
    body: html
  };
};
