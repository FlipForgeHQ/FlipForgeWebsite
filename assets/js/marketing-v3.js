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

  document.body.classList.add('ff-marketing-v3','ff-home-focused');
  document.querySelectorAll('.brand .tagline').forEach(node=>{node.textContent='CARD INTELLIGENCE';});

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

  hero.classList.add('ff-hero-v3');
  hero.querySelector('figure')?.classList.add('ff-hero-visual');

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
