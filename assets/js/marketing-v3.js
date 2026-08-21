(()=>{
  'use strict';

  const hero=document.querySelector('.hero#overview');
  const main=document.querySelector('main#main');
  if(!hero||!main)return;

  document.body.classList.add('ff-marketing-v3');

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
    if(!group.querySelector('a[href="product.html"]'))return;
    insertEvidenceLabLink(group,'faq.html');
  });

  hero.classList.add('ff-hero-v3');

  const heroCopy=hero.firstElementChild;
  if(heroCopy&&!heroCopy.querySelector('.ff-hero-points')){
    const points=document.createElement('div');
    points.className='ff-hero-points';
    ['Identity','Evidence','Value','Risk','Confidence','Decision'].forEach(label=>{
      const item=document.createElement('span');
      item.textContent=label;
      points.appendChild(item);
    });
    const buttons=heroCopy.querySelector('.buttons');
    if(buttons)heroCopy.insertBefore(points,buttons);
    else heroCopy.appendChild(points);
  }

  const figure=hero.querySelector('figure');
  if(figure&&!figure.classList.contains('ff-hero-visual')){
    figure.classList.add('ff-hero-visual');
    const decision=document.createElement('aside');
    decision.className='ff-hero-decision';
    decision.setAttribute('aria-label','Illustrative FlipForge decision summary');
    decision.innerHTML=`
      <span class="ff-mini-label">Illustrative decision review</span>
      <h3>2018 Topps Chrome Shohei Ohtani #150 PSA 10</h3>
      <span class="ff-mini-state">VERIFY</span>
      <dl>
        <dt>Exact identity</dt><dd>Needs proof</dd>
        <dt>Comparable evidence</dt><dd>Mixed</dd>
        <dt>Confidence</dt><dd>Moderate</dd>
        <dt>Risk</dt><dd>Elevated</dd>
      </dl>
      <span class="ff-mini-why">Why? Parallel evidence is unresolved.</span>`;
    figure.appendChild(decision);
  }

  const problem=document.createElement('section');
  problem.className='ff-marketing-section';
  problem.id='market-problem';
  problem.innerHTML=`
    <div class="ff-section-intro">
      <div><span class="ff-kicker">The problem</span><h2>The problem isn't finding prices. It's knowing what deserves to count.</h2></div>
      <p>Collectors can find listings, price histories, population reports, and opinions everywhere. The missing layer is disciplined context: is this the exact card, is the evidence usable, and does the opportunity still hold up after risk and economics?</p>
    </div>
    <div class="ff-problem-stage">
      <div class="ff-problem-lead"><div><strong>Too many inputs. Too little decision context.</strong><span>A plausible-looking comp can still belong to the wrong card, wrong grade, wrong parallel, or wrong market.</span></div><div class="ff-problem-mark" aria-hidden="true">?</div></div>
      <div class="ff-problem-grid">
        <article class="ff-problem-card"><span>01</span><h3>Identity drift</h3><p>One changed card number, parallel, grader, or grade can move the comparison into a different market.</p></article>
        <article class="ff-problem-card"><span>02</span><h3>Weak evidence</h3><p>Completed sales still need to be exact enough, trustworthy enough, and relevant enough to support a decision.</p></article>
        <article class="ff-problem-card"><span>03</span><h3>False precision</h3><p>A neat average or ROI percentage can create confidence even when the underlying evidence is unresolved.</p></article>
        <article class="ff-problem-card"><span>04</span><h3>No traceback</h3><p>If you cannot see what was accepted, rejected, or uncertain, you cannot defend the conclusion later.</p></article>
      </div>
      <div class="ff-problem-rule"><strong>FlipForge principle:</strong> Bad inputs should fail closed before they become confident decisions.</div>
    </div>`;
  hero.insertAdjacentElement('afterend',problem);

  const intelligence=document.createElement('section');
  intelligence.className='ff-marketing-section';
  intelligence.id='what-flipforge-sees';
  intelligence.innerHTML=`
    <div class="ff-section-intro">
      <div><span class="ff-kicker">What FlipForge sees</span><h2>The intelligence between the listing and the purchase.</h2></div>
      <p>FlipForge does not treat a price as the answer. It carries the card through a sequence of checks so the recommendation can explain what supports it and what could invalidate it.</p>
    </div>
    <div class="ff-intelligence-shell">
      <div class="ff-intelligence-flow" aria-label="FlipForge intelligence flow">
        <div class="ff-intelligence-step"><span class="ff-step-number">01</span><div><strong>Identity</strong><small>Resolve year, set, card number, parallel, grader, and grade.</small></div><span class="ff-step-state">Know the card</span></div>
        <div class="ff-intelligence-step"><span class="ff-step-number">02</span><div><strong>Evidence</strong><small>Separate accepted exact matches from context, exclusions, and unresolved records.</small></div><span class="ff-step-state">Trust the evidence</span></div>
        <div class="ff-intelligence-step"><span class="ff-step-number">03</span><div><strong>Economics</strong><small>Compare asking price, supported value, acquisition cost, and grading scenarios.</small></div><span class="ff-step-state">See the setup</span></div>
        <div class="ff-intelligence-step"><span class="ff-step-number">04</span><div><strong>Risk + confidence</strong><small>Keep uncertainty, liquidity, downside, and evidence quality visible.</small></div><span class="ff-step-state">Measure uncertainty</span></div>
        <div class="ff-intelligence-step"><span class="ff-step-number">05</span><div><strong>Decision</strong><small>BUY CANDIDATE, WATCH, VERIFY, PASS, or grading guidance with a reason trail.</small></div><span class="ff-step-state">Know why</span></div>
      </div>
      <aside class="ff-decision-card">
        <span class="ff-kicker">Illustrative output</span>
        <span class="ff-decision-status">VERIFY</span>
        <h3>A good-looking price is not enough.</h3>
        <p>The evidence set has an unresolved parallel mismatch. FlipForge preserves the uncertainty instead of forcing a supported value.</p>
        <div class="ff-decision-metrics">
          <div><span>Identity</span><strong>Unresolved</strong></div>
          <div><span>Evidence</span><strong>Blocked</strong></div>
          <div><span>Confidence</span><strong>Withheld</strong></div>
          <div><span>Next action</span><strong>Verify card</strong></div>
        </div>
        <div class="ff-decision-why"><strong>Why this matters:</strong> a wrong parallel can make every downstream comp and valuation look precise while still being wrong.</div>
      </aside>
    </div>`;
  problem.insertAdjacentElement('afterend',intelligence);

  const pricing=document.getElementById('pricing');
  if(pricing){
    const proof=document.createElement('section');
    proof.className='ff-marketing-section';
    proof.id='proof-loop';
    proof.innerHTML=`
      <div class="ff-section-intro">
        <div><span class="ff-kicker">Built to prove itself</span><h2>A decision engine should be measured after the decision.</h2></div>
        <p>FlipForge's evidence program follows saved decisions over time instead of claiming accuracy from a single snapshot. The goal is calibration: learn what held, what changed, and why.</p>
      </div>
      <div class="ff-proof-loop">
        <article class="ff-proof-card"><span class="ff-proof-day">Day 7</span><h3>Early signal check</h3><p>Review whether the original evidence and market conditions still support the saved decision.</p></article>
        <article class="ff-proof-card"><span class="ff-proof-day">Day 14</span><h3>Decision stability</h3><p>Track meaningful changes in supported value, liquidity, evidence quality, and risk.</p></article>
        <article class="ff-proof-card"><span class="ff-proof-day">Day 30</span><h3>Outcome review</h3><p>Compare the original reasoning with what actually happened and preserve the result for calibration.</p></article>
      </div>
      <div class="ff-proof-note">No fabricated win rate. No invented market-wide accuracy claim. Publish performance metrics only when the governed evidence supports them.</div>`;
    pricing.insertAdjacentElement('beforebegin',proof);
  }

  const finalCallout=[...main.querySelectorAll('.home-section .callout')].pop()?.closest('section');
  if(finalCallout){
    const vision=document.createElement('section');
    vision.className='ff-marketing-section ff-vision';
    vision.id='vision';
    vision.innerHTML=`
      <div class="ff-vision-inner">
        <div><span class="ff-kicker">Our vision</span><h2>The <span>Bloomberg of sports cards.</span></h2><p>Not because FlipForge should imitate a terminal screen, but because the hobby needs a trusted decision layer: connected data, explicit evidence, transparent risk, saved reasoning, and measurable outcomes.</p></div>
        <div class="ff-vision-chain" aria-label="FlipForge long-term intelligence loop">
          <div><strong>Data</strong><small>Market + card inputs</small></div>
          <div><strong>Evidence</strong><small>What truly matches</small></div>
          <div><strong>Decision</strong><small>Explainable guidance</small></div>
          <div><strong>Outcome</strong><small>What changed</small></div>
          <div><strong>Edge</strong><small>Better calibration</small></div>
        </div>
      </div>`;
    finalCallout.insertAdjacentElement('beforebegin',vision);
  }

  const directory=document.querySelector('.homepage-directory nav');
  if(directory){
    const entries=[
      ['#market-problem','The Problem'],
      ['#what-flipforge-sees','What FlipForge Sees'],
      ['#try-flipforge','Try the Demo'],
      ['#product-screens','Product Screens'],
      ['learn.html','Evidence Lab'],
      ['#proof-loop','7 / 14 / 30 Proof'],
      ['#vision','Vision']
    ];
    directory.replaceChildren(...entries.map(([href,label])=>{
      const a=document.createElement('a');
      a.href=href;
      a.textContent=label;
      return a;
    }));
  }
})();
