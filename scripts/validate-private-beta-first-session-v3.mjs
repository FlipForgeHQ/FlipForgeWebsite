// Private Beta: first-visit clarity without removing authoritative information or feedback.
// Static, dependency-free checks; full customer, authorization and feedback tests still run in CI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const js=fs.readFileSync('saas-prototype/private-beta.js','utf8');
const css=fs.readFileSync('saas-prototype/private-beta.css','utf8');
const start=js.indexOf('function pageMarkup(session, health)');
const end=js.indexOf('\n  function scrollToFeedback()',start);
assert.ok(start>0 && end>start,'onboarding template still exists');
const page=js.slice(start,end);
let checked=0;
const check=(label,test)=>{assert.ok(test,label);checked++;};
const position=(token)=>page.indexOf(token);
check('short brand introduction is first', position('private-beta-v3-hero')>=0 && position('private-beta-v3-hero')<position('private-beta-v3-next'));
check('intro explains exact identity, evidence, costs and uncertainty without a technical manual',
  ['exact identity','examines the evidence','costs and uncertainty','what the decision means'].every(x=>page.includes(x)));
check('single obvious first action routes to Discover',page.includes('href="#/discover" data-private-beta-start>Evaluate my first card'));
check('manual entry remains accessible',page.includes('href="#/evaluate">Enter a listing manually'));
check('locked slogan is unchanged',page.includes('Before you buy. Know Why.'));
check('optional four-stage guide is collapsed', page.includes('<details class="private-beta-v2-details private-beta-v3-expander private-beta-v3-guide"') &&
  page.includes('data-private-beta-first-card>') && !page.includes('data-private-beta-first-card open'));
check('all original guide steps remain', ['Search one exact card','Submit one listing to Smart Opportunity',
  'Open Card Intelligence','Send focused feedback','Challenge the Decision Traceback'].every(x=>page.includes(x)));
check('status and guide preference preserved under expandable access section',
  page.includes('data-private-beta-account-details>') && position('data-private-beta-account-details') < position('private-beta-v2-status')
  && page.includes('data-private-beta-${introComplete ? "reset" : "complete"}')
  && js.includes('document.querySelector("[data-private-beta-complete]")')
  && js.includes('document.querySelector("[data-private-beta-reset]")'));
check('complete structured decision diagram preserved under optional explainer',
  page.includes('data-private-beta-record-details>') && page.includes('data-private-beta-record-system')
  && position('data-private-beta-record-details') < position('data-private-beta-record-system')
  && ['IDENTITY RECORD','EVIDENCE RECORD','DECISION RECEIPT','OUTCOME HISTORY'].every(x=>page.includes(x)));
check('full capability and known limitations remain accessible',
  ['What is available now','Known beta limits','transaction execution is active','AUTHORITY BOUNDARY'].every(x=>page.includes(x)));
check('feedback is after introduction and optionally expanded',
  position('private-beta-v3-feedback')>position('private-beta-v3-reference') && page.includes('<details class="private-beta-v2-details private-beta-v2-feedback') &&
  page.includes('pendingFeedbackDraft ? " open" : ""'));
check('feedback launcher expands form and focuses summary',
  js.includes('section.open = true') && js.includes('scrollToFeedback();') &&
  js.includes("querySelector(\"[data-private-beta-feedback] [name='summary']\")?.focus"));
check('existing feedback endpoint, input fields, consent and privacy warning remain',
  ['FEEDBACK_ENDPOINT = "/api/beta/feedback"','name="checkpoint"','name="outcome"',
    'name="contactAllowed"','name="summary"','name="expected"',
    'Do not paste passwords','This form records tester feedback'].every(x=>js.includes(x)));
check('live tenant and saved decision rules are unchanged',
  ['session.authenticated && session.membershipActive','tenant-owned and server-backed','browser does not become the authority'].every(x=>js.includes(x)));
check('premium responsive layout uses scoped v3 selectors and keyboard focus styles',
  css.includes('.private-beta-v3-hero') && css.includes('@media(max-width:700px)') &&
  css.includes('.private-beta-v3-reference :focus-visible') &&
  css.includes('.private-beta-v3-feedback-body'));
console.log(`PASS: ${checked} Private Beta first-session hierarchy and preservation checks.`);
