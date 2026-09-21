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
    const shell=document.createElement('section');
    shell.className='ff-phase2-cdi-theater';
    shell.dataset.system='card';
    shell.setAttribute('aria-labelledby','ff-phase2-cdi-title');
    const steps=Object.keys(layerCopy).map(Number).map(n=>{
      const [title,copy]=layerCopy[n];
      return '<article class="ff-phase2-cdi-step" data-layer-number="'+String(n).padStart(2,'0')+'" data-layer="'+n+'" tabindex="0"><small>'+systemFor(n).toUpperCase()+'</small><h3>'+title+'</h3><p>'+copy+'</p></article>';
    }).join('');
    shell.innerHTML='<div class="ff-phase2-cdi-theater-head"><div><small>THE GOVERNED DECISION ENGINE</small><h2 id="ff-phase2-cdi-title">One decision. Thirteen checkpoints.</h2></div><p>Scroll the system. Every layer can preserve uncertainty or stop authority from moving downstream.</p></div><div class="ff-phase2-cdi-grid"><aside class="ff-phase2-cdi-sticky"><div class="ff-phase2-cdi-aperture"><div class="ff-phase2-cdi-core"><img src="assets/brand/flipforge-mark.svg" alt=""></div></div><div class="ff-phase2-cdi-status"><small data-ff-p2-cdi-kicker>LAYER 00 · KNOW THE CARD</small><strong data-ff-p2-cdi-title>Release Intelligence</strong><p data-ff-p2-cdi-copy>Confirm the real release before any checklist assumption.</p><div class="ff-phase2-cdi-progress"><span data-ff-p2-cdi-progress></span></div></div></aside><div class="ff-phase2-cdi-steps">'+steps+'</div></div>';
    section.before(shell);
    const cards=[...shell.querySelectorAll('.ff-phase2-cdi-step')];
    const title=shell.querySelector('[data-ff-p2-cdi-title]');
    const copy=shell.querySelector('[data-ff-p2-cdi-copy]');
    const kicker=shell.querySelector('[data-ff-p2-cdi-kicker]');
    const progress=shell.querySelector('[data-ff-p2-cdi-progress]');
    let last=-1;
    const activate=n=>{
      if(last===n)return;
      last=n;
      const data=layerCopy[n];
      cards.forEach((c,i)=>c.classList.toggle('is-active',i===n));
      shell.dataset.system=systemFor(n);
      title.textContent=data[0];
      copy.textContent=data[1];
      kicker.textContent='LAYER '+String(n).padStart(2,'0')+' · '+({card:'KNOW THE CARD',market:'KNOW THE MARKET',decision:'MAKE THE DECISION',learn:'LEARN WHAT HAPPENED'}[systemFor(n)]);
      progress.style.width=((n+1)/13*100)+'%';
      emit('cdi_layer_viewed','layer_'+String(n).padStart(2,'0'));
    };
    cards.forEach((card,i)=>{
      card.addEventListener('click',()=>activate(i));
      card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(i)}});
    });
    if(!reduced){
      const observer=new IntersectionObserver(entries=>{
        const hit=entries.filter(x=>x.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
        if(hit)activate(Number(hit.target.dataset.layer));
      },{threshold:[.25,.5,.75],rootMargin:'-28% 0px -48% 0px'});
      cards.forEach(c=>observer.observe(c));
    }
    activate(0);
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
    if(!/product\.html$/.test(path))return;
    if(document.querySelector('.ff-phase2-product-receipt'))return;
    const anchor=document.querySelector('#identity-simulator')||document.querySelector('main>.section:nth-last-of-type(1)');
    if(!anchor)return;
    const section=document.createElement('section');
    section.className='ff-phase2-product-receipt';
    section.setAttribute('aria-labelledby','ff-p2-product-receipt-title');
    const labels=['Identity','Evidence','Economics','Risk','Decision','Receipt','Outcome'];
    section.innerHTML='<div class="ff-phase2-product-receipt-head"><div><small>SIGNATURE PRODUCT OBJECT</small><h2 id="ff-p2-product-receipt-title">The Decision Receipt makes the reasoning tangible.</h2><p>FlipForge does not stop at a recommendation. The product preserves the reason trail so the decision can be inspected later.</p></div></div><div class="ff-phase2-product-receipt-shell"><div class="ff-phase2-product-receipt-meta"><strong>DECISION RECEIPT</strong><span>VERIFY</span></div><div class="ff-phase2-product-receipt-steps">'+labels.map((x,i)=>'<span><b>'+String(i+1).padStart(2,'0')+'</b>'+x+'</span>').join('')+'</div><div class="ff-phase2-product-receipt-actions"><a class="btn primary" href="decision-intelligence.html" data-ff-p2-receipt-cta>See Card Decision Intelligence</a><a class="btn" href="/app/#/evaluate" data-ff-p2-evaluate-cta>Evaluate a Card</a></div></div>';
    anchor.before(section);
    section.querySelector('[data-ff-p2-receipt-cta]')?.addEventListener('click',()=>emit('decision_receipt_cta_clicked','product_receipt'));
    section.querySelector('[data-ff-p2-evaluate-cta]')?.addEventListener('click',()=>emit('evaluate_cta_clicked','product_receipt'));
  }

  buildCdiTheater();
  buildEvidenceTheater();
  buildProductReceipt();

  document.querySelectorAll('a[href*="beta-application"]').forEach(a=>a.addEventListener('click',()=>emit('phase2_beta_cta_clicked','public_rollout')));
})();