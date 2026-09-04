(()=>{
  'use strict';

  const hero=document.querySelector('.hero#overview');
  const main=document.querySelector('main#main');
  if(!hero||!main)return;

  if(!document.querySelector('link[data-ff-home-focus]')){
    const css=document.createElement('link');
    css.rel='stylesheet';
    css.href='assets/css/homepage-focus-v1.css';
    css.dataset.ffHomeFocus='true';
    document.head.appendChild(css);
  }
  if(!document.querySelector('link[data-ff-false-confidence]')){
    const css=document.createElement('link');
    css.rel='stylesheet';
    css.href='assets/css/homepage-false-confidence-v1.css';
    css.dataset.ffFalseConfidence='true';
    document.head.appendChild(css);
  }

  document.body.classList.add('ff-marketing-v3','ff-home-focused');
  document.querySelectorAll('.brand .tagline').forEach(node=>{node.textContent='CARD DECISION INTELLIGENCE';});

  const insertEvidenceLabLink=(nav,beforeHref)=>{
    if(!nav||nav.querySelector('a[href="learn.html"]'))return;
    const link=document.createElement('a');
    link.href='learn.html';
    link.textContent='Evidence Lab';
    const before=beforeHref?nav.querySelector(`a[href="${beforeHref}"]`):null;
    if(before)nav.insertBefore(link,before); else nav.appendChild(link);
  };
  insertEvidenceLabLink(document.querySelector('.desktop-nav'),'faq.html');
  insertEvidenceLabLink(document.querySelector('.mobile-nav'),'faq.html');
  document.querySelectorAll('.footer-links').forEach(group=>{
    if(group.querySelector('a[href="product.html"]'))insertEvidenceLabLink(group,'faq.html');
  });

  hero.classList.add('ff-hero-v3','ff-hero-false-confidence');
  hero.querySelector('figure')?.classList.add('ff-hero-visual');

  const heroCopy=hero.querySelector('.ff-hero-copy')||hero.firstElementChild;
  if(heroCopy){
    const eyebrow=heroCopy.querySelector('.eyebrow');
    const heading=heroCopy.querySelector('h1');
    const tension=heroCopy.querySelector('.ff-hero-tension');
    const lead=heroCopy.querySelector('.lead');
    const actions=heroCopy.querySelector('.ff-primary-actions,.buttons');
    if(eyebrow)eyebrow.textContent='CARD DECISION INTELLIGENCE';
    if(heading)heading.innerHTML='Before you buy. <span>Know Why.</span>';

    if(heading&&!heroCopy.querySelector('.ff-hero-scenario')){
      const scenario=document.createElement('div');
      scenario.className='ff-hero-scenario';
      scenario.setAttribute('aria-label','Illustrative buying scenario: last comp 900 dollars, listing 850 dollars');
      scenario.innerHTML=`
        <span class="ff-hero-scenario-label">Illustrative decision · not live market data</span>
        <div class="ff-hero-scenario-numbers">
          <div><small>Last comp</small><strong>$900</strong></div>
          <span class="ff-hero-vs" aria-hidden="true">vs.</span>
          <div><small>Listed at</small><strong>$850</strong></div>
        </div>
        <p><span>Looks like a $50 edge.</span> Easy buy — or is it?</p>`;
      heading.insertAdjacentElement('afterend',scenario);
    }

    if(tension)tension.textContent='A precise-looking number can create false confidence. The comp may be a different parallel, too stale to trust, or backed by too little evidence.';
    if(lead)lead.textContent='FlipForge checks the card, challenges the evidence, and shows you the risk and reasoning behind the decision—before your money is on the line.';
    if(actions){
      const secondary=actions.querySelector('[data-demo-cta="hero"]')||actions.querySelector('.btn:not(.primary)');
      if(secondary)secondary.textContent='See FlipForge challenge a decision';
      if(!heroCopy.querySelector('.ff-hero-boundary')){
        const boundary=document.createElement('p');
        boundary.className='ff-hero-boundary';
        boundary.textContent='Illustrative scenario. Decision support only; no outcome or profit guarantee.';
        actions.insertAdjacentElement('afterend',boundary);
      }
    }
  }

  const heroCaption=hero.querySelector('.ff-hero-visual figcaption,.ff-hero-visual .caption');
  if(heroCaption)heroCaption.textContent='Illustrative seller claim → evidence challenge → protected decision. The reason trail stays visible.';

  const problemBand=document.querySelector('.ff-problem-band');
  if(problemBand){
    problemBand.classList.add('ff-false-confidence');
    const kicker=problemBand.querySelector('.ff-problem-intro .ff-kicker');
    const heading=problemBand.querySelector('.ff-problem-intro h2');
    if(kicker)kicker.textContent='THE ENEMY IS FALSE CONFIDENCE';
    if(heading)heading.textContent='A price can look precise and still be wrong for the card in front of you.';
    const cards=[...problemBand.querySelectorAll('.ff-problem-grid article')];
    const falseConfidence=[
      ['FALSE CONFIDENCE 01','Wrong parallel','A $900 sale does not support an $850 listing if the cards are not the same parallel or variation.'],
      ['FALSE CONFIDENCE 02','Stale comp','A clean sale can still mislead when the market has moved since it happened.'],
      ['FALSE CONFIDENCE 03','Thin evidence','One precise sale is not the same thing as a dependable evidence base.'],
      ['FALSE CONFIDENCE 04','Grade assumption','A PSA 10 outcome can look profitable while realistic lower-grade outcomes erase the apparent edge.']
    ];
    cards.slice(0,falseConfidence.length).forEach((card,index)=>{
      const [label,title,copy]=falseConfidence[index];
      const number=card.querySelector('span');
      const strong=card.querySelector('strong');
      const paragraph=card.querySelector('p');
      if(number)number.textContent=label;
      if(strong)strong.textContent=title;
      if(paragraph)paragraph.textContent=copy;
    });
  }

  document.querySelector('.homepage-directory')?.remove();
  ['product-screens','identity-checker','case-study','decision-tools','comparison','pricing'].forEach(id=>{
    document.getElementById(id)?.remove();
  });

  const beforeAfter=document.getElementById('before-after');
  if(beforeAfter){
    const kicker=beforeAfter.querySelector('.kicker');
    const heading=beforeAfter.querySelector('h2');
    const copy=beforeAfter.querySelector('.section-copy');
    if(kicker)kicker.textContent='Why FlipForge';
    if(heading)heading.textContent='Turn market noise into a decision you can defend.';
    if(copy)copy.textContent='FlipForge separates exact identity, usable evidence, economics, and risk before presenting guidance.';
  }

  const demo=document.getElementById('try-flipforge');
  if(demo){
    const kicker=demo.querySelector('.kicker');
    const heading=demo.querySelector('h2');
    const copy=demo.querySelector('.section-copy');
    if(kicker)kicker.textContent='Try FlipForge';
    if(heading)heading.textContent='See the decision workflow in four steps.';
    if(copy)copy.textContent='One guided example shows how FlipForge protects the decision when the evidence does not fully support the card.';
  }

  if(demo&&!document.getElementById('how-it-works')){
    const workflow=document.createElement('section');
    workflow.className='ff-home-workflow';
    workflow.id='how-it-works';
    workflow.innerHTML=`
      <div class="ff-home-workflow-head">
        <div><span class="ff-kicker">How it works</span><h2>One disciplined path from listing to decision.</h2></div>
        <p>The homepage gives you the overview. Product and Evidence Lab carry the deeper feature and methodology detail.</p>
      </div>
      <div class="ff-home-workflow-grid">
        <article><span>01</span><strong>Resolve the card</strong><small>Year, set, number, parallel, grader, and grade. If identity is ambiguous, FlipForge stops for an explicit choice instead of auto-picking the first match.</small></article>
        <article><span>02</span><strong>Challenge the evidence</strong><small>Exact matches count. Weak or mismatched records stay visible but do not quietly drive value.</small></article>
        <article><span>03</span><strong>Measure the setup</strong><small>Price, supported value, liquidity, downside, confidence, and grading economics stay connected.</small></article>
        <article><span>04</span><strong>Understand the decision</strong><small>BUY CANDIDATE, WATCH, VERIFY, PASS, or grading guidance comes with a reason trail.</small></article>
      </div>
      <div class="ff-home-workflow-footer">
        <span><strong>Then track it.</strong> Saved decisions can be reviewed over 7 / 14 / 30 days to measure what held and what changed.</span>
        <div><a class="btn" href="product.html">Explore Product</a><a class="btn" href="learn.html">Evidence Lab</a></div>
      </div>`;
    demo.insertAdjacentElement('afterend',workflow);
  }

  const workflow=document.getElementById('how-it-works');
  if(workflow&&!document.getElementById('decision-accountability')){
    const accountability=document.createElement('section');
    accountability.className='ff-accountability';
    accountability.id='decision-accountability';
    accountability.setAttribute('aria-labelledby','decision-accountability-heading');
    accountability.innerHTML=`
      <div class="ff-accountability-head">
        <div><span class="ff-kicker">Decision accountability</span><h2 id="decision-accountability-heading">A decision is only useful if it holds up later.</h2></div>
        <p>FlipForge preserves the original decision and its context so controlled validation can compare what the system said with what happened at later checkpoints. That creates calibration evidence without rewriting the original call.</p>
      </div>
      <div class="ff-accountability-timeline" aria-label="Illustrative FlipForge outcome review timeline">
        <article><span class="ff-accountability-day">Day 0</span><strong>Lock the original call</strong><p>Preserve the decision, confidence, evidence quality, liquidity, risk, and reason trail as they existed when the decision was made.</p></article>
        <article><span class="ff-accountability-day">Day 7</span><strong>Check the first signals</strong><p>Review what changed and whether the original assumptions are beginning to hold, weaken, or remain unresolved.</p></article>
        <article><span class="ff-accountability-day">Day 14</span><strong>Stress the prediction</strong><p>Compare confidence, liquidity, volatility, and evidence quality with the developing outcome instead of judging only the headline price.</p></article>
        <article><span class="ff-accountability-day">Day 30</span><strong>Grade the call</strong><p>Classify what held, what missed, and where the original decision was too aggressive, too conservative, or appropriately cautious.</p></article>
      </div>
      <div class="ff-accountability-proof">
        <div><span>The proof question</span><strong>Did the decision age well?</strong><p>The goal is evidence-calibrated intelligence: measure the system against outcomes, then improve only when the sample supports it.</p></div>
        <p class="ff-accountability-boundary"><strong>Proof boundary:</strong> No public accuracy percentage is claimed from this workflow unless a governed review explicitly authorizes it. Decision support only; no outcome or profit guarantee.</p>
        <a class="ff-text-link" href="learn.html">See the Evidence Lab <span aria-hidden="true">→</span></a>
      </div>`;
    workflow.insertAdjacentElement('afterend',accountability);
  }

  const finalCallout=[...main.querySelectorAll('.home-section .callout')].pop();
  if(finalCallout){
    const kicker=finalCallout.querySelector('.kicker');
    const heading=finalCallout.querySelector('h2');
    const copy=finalCallout.querySelector('p');
    if(kicker)kicker.textContent='Controlled Private Beta';
    if(heading)heading.textContent='Before you buy. Know Why.';
    if(copy)copy.textContent='Use FlipForge to investigate the card, the evidence, and the decision before you spend.';
  }
})();
