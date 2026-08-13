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
<title>FlipForge | Bulk Evaluate</title>
<style>
:root{--bg:#07090d;--panel:#0e131a;--line:#25303d;--text:#f5f7fa;--muted:#98a4b3;--gold:#f6a916;--green:#27d17f;--blue:#61a8ff;--red:#ff8b8b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.banner{padding:9px 18px;background:#111722;border-bottom:1px solid var(--line);font-size:12px;letter-spacing:.04em}.banner strong{color:var(--gold);margin-right:10px}.shell{max-width:1280px;margin:auto;padding:20px}.top{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:20px}.brand{font-weight:900;letter-spacing:.08em}.brand span{color:var(--gold)}a{color:var(--blue)}.button,button{border:1px solid var(--line);border-radius:10px;background:#151c25;color:var(--text);padding:10px 14px;font:inherit;font-weight:750;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.primary{background:var(--gold);border-color:var(--gold);color:#15100a}.button:disabled,button:disabled{opacity:.45;cursor:not-allowed}.panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden}.head{padding:20px;border-bottom:1px solid var(--line)}h1{margin:4px 0 8px;font-size:30px}.head p,.note{margin:0;color:var(--muted)}.body{padding:20px;display:grid;gap:16px}.actions{display:flex;gap:10px;flex-wrap:wrap}.upload input{display:none}.ack{display:flex;gap:10px;align-items:flex-start;padding:13px;border:1px solid var(--line);border-radius:10px;background:#0a0f15}.ack input{margin-top:3px;accent-color:var(--gold)}.status{padding:12px 14px;border-radius:10px;background:#0a0f15;border:1px solid var(--line)}.error{border-color:#6b3333;color:#ffd0d0}.tablewrap{overflow:auto;border:1px solid var(--line);border-radius:12px}table{width:100%;border-collapse:collapse;min-width:780px}th,td{padding:11px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:11px;text-transform:uppercase;color:var(--muted);letter-spacing:.07em}td small{display:block;color:var(--muted);margin-top:3px}.pill{font-size:11px;font-weight:850;padding:4px 8px;border-radius:999px;background:#17202b}.complete{color:var(--green)}.running{color:var(--blue)}.failed{color:var(--red)}.boundary{padding:13px;border:1px solid #5c4619;background:#171309;border-radius:10px;color:#d5c18f}@media(max-width:700px){.shell{padding:12px}.top{align-items:flex-start;flex-direction:column}.actions>*{width:100%}}
</style>
</head>
<body>
<div class="banner"><strong>FLIPFORGE PRIVATE BETA</strong> Tenant-scoped decision intelligence · No transaction authority</div>
<div class="shell">
  <div class="top"><div class="brand">FLIP<span>FORGE</span> · BULK EVALUATE</div><a class="button" href="/app/#/evaluate">Back to Evaluate</a></div>
  <section class="panel">
    <div class="head"><div class="note">Guided batch intake</div><h1>Bulk Evaluate</h1><p>Upload up to 25 listing rows. Each row is submitted independently through FlipForge's existing authoritative evaluation endpoint.</p></div>
    <div class="body">
      <div class="boundary"><strong>Authority boundary:</strong> Smart Opportunity remains the sole BUY/WATCH/VERIFY/PASS authority. This page cannot verify identity or evidence and cannot authorize a purchase.</div>
      <div id="message" class="status">No CSV loaded. Download the template or upload your own CSV.</div>
      <div class="actions">
        <label class="button upload">Upload CSV<input id="file" type="file" accept=".csv,text/csv"></label>
        <button id="template" type="button">Download template</button>
        <button id="run" class="primary" type="button" disabled>Evaluate CSV</button>
      </div>
      <label class="ack"><input id="ack" type="checkbox"><span>I understand each CSV row is a separate governed evaluation, may use evaluation allowance, and successful results are saved to FlipForge.</span></label>
      <div id="results"></div>
    </div>
  </section>
</div>
<script>
(() => {
"use strict";
const ENDPOINT="/api/v1/evaluations",MAX_ROWS=25,MAX_FILE=256000;
const REQUIRED=["externalListingId","cardIdentity","listingUrl","itemPrice"];
const MARKETPLACES=new Set(["EBAY","COMC","MYSLABS","GOLDIN","HERITAGE","FANATICS_COLLECT","DEALER","CARD_SHOW","FACEBOOK_GROUP","OTHER"]);
const DECISIONS=new Set(["BUY","WATCH","VERIFY","PASS"]);
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;
let rows=[],running=false,completed=false;
const file=document.querySelector("#file"),run=document.querySelector("#run"),ack=document.querySelector("#ack"),message=document.querySelector("#message"),results=document.querySelector("#results");
const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
function uuid(prefix){const value=(crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2);return prefix+value}
function csv(text){const out=[];let row=[],field="",q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else q=false}else field+=c}else if(c==='"')q=true;else if(c===','){row.push(field);field=""}else if(c==='\n'){row.push(field.replace(/\r$/,"");out.push(row);row=[];field=""}else field+=c}if(q)throw Error("CSV has an unclosed quoted field.");if(field.length||row.length){row.push(field.replace(/\r$/,"");out.push(row)}return out.filter(r=>r.some(v=>String(v).trim()))}
function key(h){const n=String(h||"").replace(/^\uFEFF/,"").trim().toLowerCase().replace(/[\s_-]+/g,"");return({externallistingid:"externalListingId",listingid:"externalListingId",marketplace:"marketplace",cardidentity:"cardIdentity",card:"cardIdentity",listingurl:"listingUrl",url:"listingUrl",itemprice:"itemPrice",askprice:"itemPrice",price:"itemPrice",shipping:"shipping",buyerpremium:"buyerPremium",premium:"buyerPremium",tax:"tax",seller:"seller",listingformat:"listingFormat",format:"listingFormat",endsat:"endsAt",endtime:"endsAt"})[n]||""}
function cents(v,required,label){const t=String(v??"").trim();if(!t){if(required)throw Error(label+" is required.");return 0}if(!/^\d+(?:\.\d{1,2})?$/.test(t))throw Error(label+" must be a non-negative dollar amount with at most two decimals.");const p=t.split("."),n=(BigInt(p[0])*100n)+BigInt(((p[1]||"")+"00").slice(0,2));if(n>10000000000n)throw Error(label+" is outside the allowed range.");return Number(n)}
function payload(r){const d=r.data;const id=String(d.externalListingId||"").trim();if(!SAFE_ID.test(id))throw Error("External listing ID is missing or invalid.");const market=String(d.marketplace||"EBAY").trim().toUpperCase();if(!MARKETPLACES.has(market))throw Error("Unsupported marketplace: "+market);const card=String(d.cardIdentity||"").trim();if(!card)throw Error("Card identity is required.");const url=String(d.listingUrl||"").trim();let parsed;try{parsed=new URL(url)}catch(_){throw Error("Listing URL is invalid.")}if(!["http:","https:"].includes(parsed.protocol))throw Error("Listing URL must use HTTP or HTTPS.");return{externalListingId:id,marketplace:market,cardIdentity:card,listingUrl:url,seller:String(d.seller||"").trim(),itemPriceCents:cents(d.itemPrice,true,"Item price"),shippingCents:cents(d.shipping,false,"Shipping"),buyerPremiumCents:cents(d.buyerPremium,false,"Buyer premium"),taxCents:cents(d.tax,false,"Tax"),listingFormat:String(d.listingFormat||"").trim(),endsAt:String(d.endsAt||"").trim()}}
function render(){const ready=rows.filter(r=>r.status==="READY").length;run.disabled=running||completed||!ack.checked||!ready;run.textContent=running?"Evaluating…":completed?"Batch complete":ready?"Evaluate "+ready:"Evaluate CSV";if(!rows.length){results.innerHTML="";return}results.innerHTML='<div class="tablewrap"><table><thead><tr><th>Row</th><th>Card</th><th>Decision</th><th>Confidence</th><th>Risk</th><th>Status</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+r.number+'</td><td><strong>'+esc(r.data.cardIdentity||"—")+'</strong><small>'+esc(r.detail||"")+'</small></td><td>'+esc(r.decision||"—")+'</td><td>'+esc(r.confidence||"—")+'</td><td>'+esc(r.risk||"—")+'</td><td><span class="pill '+(r.status==="COMPLETE"?"complete":r.status==="ERROR"?"failed":r.status==="RUNNING"?"running":"")+'">'+esc(r.status)+'</span></td></tr>').join("")+'</tbody></table></div>'}
async function load(f){rows=[];completed=false;message.className="status";if(!f)return render();if(f.size>MAX_FILE){message.className="status error";message.textContent="CSV is too large. Keep the batch to 25 rows.";return render()}try{const rec=csv(await f.text());if(rec.length<2)throw Error("CSV needs a header row and at least one card.");const headers=rec[0].map(key),missing=REQUIRED.filter(k=>!headers.includes(k));if(missing.length)throw Error("Missing required columns: "+missing.join(", "));if(rec.length-1>MAX_ROWS)throw Error("Bulk Evaluate accepts up to 25 cards per CSV.");rows=rec.slice(1).map((vals,i)=>{const d={marketplace:"EBAY"};headers.forEach((h,c)=>{if(h)d[h]=String(vals[c]??"").trim()});const r={number:i+2,data:d,status:"READY",detail:"",decision:"",confidence:"",risk:""};try{payload(r)}catch(e){r.status="ERROR";r.detail=e.message}return r});const invalid=rows.filter(r=>r.status==="ERROR").length;message.className=invalid?"status error":"status";message.textContent=invalid?invalid+" row(s) need correction. Upload a corrected CSV.":rows.length+" card(s) ready."}catch(e){rows=[];message.className="status error";message.textContent=e.message}render()}
async function submit(r){const body=payload(r),correlation=uuid("bulk-corr-"),requestId=uuid("bulk-eval-");const response=await fetch(ENDPOINT,{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json; charset=utf-8","X-Correlation-Id":correlation,"Idempotency-Key":requestId},body:JSON.stringify(body),credentials:"same-origin",cache:"no-store",redirect:"error"});const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch(_){throw Error("Evaluation gateway returned invalid JSON.")}if(!response.ok){const e=data&&data.error?data.error:{};const err=Error(e.message||"Evaluation failed with status "+response.status);err.status=response.status;err.code=e.code||"EVALUATION_FAILED";throw err}const d=data.data,decision=d&&d.decision,isolation=d&&d.tenantIsolation,meta=data.meta;if(!meta||!d||!decision||!isolation||meta.authority!=="Smart Opportunity"||meta.gradingAuthority!=="Existing PSA intelligence"||meta.correlationId!==correlation||d.requestId!==requestId||d.persistedToSqlite!==true||d.tenantOwned!==true||d.transactionAuthorized!==false||isolation.enforced!==true||isolation.defaultAccess!=="DENY"||!DECISIONS.has(String(decision.recommendation||"").toUpperCase()))throw Error("Evaluation response failed the FlipForge authority contract.");return data}
file.addEventListener("change",e=>load(e.target.files&&e.target.files[0]));ack.addEventListener("change",render);document.querySelector("#template").addEventListener("click",()=>{const h="externalListingId,marketplace,cardIdentity,listingUrl,itemPrice,shipping,buyerPremium,tax,seller,listingFormat,endsAt\n123456789012,EBAY,2018 Topps Chrome Shohei Ohtani #150 PSA 10,https://www.ebay.com/itm/123456789012,525.00,0,0,0,,,";const b=new Blob([h],{type:"text/csv;charset=utf-8"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="flipforge-bulk-evaluate-template.csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u)});
run.addEventListener("click",async()=>{if(running||completed||!ack.checked||rows.some(r=>r.status==="ERROR"))return;running=true;render();for(const r of rows){if(r.status!=="READY")continue;r.status="RUNNING";r.detail="Submitting authoritative evaluation…";render();try{const out=await submit(r),d=out.data.decision;r.status="COMPLETE";r.decision=String(d.recommendation||"").toUpperCase();r.confidence=Number.isFinite(Number(d.confidence))?Number(d.confidence)+"/100":"—";r.risk=Number.isFinite(Number(d.risk))?Number(d.risk)+"/100":"—";r.detail=(d.exactTrustedCompCount??0)+" accepted exact comp(s) · saved to SQLite"}catch(e){r.status="ERROR";r.detail=(e.code?e.code+": ":"")+e.message;if([401,403,429].includes(e.status)){message.className="status error";message.textContent="Batch stopped for account access or evaluation allowance. Completed rows remain saved.";break}}render()}running=false;completed=!rows.some(r=>r.status==="READY");if(completed&&!rows.some(r=>r.status==="ERROR")){message.className="status";message.textContent="Batch complete. Successful rows are saved in FlipForge."}render()});render();
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
      "Referrer-Policy": "same-origin"
    },
    body: html
  };
};
