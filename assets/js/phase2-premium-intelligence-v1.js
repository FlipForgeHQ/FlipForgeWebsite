/* FlipForge Phase 2 premium intelligence rollout */
(() => {
  'use strict';
  const path=(location.pathname||'/').replace(/\/+$/,'')||'/';
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body=document.body;
  if(!body)return;
  body.classList.add('ff-phase2-public','ff-phase2-ready');

  const emit=(event,placement='phase2')=>{
    const payload=JSON.stringify({event,page:path,placement});
    try{
      if(navigator.sendBeacon){
        const ok=navigator.sendBeacon('/api/conversion-event',new Blob([payload],{type:'application/json'}));
        if(ok)return;
      }
      fetch('/api/conversion-event',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,credentials:'same-origin',cache:'no-store',keepalive:true}).catch(()=>{});
    }catch(_){}
  };

  const reveal=[...document.querySelectorAll('main>section,.section,.ff-dic-heading,.ff-dic-system,.ff-lab-card,.callout')];
  reveal.forEach((el,i)=>{
    el.classList.add('ff-phase2-reveal');
    if(el.matches('.ff-dic-system,.ff-lab-card,.card,article'))el.classList.add('ff-phase2-hover');
    el.style.setProperty('--ff-p2-i',String(i%8));
  });
  if(reduced)reveal.forEach(el=>el.classList.add('is-visible'));
  else{
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('is-visible')}),{threshold:.12,rootMargin:'0px 0px -8% 0px'});
    reveal.forEach(el=>io.observe(el));
  }

  const systemFor=(n)=>n<=3?'card':n<=7?'market':n<=10?'decision':'learn';
  const layerCopy={
    0:['Release Intelligence','Confirm the real release before any checklist assumption.'],
    1:['Taxonomy Intelligence','Know which card structures and variants are valid for that release.'],
    2:['Identity Intelligence','Resolve the exact card instead of accepting a near match.'],
    3:['Identity Provenance + Trust','Preserve why each identity field can be trusted.'],
    4:['Evidence Intelligence','Decide which market observations deserve authority.'],
    5:['Market + Economic Intelligence','Translate qualified evidence into supported economics.'],
    6:['Product + Variant Intelligence','Keep product and variant behavior evidence-grounded.'],
    7:['Grade + Scarcity Intelligence','Use grade and scarcity context without inventing certainty.'],
    8:['Risk + Uncertainty Intelligence','Keep thin, stale, conflicting, or incomplete evidence visible.'],
    9:['Decision Intelligence','Resolve to BUY, WATCH, VERIFY, or PASS.'],
    10:['Decision Traceback / Receipt','Preserve what was used, rejected, and why.'],
    11:['Outcome Intelligence','Review what happened later without rewriting the original decision.'],
    12:['Governance + Continuous Intelligence','Version change, preserve boundaries, and improve only when evidence supports it.']
  };

  function buildCdiTheater(){
    if(!/decision-intelligence\.html$/.test(path))return;
    const model=document.querySelector('.ff-dic-model');
    const section=model?.closest('.ff-dic-simple');
    if(!model||!section||document.querySelector('.ff-phase2-cdi-theater'))return;

    const signals=[
      {key:'identity',kicker:'IDENTITY',value:'CONFIRMED',detail:'Exact card resolved',level:100,role:'GATE',copy:'Identity must be exact before market evidence can receive authority.'},
      {key:'evidence',kicker:'EVIDENCE',value:'2 / 7',detail:'exact sales retained',level:29,role:'AUTHORITY',copy:'Two exact completed sales remain. Five comparison candidates stay visible but lose decision authority.'},
      {key:'economics',kicker:'ECONOMICS',value:'2.3%',detail:'supported edge',level:23,role:'CONTEXT',copy:'The apparent 24% bargain collapses to a 2.3% supported edge after invalid comparisons are removed.'},
      {key:'confidence',kicker:'CONFIDENCE',value:'60 / 100',detail:'calibrated support',level:60,role:'QUALITY',copy:'Confidence reflects the quality and depth of the governed evidence. It cannot create a verdict by itself.'},
      {key:'risk',kicker:'RISK',value:'70 / 100',detail:'uncertainty retained',level:70,role:'SAFETY',copy:'Risk keeps thin evidence and unresolved uncertainty visible instead of allowing the price gap to dominate.'},
      {key:'heat',kicker:'FORGE HEAT',value:'WITHHELD',detail:'decision is VERIFY',level:0,role:'AFTER THE DECISION',copy:'Forge Heat ranks already-saved BUY or WATCH opportunities. It never feeds or changes the Smart Opportunity verdict.'}
    ];

    const shell=document.createElement('section');
    shell.className='ff-phase2-cdi-theater ff-cdi-signature';
    shell.dataset.activeSignal='evidence';
    shell.dataset.phase='settled';
    shell.setAttribute('aria-labelledby','ff-cdi-signature-title');
    const nodes=signals.map((signal,index)=>{
      const gauge=signal.key==='identity'
        ? '<span class="ff-cdi-sig-status-dot" aria-hidden="true"></span>'
        : signal.key==='heat'
          ? '<span class="ff-cdi-sig-after-mark" aria-hidden="true">↗</span>'
          : '<svg class="ff-cdi-sig-mini-gauge" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="17" pathLength="100"></circle><circle class="meter" cx="22" cy="22" r="17" pathLength="100" stroke-dasharray="100" stroke-dashoffset="'+(100-signal.level)+'"></circle></svg>';
      return '<button type="button" class="ff-cdi-sig-node" data-signal="'+signal.key+'" data-node-index="'+index+'" aria-pressed="'+(signal.key==='evidence'?'true':'false')+'">'+
        '<span class="ff-cdi-sig-node-visual">'+gauge+'</span>'+
        '<span class="ff-cdi-sig-node-copy"><small>'+signal.kicker+'</small><strong>'+signal.value+'</strong><em>'+signal.detail+'</em></span>'+
      '</button>';
    }).join('');

    shell.innerHTML=
      '<header class="ff-cdi-sig-head">'+
        '<div><small>CARD DECISION INTELLIGENCE™ · SIGNATURE ENGINE</small><h2 id="ff-cdi-signature-title">Watch the decision form.</h2><p>Not another scorecard. FlipForge shows which governed signals are allowed to reach the verdict—and which are stopped.</p></div>'+
        '<span class="ff-cdi-sig-example">ILLUSTRATIVE REPLAY · NO LIVE MARKET DATA</span>'+
      '</header>'+
      '<div class="ff-cdi-sig-stage">'+
        '<svg class="ff-cdi-sig-wires" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">'+
          '<path data-wire="identity" d="M210 120 C350 120 365 260 475 300"></path>'+
          '<path data-wire="evidence" d="M790 120 C650 120 635 260 525 300"></path>'+
          '<path data-wire="economics" d="M155 330 C310 330 360 330 445 325"></path>'+
          '<path data-wire="confidence" d="M845 330 C690 330 640 330 555 325"></path>'+
          '<path data-wire="risk" d="M235 540 C355 510 390 400 465 360"></path>'+
          '<path class="ff-cdi-sig-wire-after" data-wire="heat" d="M535 360 C625 420 675 505 790 540"></path>'+
        '</svg>'+
        '<div class="ff-cdi-sig-orbit" aria-hidden="true"><span></span><span></span><span></span></div>'+
        '<div class="ff-cdi-sig-core" data-ff-cdi-core>'+
          '<span class="ff-cdi-sig-core-kicker">SMART OPPORTUNITY</span>'+
          '<div class="ff-cdi-sig-core-mark"><img src="assets/brand/flipforge-mark.svg" alt=""></div>'+
          '<strong data-ff-cdi-core-verdict>VERIFY</strong>'+
          '<small>governed verdict</small>'+
        '</div>'+
        nodes+
        '<aside class="ff-cdi-sig-inspector" aria-live="polite">'+
          '<span data-ff-cdi-signal-role>AUTHORITY</span>'+
          '<strong data-ff-cdi-signal-title>EVIDENCE · 2 / 7</strong>'+
          '<p data-ff-cdi-signal-copy>Two exact completed sales remain. Five comparison candidates stay visible but lose decision authority.</p>'+
        '</aside>'+
      '</div>'+
      '<div class="ff-cdi-sig-replay">'+
        '<div class="ff-cdi-sig-shift">'+
          '<span><small>HEADLINE</small><strong data-ff-cdi-apparent>24%</strong><em>apparent discount</em></span>'+
          '<i aria-hidden="true">→</i>'+
          '<span><small>AFTER EVIDENCE</small><strong data-ff-cdi-supported>2.3%</strong><em>supported edge</em></span>'+
          '<i aria-hidden="true">→</i>'+
          '<span class="ff-cdi-sig-shift-decision"><small>SMART OPPORTUNITY</small><strong>VERIFY</strong><em>final governed call</em></span>'+
        '</div>'+
        '<button type="button" class="ff-cdi-sig-replay-button" data-ff-cdi-replay>Replay the evidence challenge</button>'+
      '</div>'+
      '<div class="ff-cdi-sig-flow" aria-label="Governed decision sequence">'+
        '<span>IDENTITY</span><i>→</i><span>EVIDENCE</span><i>→</i><span>ECONOMICS</span><i>→</i><span>CONFIDENCE + RISK</span><i>→</i><strong>SMART OPPORTUNITY</strong>'+
        '<b>THEN</b><span class="is-after">FORGE HEAT · ATTENTION RANKING</span>'+
      '</div>'+
      '<footer class="ff-cdi-sig-boundary"><strong>Forge Heat comes after the decision.</strong><span>It can rank saved BUY/WATCH opportunities for attention. It cannot create, upgrade, downgrade, or replace BUY / WATCH / VERIFY / PASS.</span></footer>';

    section.before(shell);
    section.classList.add('ff-cdi-reference');
    const buttons=[...shell.querySelectorAll('[data-signal]')];
    const role=shell.querySelector('[data-ff-cdi-signal-role]');
    const title=shell.querySelector('[data-ff-cdi-signal-title]');
    const copy=shell.querySelector('[data-ff-cdi-signal-copy]');
    const verdict=shell.querySelector('[data-ff-cdi-core-verdict]');
    const replay=shell.querySelector('[data-ff-cdi-replay]');
    let replayToken=0;

    const activate=(key,track=true)=>{
      const signal=signals.find(item=>item.key===key)||signals[0];
      shell.dataset.activeSignal=signal.key;
      buttons.forEach(button=>button.setAttribute('aria-pressed',button.dataset.signal===signal.key?'true':'false'));
      role.textContent=signal.role;
      title.textContent=signal.kicker+' · '+signal.value;
      copy.textContent=signal.copy;
      if(track){
        emit('cdi_signal_selected',signal.key);
        emit('cdi_layer_viewed','signal_'+signal.key);
      }
    };

    buttons.forEach(button=>{
      button.addEventListener('click',()=>activate(button.dataset.signal));
      button.addEventListener('pointerenter',()=>{if(matchMedia('(hover:hover)').matches)activate(button.dataset.signal,false)});
      button.addEventListener('focus',()=>activate(button.dataset.signal,false));
    });

    const settle=token=>{
      if(token!==replayToken)return;
      shell.dataset.phase='settled';
      verdict.textContent='VERIFY';
      activate('evidence',false);
    };
    replay?.addEventListener('click',()=>{
      const token=++replayToken;
      emit('cdi_signal_replay_started','public_signature_engine');
      shell.dataset.phase='headline';
      verdict.textContent='CHECK';
      activate('economics',false);
      if(reduced){settle(token);return}
      window.setTimeout(()=>{if(token!==replayToken)return;shell.dataset.phase='screening';activate('evidence',false)},620);
      window.setTimeout(()=>{if(token!==replayToken)return;shell.dataset.phase='quality';activate('risk',false)},1320);
      window.setTimeout(()=>settle(token),2060);
    });

    activate('evidence',false);
  }

  const failures=[
    ['wrong-parallel','WRONG PARALLEL','Same player and product. Different card market.','Target: Silver parallel','Candidate: White Sparkle parallel','Reject the candidate from exact-comp authority.'],
    ['thin-comp','THIN COMP','One exact sale is still one observation.','1 exact completed sale','No corroborating exact sales','Keep confidence and liquidity risk visible.'],
    ['stale-comp','STALE COMP','A real sale can become weak evidence when timing changes relevance.','Older completed sale','Current market context moved','Treat as context, not unquestioned authority.'],
    ['identity-conflict','IDENTITY CONFLICT','A card number, insert, or set conflict means the identity is not settled.','Requested identity','Provider context disagrees','Fail closed and VERIFY instead of guessing.'],
    ['one-comp','ONE-COMP RISK','A single clean comp can support context without pretending the market is deep.','Exact evidence found','Evidence depth remains thin','Preserve uncertainty in the decision.'],
    ['best-grade','BEST-CASE GRADE','A top-grade headline should not erase realistic grading outcomes.','PSA 10 scenario','Lower-grade economics differ','Keep grading economics separate from wishful value.']
  ];
  function buildEvidenceTheater(){
    if(!/learn\.html$/.test(path))return;
    const directory=document.querySelector('.ff-lab-directory');
    if(!directory||document.querySelector('.ff-phase2-evidence-theater'))return;
    const section=document.createElement('section');
    section.className='ff-phase2-evidence-theater';
    section.setAttribute('aria-labelledby','ff-phase2-evidence-title');
    const buttons=failures.map((f,i)=>'<button type="button" role="tab" aria-selected="'+(i===0?'true':'false')+'" data-ff-p2-failure="'+i+'">'+f[1]+'<span>'+String(i+1).padStart(2,'0')+'</span></button>').join('');
    section.innerHTML='<div class="ff-phase2-evidence-head"><div><small>INTERACTIVE EVIDENCE FAILURE THEATER</small><h2 id="ff-phase2-evidence-title">See how false confidence gets built.</h2></div><p>Pick a failure mode. The point is not to hide bad evidence—it is to show why it cannot control the decision.</p></div><div class="ff-phase2-evidence-grid"><div class="ff-phase2-evidence-menu" role="tablist" aria-label="Evidence failure modes">'+buttons+'</div><div class="ff-phase2-evidence-stage" role="tabpanel" aria-live="polite"><small data-ff-p2-failure-kicker>FAILURE MODE 01</small><h3 data-ff-p2-failure-title></h3><p data-ff-p2-failure-copy></p><div class="ff-phase2-evidence-visual"><article class="ff-phase2-evidence-card"><span>TARGET / TRUSTED CONTEXT</span><strong data-ff-p2-left></strong><p>What FlipForge is actually trying to evaluate.</p></article><div class="ff-phase2-evidence-arrow">→</div><article class="ff-phase2-evidence-card is-rejected"><span>CANDIDATE / RISK</span><strong data-ff-p2-right></strong><p>This evidence stays visible but loses exact-comp authority.</p></article></div><div class="ff-phase2-evidence-result"><strong>FLIPFORGE RESPONSE</strong><br><span data-ff-p2-result></span></div></div></div>';
    directory.after(section);
    const menu=[...section.querySelectorAll('[data-ff-p2-failure]')];
    const title=section.querySelector('[data-ff-p2-failure-title]');
    const copy=section.querySelector('[data-ff-p2-failure-copy]');
    const left=section.querySelector('[data-ff-p2-left]');
    const right=section.querySelector('[data-ff-p2-right]');
    const result=section.querySelector('[data-ff-p2-result]');
    const kicker=section.querySelector('[data-ff-p2-failure-kicker]');
    const select=i=>{
      const f=failures[i];
      menu.forEach((b,j)=>b.setAttribute('aria-selected',j===i?'true':'false'));
      kicker.textContent='FAILURE MODE '+String(i+1).padStart(2,'0');
      title.textContent=f[1];
      copy.textContent=f[2];
      left.textContent=f[3];
      right.textContent=f[4];
      result.textContent=f[5];
      emit('evidence_failure_selected',f[0]);
    };
    menu.forEach((b,i)=>b.addEventListener('click',()=>select(i)));
    select(0);
  }

  function buildProductReceipt(){
    if(!/product\\.html$/.test(path))return;
    if(document.querySelector('.ff-phase2-product-receipt'))return;
    const anchor=document.querySelector('#identity-simulator')||document.querySelector('main>.section:nth-last-of-type(1)');
    if(!anchor)return;
    const layers=[
      ['identity','01','IDENTITY','Prove the exact card.','Release, set, card number, parallel, grade, and other identity fields must belong to the same card before evidence gets authority.'],
      ['evidence','02','EVIDENCE','Show what counted — and what did not.','The receipt keeps trusted evidence separate from excluded or unresolved rows so confidence is inspectable instead of implied.'],
      ['economics','03','ECONOMICS','Preserve the evaluated price context.','The evaluated ask and any supported value remain tied to the governed evidence state that existed when the decision was returned.'],
      ['risk','04','RISK + UNCERTAINTY','Keep uncertainty visible.','Confidence, risk, thin evidence, identity conflicts, and unresolved conditions stay part of the reason trail rather than disappearing behind the call.'],
      ['decision','05','DECISION','Keep the governed call beside the reason.','BUY, WATCH, VERIFY, or PASS remains the authoritative decision state; the receipt explains the context without creating a second recommendation.'],
      ['receipt','06','TRACEBACK','Freeze the reason trail.','The Decision Receipt keeps identity, evidence, economics, uncertainty, decision context, and provenance together for later inspection.'],
      ['outcome','07','OUTCOME','Compare later without rewriting the past.','T7, T14, and T30 review can be compared with the original receipt while the original decision remains historically intact.']
    ];
    const section=document.createElement('section');
    section.className='ff-phase2-product-receipt ff-phase3-product-receipt';
    section.setAttribute('aria-labelledby','ff-p2-product-receipt-title');
    section.innerHTML='<div class="ff-phase2-product-receipt-head"><div><small>PHASE 3 · SIGNATURE PRODUCT OBJECT</small><h2 id="ff-p2-product-receipt-title">The Decision Receipt makes the reasoning tangible.</h2><p>FlipForge preserves the reason trail so a decision can be inspected later — not just remembered after the outcome is known.</p></div><span class="ff-phase3-product-receipt-note">ILLUSTRATIVE ANATOMY · NO LIVE MARKET DATA</span></div>'+
      '<div class="ff-phase2-product-receipt-shell ff-phase3-product-receipt-shell" data-ff-p3-product-receipt>'+
        '<div class="ff-phase3-product-receipt-brand"><img src="assets/brand/flipforge-logo-horizontal.svg" alt="FlipForge — Card Decision Intelligence — Before you buy. Know Why."><div><span>DECISION RECEIPT</span><strong>VERIFY</strong><small>Example decision state</small></div></div>'+
        '<div class="ff-phase3-product-receipt-layout">'+
          '<div class="ff-phase3-product-receipt-tabs" role="tablist" aria-label="Decision Receipt layers">'+layers.map((layer,i)=>'<button type="button" role="tab" id="ff-p3-receipt-tab-'+i+'" aria-controls="ff-p3-receipt-panel" aria-selected="'+(i===0?'true':'false')+'" data-ff-p3-receipt-layer="'+layer[0]+'"><b>'+layer[1]+'</b><span>'+layer[2]+'</span></button>').join('')+'</div>'+
          '<div class="ff-phase3-product-receipt-reveal" id="ff-p3-receipt-panel" role="tabpanel" aria-live="polite" aria-labelledby="ff-p3-receipt-tab-0" data-ff-p3-receipt-panel>'+
            '<span data-ff-p3-receipt-number></span><small data-ff-p3-receipt-label></small><h3 data-ff-p3-receipt-title></h3><p data-ff-p3-receipt-copy></p>'+
            '<div class="ff-phase3-product-receipt-stamp"><span>CARD DECISION INTELLIGENCE™</span><strong>Before you buy. Know Why.</strong></div>'+
          '</div>'+
        '</div>'+
        '<div class="ff-phase3-product-receipt-support"><article><span>WHAT IT PRESERVES</span><p>Identity, governed evidence, economics, uncertainty, decision state, provenance, and the observation context stay together.</p></article><article><span>WHAT IT DOES NOT DO</span><p>It does not authorize a purchase, guarantee an outcome, invent evidence, or rewrite the original call after later events.</p></article></div>'+
        '<div class="ff-phase2-product-receipt-actions"><a class="btn primary" href="decision-intelligence.html" data-ff-p2-receipt-cta>See Card Decision Intelligence</a><a class="btn" href="/app/#/discover" data-ff-p2-evaluate-cta>Evaluate a Card</a></div>'+
      '</div>';
    anchor.before(section);
    const tabs=[...section.querySelectorAll('[data-ff-p3-receipt-layer]')];
    const panel=section.querySelector('[data-ff-p3-receipt-panel]');
    const number=section.querySelector('[data-ff-p3-receipt-number]');
    const label=section.querySelector('[data-ff-p3-receipt-label]');
    const title=section.querySelector('[data-ff-p3-receipt-title]');
    const copy=section.querySelector('[data-ff-p3-receipt-copy]');
    const select=i=>{
      const layer=layers[i];
      tabs.forEach((tab,j)=>{
        tab.setAttribute('aria-selected',j===i?'true':'false');
        tab.setAttribute('tabindex',j===i?'0':'-1');
      });
      panel.setAttribute('aria-labelledby','ff-p3-receipt-tab-'+i);
      panel.setAttribute('data-layer',layer[0]);
      number.textContent=layer[1];
      label.textContent=layer[2];
      title.textContent=layer[3];
      copy.textContent=layer[4];
      const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
      if(!reduceMotion&&typeof panel.animate==='function'){
        panel.animate([{opacity:.58,transform:'translateY(5px)'},{opacity:1,transform:'none'}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)'});
      }
      emit('decision_receipt_layer_selected',layer[0]);
    };
    tabs.forEach((tab,i)=>{
      tab.addEventListener('click',()=>select(i));
      tab.addEventListener('keydown',event=>{
        if(!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(event.key))return;
        event.preventDefault();
        let next=i;
        if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(i+1)%tabs.length;
        if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(i-1+tabs.length)%tabs.length;
        if(event.key==='Home')next=0;
        if(event.key==='End')next=tabs.length-1;
        tabs[next].focus();
        select(next);
      });
    });
    select(0);
    section.querySelector('[data-ff-p2-receipt-cta]')?.addEventListener('click',()=>emit('decision_receipt_cta_clicked','product_receipt'));
    section.querySelector('[data-ff-p2-evaluate-cta]')?.addEventListener('click',()=>emit('evaluate_cta_clicked','product_receipt'));
  }

  buildCdiTheater();
  buildEvidenceTheater();
  buildProductReceipt();

  document.querySelectorAll('a[href*="beta-application"]').forEach(a=>a.addEventListener('click',()=>emit('phase2_beta_cta_clicked','public_rollout')));
})();