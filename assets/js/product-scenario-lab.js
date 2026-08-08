(()=>{
  const root=document.querySelector('[data-scenario-lab]');
  if(!root)return;

  const tabs=[...root.querySelectorAll('[data-scenario-tab]')];
  const stage=root.querySelector('[data-scenario-stage]');
  const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
  const esc=(value)=>String(value).replace(/[&<>"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));

  const shell=(eyebrow,title,copy,controls,result,note='Illustrative website demo. Production FlipForge intelligence uses the full validated evidence workflow.')=>`
    <div class="scenario-stage-head"><div><span>${eyebrow}</span><h3>${title}</h3><p>${copy}</p></div><a href="intelligence.html" class="scenario-deep-link">Explore the intelligence →</a></div>
    <div class="scenario-demo-grid">
      <div class="scenario-controls">${controls}</div>
      <div class="scenario-result" aria-live="polite">${result}</div>
    </div>
    <p class="scenario-note">${note}</p>`;

  const field=(label,id,value,attrs='')=>`<label class="scenario-field"><span>${label}</span><input id="${id}" type="number" value="${value}" ${attrs}></label>`;
  const select=(label,id,options)=>`<label class="scenario-field"><span>${label}</span><select id="${id}">${options.map(([value,text,selected])=>`<option value="${value}"${selected?' selected':''}>${text}</option>`).join('')}</select></label>`;
  const metric=(label,id,value)=>`<div class="scenario-metric"><small>${label}</small><strong id="${id}">${value}</strong></div>`;
  const status=(label,cls='gold')=>`<div class="scenario-status ${cls}">${label}</div>`;

  function renderDecision(){
    stage.innerHTML=shell(
      'Deal Decision','Change the deal. Watch the guidance move.','This restores the original interactive decision proof: supported value, all-in cost, and evidence confidence change the website guidance.',
      `<div class="scenario-field-grid">${field('Supported value','lab-supported',250,'min="0" step="1"')}${field('Asking price','lab-asking',190,'min="0" step="1"')}${field('Shipping, tax + fees','lab-costs',12,'min="0" step="1"')}${select('Evidence confidence','lab-confidence',[['high','High',false],['medium','Medium',true],['low','Low',false]])}</div>`,
      `<div class="scenario-result-top"><div><small>FlipForge guidance</small><div class="scenario-big-status buy" id="lab-decision">BUY</div></div><div id="lab-confidence-chip" class="scenario-chip">Medium confidence</div></div><div class="scenario-metrics">${metric('All-in cost','lab-allin','$202')}${metric('Supported margin','lab-margin','$48')}${metric('Margin rate','lab-rate','23.8%')}</div><div class="scenario-reason" id="lab-reason"></div>`,
      'Illustrative marketing logic restored from the earlier FlipForge website demo. The production decision engine also evaluates identity, liquidity, evidence quality, risk, and other validated inputs.'
    );
    const num=id=>Math.max(0,Number(stage.querySelector('#'+id).value)||0);
    const update=()=>{
      const supported=num('lab-supported'),asking=num('lab-asking'),costs=num('lab-costs');
      const confidence=stage.querySelector('#lab-confidence').value;
      const allIn=asking+costs,margin=supported-allIn,rate=allIn>0?(margin/allIn)*100:0;
      const thresholds=confidence==='high'?{buy:15,watch:5}:confidence==='medium'?{buy:20,watch:8}:{buy:30,watch:15};
      let decision='PASS',cls='pass',reason='The all-in cost is above supported evidence. The economics do not currently justify the risk.';
      if(rate>=thresholds.buy){decision='BUY';cls='buy';reason='The all-in cost is meaningfully below supported evidence. Identity and condition still need confirmation before acting.'}
      else if(rate>=thresholds.watch){decision='WATCH';cls='watch';reason='There may be an opportunity, but the supported margin is not yet strong enough for the current evidence confidence.'}
      else if(rate>=0){decision='VERIFY';cls='verify';reason='The price is near supported value. Verify identity, condition, liquidity, and evidence quality before treating it as actionable.'}
      const decisionEl=stage.querySelector('#lab-decision');decisionEl.textContent=decision;decisionEl.className='scenario-big-status '+cls;
      stage.querySelector('#lab-confidence-chip').textContent=confidence[0].toUpperCase()+confidence.slice(1)+' confidence';
      stage.querySelector('#lab-allin').textContent=money.format(allIn);stage.querySelector('#lab-margin').textContent=money.format(margin);stage.querySelector('#lab-rate').textContent=rate.toFixed(1)+'%';stage.querySelector('#lab-reason').textContent=reason;
    };
    stage.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',update));update();
  }

  function renderGrading(){
    stage.innerHTML=shell(
      'PSA / Grading Intelligence','Change the grade probabilities. See the economics change.','The original probability-weighted grading demo is back, but contained inside the same Scenario Lab.',
      `<div class="scenario-field-grid">${field('Current raw value','lab-raw',120,'min="0" step="1"')}${field('Grading + shipping','lab-grade-cost',35,'min="0" step="1"')}</div><div class="scenario-grade-grid"><div><strong>PSA 10</strong>${field('Value','lab-10-value',300,'min="0"')}${field('Probability %','lab-10-prob',25,'min="0" max="100"')}</div><div><strong>PSA 9</strong>${field('Value','lab-9-value',145,'min="0"')}${field('Probability %','lab-9-prob',50,'min="0" max="100"')}</div><div><strong>PSA 8 or lower</strong>${field('Value','lab-8-value',80,'min="0"')}${field('Probability %','lab-8-prob',25,'min="0" max="100"')}</div></div>`,
      `<div class="scenario-result-top"><div><small>Grading guidance</small><div class="scenario-big-status watch" id="lab-grade-decision">REVIEW</div></div><div id="lab-prob-total" class="scenario-chip">Probabilities: 100%</div></div><div class="scenario-metrics">${metric('Expected graded value','lab-expected','$168.75')}${metric('After grading cost','lab-net','$133.75')}${metric('Expected gain vs raw','lab-gain','$13.75')}</div><div class="scenario-reason" id="lab-grade-reason"></div>`,
      'Probability inputs are visitor-controlled assumptions in this website demo. Production PSA Intelligence uses the authorized/validated data available to the application and preserves uncertainty.'
    );
    const num=id=>Math.max(0,Number(stage.querySelector('#'+id).value)||0);
    const update=()=>{
      const raw=num('lab-raw'),cost=num('lab-grade-cost'),values=[num('lab-10-value'),num('lab-9-value'),num('lab-8-value')],probs=[num('lab-10-prob'),num('lab-9-prob'),num('lab-8-prob')];
      const total=probs.reduce((a,b)=>a+b,0),expected=total>0?values.reduce((sum,v,i)=>sum+v*(probs[i]/total),0):0,net=expected-cost,gain=net-raw,gainRate=raw>0?(gain/raw)*100:0;
      let decision='KEEP RAW',cls='pass',reason='The probability-weighted outcome does not currently cover the raw value and grading cost.';
      if(gainRate>=20){decision='GRADE';cls='buy';reason='The probability-weighted outcome creates meaningful expected upside after grading cost. Condition and selling-fee risk still matter.'}
      else if(gain>0){decision='REVIEW';cls='watch';reason='Expected value is positive, but the margin is not strong enough to ignore condition risk, turnaround time, and selling fees.'}
      const d=stage.querySelector('#lab-grade-decision');d.textContent=decision;d.className='scenario-big-status '+cls;
      stage.querySelector('#lab-prob-total').textContent='Probabilities: '+total.toFixed(0)+'%'+(Math.abs(total-100)>.5?' · normalized':'');
      stage.querySelector('#lab-expected').textContent=money.format(expected);stage.querySelector('#lab-net').textContent=money.format(net);stage.querySelector('#lab-gain').textContent=money.format(gain);stage.querySelector('#lab-grade-reason').textContent=reason;
    };
    stage.querySelectorAll('input').forEach(el=>el.addEventListener('input',update));update();
  }

  function presetDemo(config){
    const options=config.presets.map((p,i)=>`<button type="button" class="scenario-preset${i===0?' active':''}" data-preset="${i}"><strong>${p.label}</strong><span>${p.hint}</span></button>`).join('');
    stage.innerHTML=shell(config.eyebrow,config.title,config.copy,`<div class="scenario-presets">${options}</div>`,`<div data-preset-result></div>`,config.note);
    const result=stage.querySelector('[data-preset-result]');
    const buttons=[...stage.querySelectorAll('[data-preset]')];
    const show=index=>{
      const p=config.presets[index];
      buttons.forEach((b,i)=>b.classList.toggle('active',i===index));
      result.innerHTML=`<div class="scenario-result-top"><div><small>${config.resultLabel}</small><div class="scenario-big-status ${p.cls}">${esc(p.status)}</div></div>${p.chip?`<div class="scenario-chip">${esc(p.chip)}</div>`:''}</div>${p.metrics?`<div class="scenario-metrics">${p.metrics.map(m=>`<div class="scenario-metric"><small>${esc(m[0])}</small><strong>${esc(m[1])}</strong></div>`).join('')}</div>`:''}<div class="scenario-reason">${esc(p.reason)}</div>${p.chain?`<div class="scenario-chain">${p.chain.map((item,i)=>`<div><span>${String(i+1).padStart(2,'0')}</span><p>${esc(item)}</p></div>`).join('')}</div>`:''}`;
    };
    buttons.forEach((b,i)=>b.addEventListener('click',()=>show(i)));show(0);
  }

  const renderers={
    decision:renderDecision,
    grading:renderGrading,
    identity:()=>presetDemo({eyebrow:'Exact-Card Identity',title:'A seller title is a claim, not identity proof.',copy:'Switch the identity evidence and watch whether the listing is allowed to move forward.',resultLabel:'Identity gate',presets:[
      {label:'Exact match',hint:'Year, set, #, parallel, grader + grade align',status:'CONFIRMED',cls:'buy',chip:'Evidence may proceed',metrics:[['Core identity','MATCH'],['Parallel','MATCH'],['Grade','MATCH']],reason:'The card attributes align closely enough for comparable-sale evidence to move to the next validation gate.'},
      {label:'Parallel unresolved',hint:'Seller says Refractor; evidence is incomplete',status:'VERIFY',cls:'verify',chip:'Comp influence held',metrics:[['Core identity','MATCH'],['Parallel','UNRESOLVED'],['Grade','MATCH']],reason:'The parallel claim is unresolved, so the questionable comp should not quietly become valuation confidence.'},
      {label:'Wrong variation',hint:'Evidence belongs to a different card treatment',status:'BLOCKED',cls:'pass',chip:'Evidence rejected',metrics:[['Core identity','MATCH'],['Variation','MISMATCH'],['Grade','MATCH']],reason:'The evidence describes a different variation. FlipForge keeps it out of the decision instead of averaging it in.'}
    ],note:'Illustrative identity-gate behavior. Production identity validation uses the application’s validated attributes and evidence records.'}),
    evidence:()=>presetDemo({eyebrow:'Evidence Trust',title:'Not every comp deserves equal influence.',copy:'Choose a record type and see how the evidence gate treats it.',resultLabel:'Evidence state',presets:[
      {label:'Exact completed sale',hint:'Same card, grade, variation; usable provenance',status:'ACCEPTED',cls:'buy',chip:'Can support value',metrics:[['Identity','EXACT'],['Sale state','COMPLETED'],['Trust','STRONG']],reason:'This record can support the evaluation because the identity and sale evidence are aligned.'},
      {label:'Asking price',hint:'Active listing, not a completed transaction',status:'CONTEXT',cls:'watch',chip:'Review only',metrics:[['Identity','MATCH'],['Sale state','ACTIVE ASK'],['Trust','CONTEXT']],reason:'The listing can provide market context, but an asking price is not silently promoted into completed-sale evidence.'},
      {label:'Wrong grade / duplicate',hint:'Mismatched or duplicate evidence',status:'REJECTED',cls:'pass',chip:'Does not count',metrics:[['Identity','MISMATCH'],['Record','DUPLICATE / WRONG'],['Trust','REJECTED']],reason:'The record stays visible for audit context but is prevented from distorting supported value.'}
    ],note:'Illustrative evidence states reflect FlipForge’s accepted / review / rejected evidence model.'}),
    forgescore:()=>presetDemo({eyebrow:'ForgeScore™ Confidence Engine',title:'Watch confidence respond to evidence quality.',copy:'These scenarios illustrate how stronger or weaker evidence changes the confidence posture. They do not expose or simulate the production scoring formula.',resultLabel:'Illustrative ForgeScore™',presets:[
      {label:'Strong case',hint:'Identity resolved + strong evidence + healthy liquidity',status:'86',cls:'buy',chip:'HIGH CONFIDENCE · ILLUSTRATIVE',metrics:[['Identity','RESOLVED'],['Evidence','STRONG'],['Liquidity','HEALTHY']],reason:'A stronger evidence stack earns a higher confidence posture because fewer unresolved questions remain.'},
      {label:'Mixed case',hint:'Usable evidence but thin market depth',status:'63',cls:'watch',chip:'MODERATE · ILLUSTRATIVE',metrics:[['Identity','RESOLVED'],['Evidence','MIXED'],['Liquidity','THIN']],reason:'The candidate may still be worth reviewing, but thin evidence or liquidity should reduce confidence.'},
      {label:'Unresolved case',hint:'Identity conflict + weak evidence',status:'31',cls:'pass',chip:'LOW · ILLUSTRATIVE',metrics:[['Identity','UNRESOLVED'],['Evidence','WEAK'],['Liquidity','UNKNOWN']],reason:'Unresolved identity and weak support should prevent a confident-looking score from hiding uncertainty.'}
    ],note:'Illustrative ForgeScore™ behavior only. Numbers shown here are marketing scenarios, not the production ForgeScore™ formula or a live evaluation.'}),
    forgesignal:()=>presetDemo({eyebrow:'ForgeSignal™ Opportunity Feed',title:'See why some listings earn attention and others do not.',copy:'Switch candidate conditions to see how the opportunity layer changes what deserves deeper review.',resultLabel:'Opportunity state',presets:[
      {label:'Strong candidate',hint:'Value gap + ROI gate + evidence gate clear',status:'SURFACE',cls:'buy',chip:'Rank for review',metrics:[['Value gap','POSITIVE'],['ROI gate','PASS'],['Evidence gate','PASS']],reason:'The candidate clears the basic opportunity filters and deserves deeper evaluation. It is not an automatic buy.'},
      {label:'Evidence warning',hint:'Attractive gap, but supporting evidence is weak',status:'VERIFY',cls:'verify',chip:'Do not promote yet',metrics:[['Value gap','POSITIVE'],['ROI gate','PASS'],['Evidence gate','REVIEW']],reason:'An attractive price gap is not enough. Weak evidence keeps the candidate from being treated as decision-ready.'},
      {label:'Duplicate / weak economics',hint:'Duplicate or below minimum opportunity gates',status:'FILTERED',cls:'pass',chip:'Keep out of feed',metrics:[['Duplicate gate','FAIL'],['Profit gate','FAIL'],['Evidence gate','—']],reason:'The feed removes candidates that fail duplicate or economic gates so attention is not wasted on noise.'}
    ],note:'Illustrative ForgeSignal™ states based on the documented opportunity-feed gates. No website demo buys, bids, or authorizes transactions.'}),
    traceback:()=>presetDemo({eyebrow:'Decision Traceback',title:'Follow the answer back to the evidence.',copy:'Choose an outcome and inspect the reasoning chain that remains attached to it.',resultLabel:'Guidance',presets:[
      {label:'BUY candidate',hint:'Economics strong; evidence usable',status:'BUY',cls:'buy',chip:'Explainable candidate',reason:'The guidance is accompanied by the path that produced it and the verification that still remains.',chain:['Exact-card identity resolved.','Comparable-sale evidence accepted; mismatches excluded.','All-in cost sits meaningfully below supported value.','Confidence/liquidity are sufficient for a candidate.','Next: confirm condition and seller details before acting.']},
      {label:'VERIFY',hint:'Price is close but one key question remains',status:'VERIFY',cls:'verify',chip:'Uncertainty preserved',reason:'The system does not force a confident answer when a material question remains unresolved.',chain:['Core identity aligns.','Parallel or variation remains unresolved.','Some market records are review-only.','Confidence is reduced by the unresolved evidence.','Next: verify the disputed attribute before the comp influences the decision.']},
      {label:'PASS',hint:'Economics or evidence no longer support the setup',status:'PASS',cls:'pass',chip:'Reason retained',reason:'A pass is traceable too—the excluded evidence and failed economics remain visible.',chain:['Identity checked.','Weak or mismatched records excluded.','Supported value falls below the required margin.','Risk outweighs the current opportunity.','Next: reconsider only if price or evidence materially changes.']}
    ],note:'Illustrative traceback. Production Decision Traceback preserves the actual evidence, exclusions, warnings, uncertainty, and reasoning associated with the evaluation.'})
  };

  const activate=name=>{
    tabs.forEach(tab=>{const active=tab.dataset.scenarioTab===name;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));});
    (renderers[name]||renderDecision)();
  };
  tabs.forEach(tab=>tab.addEventListener('click',()=>activate(tab.dataset.scenarioTab)));
  activate('decision');
})();
