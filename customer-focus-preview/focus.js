(() => {
  "use strict";
  // Presentation-only interactive concept. No network requests, storage, pricing or auth.
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const scenarios = Object.freeze([
    {id:"watch",verdict:"WATCH",title:"Illustrative Card A · PSA 10",subtitle:"Sample exact-card identity · fictional evaluation",short:"Sample Card A",ask:"$640.00",max:"$608.79",difference:"$31.21 above Max Buy",summary:"Asking price exceeds the modeled buying limit.",next:"Wait or revisit if the asking price improves.",evidence:"12 exact sales",accepted:"12",excluded:"Unavailable",identity:"Exact match confirmed",confidence:"82/100",risk:"35/100",why:"The asking price is above the modeled limit. A positive supported value alone does not make this a BUY.",base:"+$82",cautious:"+$24",downside:"−$41",supported:"$812.50"},
    {id:"verify",verdict:"VERIFY",title:"Illustrative Card B · PSA 9",subtitle:"Identity confirmation still required · fictional evaluation",short:"Sample Card B",ask:"$425.00",max:"Not established",difference:"Buying limit withheld until the identity is verified",summary:"Not enough verified evidence for a buying recommendation.",next:"Confirm the exact parallel and grade before deciding.",evidence:"Exact sales not established",accepted:"Not established",excluded:"Unavailable",identity:"Needs confirmation",confidence:"—",risk:"—",why:"FlipForge has not established an exact match. It withholds a supported value and buying limit rather than filling gaps.",base:"Not calculated",cautious:"Not calculated",downside:"Not calculated",supported:"Not established"},
    {id:"pass",verdict:"PASS",title:"Illustrative Card C · PSA 10",subtitle:"Conservative outcome is unfavorable · fictional evaluation",short:"Sample Card C",ask:"$940.00",max:"$790.00",difference:"$150.00 above Max Buy",summary:"The asking price exceeds the modeled limit.",next:"Pass on this listing at the current price.",evidence:"3 exact sales",accepted:"3",excluded:"Unavailable",identity:"Exact match confirmed",confidence:"63/100",risk:"71/100",why:"The modeled downside does not justify the current cost. The saved verdict remains PASS.",base:"+$25",cautious:"−$46",downside:"−$118",supported:"$865.00"}
  ]);
  const toolNames={"forge-heat":"Forge Heat","portfolio":"Portfolio","compare":"Compare Cards","psa":"PSA Advisor","market":"Market View","alerts":"Alerts","export":"Audit Export"};
  const setText=(id,value)=>{$("#"+id).textContent=value;};
  let activeScenario="watch";
  let activeTab="decision";
  const labelList={home:"Home",discover:"Discover",evaluate:"Evaluate",saved:"Saved Decisions",tracking:"Tracking",...toolNames};
  const openCard=(id)=>{
    const card=scenarios.find(c=>c.id===id); if(!card) return;
    activeScenario=id;
    setText("verdict-label",card.verdict);
    $("#verdict-label").dataset.verdict=card.verdict;
    for(const [key,v] of [["card-title",card.title],["card-subtitle",card.subtitle],["ask-price",card.ask],["max-buy",card.max],["price-difference",card.difference],["verdict-summary",card.summary],["next-move",card.next],["evidence-peek",card.evidence],["confidence",card.confidence],["risk",card.risk],["decision-reason",card.why],["accepted-sales",card.accepted],["excluded-sales",card.excluded],["identity-state",card.identity],["econ-base",card.base],["econ-cautious",card.cautious],["econ-downside",card.downside],["supported-value",card.supported]]){
      if(key==="price-difference"){const el=$("#price-difference");el.replaceChildren();const s=document.createElement("span");s.className="difference-mark";s.textContent="↗";el.append(s,document.createTextNode(v));}
      else setText(key,v);
    }
    $$(".scenario-line").forEach(el=>el.classList.toggle("negative",el.querySelector("strong")?.textContent.trim().startsWith("−")));
    $$("[data-scenario]").forEach(el=>{const selected=el.dataset.scenario===id;el.classList.toggle("is-selected",selected);el.setAttribute("aria-pressed",String(selected));});
    $("#decision-card .quiet-details").open=false;
    $("#panel-decision h3").textContent=`Why ${card.verdict}?`;
    activateTab("decision",false);
  };
  const activateTab=(name,focus=false)=>{
    activeTab=name;
    $$("[role=tab]").forEach(t=>{const on=t.dataset.tab===name;t.setAttribute("aria-selected",String(on));t.tabIndex=on?0:-1;if(on&&focus)t.focus();});
    $$("[role=tabpanel]").forEach(p=>p.hidden=p.id!==`panel-${name}`);
  };
  const renderLists=()=>{
    const rows=scenarios.map(c=>`<button type="button" data-scenario="${c.id}" aria-pressed="false" class="saved-item"><span class="saved-item-body"><span class="saved-item-kicker">${c.verdict}</span><span class="saved-item-title">${c.short}</span><span class="saved-item-sub">Ask ${c.ask} · Illustrative</span></span><span class="saved-item-arrow" aria-hidden="true">↗</span></button>`).join("");
    $("#decision-list").innerHTML=rows;
    $("#saved-grid").innerHTML=rows;
    $$("[data-scenario]").forEach(el=>el.addEventListener("click",()=>{openCard(el.dataset.scenario);if(!$("[data-page=home]").hidden && el.closest("#decision-list")) return;location.hash="#home";}));
  };
  const closeMenu=()=>{$("#sidebar").classList.remove("open");$(".mobile-scrim").classList.remove("open");$(".mobile-scrim").hidden=true;$(".menu-toggle").setAttribute("aria-expanded","false");};
  const renderPage=()=>{
    const name=(location.hash||"#home").slice(1).replace(/[^a-z-]/g,"")||"home";
    const active=Object.hasOwn(toolNames,name)?"tool":$("[data-page='"+name+"']")?name:"home";
    $$("[data-page]").forEach(p=>p.hidden=p.dataset.page!==active);
    $$("[data-nav]").forEach(a=>{const selected=a.dataset.nav===name;a.classList.toggle("is-active",selected);if(selected)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");});
    if(active==="tool"){$("#tool-title").textContent=toolNames[name]||"More Tools";$("#tool-description").textContent=`${toolNames[name]||"This tool"} remains available in the full FlipForge product. This design preview shows its location, not live functionality.`;$("#more-tools").open=true;}
    setText("current-page-label",labelList[name]||"Home");closeMenu();
  };
  renderLists();openCard("watch");
  $("[data-open-evidence]").addEventListener("click",()=>{
    activateTab("evidence",true);
    $("#tab-evidence").scrollIntoView({block:"nearest",behavior:"instant"});
  });
  $$("[role=tab]").forEach(tab=>{tab.addEventListener("click",()=>activateTab(tab.dataset.tab));tab.addEventListener("keydown",evt=>{const keys=["ArrowRight","ArrowLeft","Home","End"];if(!keys.includes(evt.key))return;evt.preventDefault();const ids=["decision","evidence","economics"];let i=ids.indexOf(activeTab);i=evt.key==="Home"?0:evt.key==="End"?2:(i+(evt.key==="ArrowRight"?1:-1)+3)%3;activateTab(ids[i],true);});});
  $(".menu-toggle").addEventListener("click",()=>{const opened=!$("#sidebar").classList.contains("open");$("#sidebar").classList.toggle("open",opened);$(".mobile-scrim").hidden=!opened;$(".mobile-scrim").classList.toggle("open",opened);$(".menu-toggle").setAttribute("aria-expanded",String(opened));});
  $(".mobile-scrim").addEventListener("click",closeMenu);
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeMenu();});
  $$("[data-go]").forEach(b=>b.addEventListener("click",()=>location.hash=""+b.dataset.go));
  window.addEventListener("hashchange",renderPage);renderPage();
})();