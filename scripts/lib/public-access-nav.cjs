'use strict';
// Single source of truth for the public website's access controls (desktop nav, mobile menu, footer).
//
// Signed-out is the only state ever written into static HTML. assets/js/access-state-v1.js may upgrade the
// group to "Open Dashboard" (active membership) or "Check Access Status" (signed in, access not active) only
// after the same-origin gateway verifies the current session server-side. Nothing here, and nothing in the
// build, reads browser state or asks whether an email address is registered.

const SIGN_IN_URL = '/production-auth.html?return=%2Fapp%2Fbeta%2F%23%2Fbeta-start';
const REQUEST_URL = 'beta-application.html';
const SIGN_IN_ARIA = 'Already invited? Sign in to the FlipForge Private Beta';
const GROUP_ARIA = 'Private Beta access';
const SIGN_IN_TEXT = '<span class="ff-access-signin-lead">Already invited?</span> <span class="ff-access-signin-action">Sign in</span>';
const ACCESS_STYLESHEET = '<link rel="stylesheet" href="assets/css/access-actions-v1.css">';
const ACCESS_SCRIPT = '<script src="assets/js/access-state-v1.js" defer></script>';

function signInLink(className) {
  return `<a class="${className}" data-ff-access-sign-in data-ff-marketing-sign-in href="${SIGN_IN_URL}" aria-label="${SIGN_IN_ARIA}">${SIGN_IN_TEXT}</a>`;
}

function primaryLink(className, current) {
  return `<a class="${className}" data-ff-access-primary${current ? ' aria-current="page"' : ''} href="${REQUEST_URL}">Request Beta Access</a>`;
}

// The homepage keeps its paired-action class names (ffdemo-*) so its existing styling hooks and validators stay
// meaningful; every other page uses the shared ff-access-* names. Behaviour and copy are identical.
function desktopGroup({ home = false, current = false, decision = false } = {}) {
  if (home) return `<div class="ffdemo-nav-actions" data-ff-access="desktop" data-ff-access-state="signed-out" role="group" aria-label="${GROUP_ARIA}">${signInLink('ffdemo-sign-in')}${primaryLink('nav-cta ffdemo-join', current)}</div>`;
  return `<div class="ff-access" data-ff-access="desktop" data-ff-access-state="signed-out" role="group" aria-label="${GROUP_ARIA}">${signInLink('ff-access-signin')}${primaryLink(`${decision ? 'decision-nav-cta' : 'nav-cta'} ff-access-primary`, current)}</div>`;
}

function mobileGroup({ home = false, current = false } = {}) {
  return home
    ? `<div class="ffdemo-mobile-actions" data-ff-access="mobile" data-ff-access-state="signed-out" role="group" aria-label="${GROUP_ARIA}">${primaryLink('ffdemo-join', current)}${signInLink('ffdemo-sign-in')}</div>`
    : `<div class="ff-access ff-access-mobile" data-ff-access="mobile" data-ff-access-state="signed-out" role="group" aria-label="${GROUP_ARIA}">${primaryLink('ff-access-primary', current)}${signInLink('ff-access-signin')}</div>`;
}

function footerLink() {
  return `<a data-ff-access-footer href="${SIGN_IN_URL}" aria-label="${SIGN_IN_ARIA}">Already invited? Sign in</a>`;
}

// Retired access links: the separate "Beta Sign In" / "Sign In" / "Private Beta App" / "App Preview" entries and the
// generated data-app-preview duplicates. Matching is limited to anchors that point at the sign-in page or carry a
// retired marker, so ordinary content links are never touched.
const RETIRED_LINK = /<a\b(?=[^>]*(?:data-app-preview=|data-ff-marketing-sign-in))(?![^>]*data-ff-access-sign-in)[^>]*>[\s\S]*?<\/a>/gi;
const SITE_FOOTER = /<footer class="footer">[\s\S]*?<\/footer>/i;
const LEGACY_REQUEST_LINK = /<a\b(?![^>]*data-ff-access-primary)[^>]*href="beta-application\.html"[^>]*>Request Beta Access<\/a>/i;
const LEGACY_WRAPPER = /<div class="(?:ffdemo-nav-actions|ffdemo-mobile-actions)"(?![^>]*data-ff-access)[^>]*>([\s\S]*?)<\/div>/i;

function normalizeDesktopNav(inner, options) {
  if (/data-ff-access="desktop"/.test(inner)) return inner.replace(RETIRED_LINK, '');
  const current = /href="beta-application\.html"[^>]*aria-current="page"|aria-current="page"[^>]*href="beta-application\.html"/.test(inner);
  let next = inner.replace(LEGACY_WRAPPER, (match, body) => body).replace(RETIRED_LINK, '');
  next = next.replace(/<a\b(?![^>]*data-ff-access-primary)[^>]*href="beta-application\.html"[^>]*>Request Beta Access<\/a>/gi, '');
  return `${next}${desktopGroup({ ...options, current })}`;
}

function normalizeMobileNav(inner, options) {
  if (/data-ff-access="mobile"/.test(inner)) return inner.replace(RETIRED_LINK, '');
  const current = /href="beta-application\.html"[^>]*aria-current="page"|aria-current="page"[^>]*href="beta-application\.html"/.test(inner);
  let next = inner.replace(LEGACY_WRAPPER, (match, body) => body).replace(RETIRED_LINK, '');
  next = next.replace(/<a\b(?![^>]*data-ff-access-primary)[^>]*href="beta-application\.html"[^>]*>Request Beta Access<\/a>/gi, '');
  return `${mobileGroup({ ...options, current })}${next}`;
}

function normalizeFooter(html) {
  const withoutRetired = html.replace(SITE_FOOTER, footer => footer.replace(RETIRED_LINK, ''));
  if (withoutRetired.includes('data-ff-access-footer')) return withoutRetired;
  const explore = /(<div\b[^>]*class="[^"]*\bfooter-links\b[^"]*"[^>]*>\s*<strong>Explore<\/strong>)([\s\S]*?)(<\/div>)/i;
  if (explore.test(withoutRetired)) return withoutRetired.replace(explore, (m, open, inner, close) => `${open}${inner}${footerLink()}${close}`);
  return withoutRetired.replace(/(<div\b[^>]*class="[^"]*\bfooter-links\b[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/i, (m, open, inner, close) => `${open}${inner}${footerLink()}${close}`);
}

function ensureAssets(html) {
  let next = html;
  if (!next.includes('assets/css/access-actions-v1.css')) next = next.replace(/<\/head>/i, `${ACCESS_STYLESHEET}\n</head>`);
  if (!next.includes('assets/js/access-state-v1.js')) next = next.replace(/<\/body>/i, `${ACCESS_SCRIPT}\n</body>`);
  return next;
}

// Idempotent: a page that already carries the canonical groups only has retired links stripped.
// Public pages use one of two headers: the shared .site-header (.desktop-nav) or the editorial .decision-header
// (.decision-nav-links, e.g. decision-proof.html). Both get the same grouped access control.
const PUBLIC_HEADER = /class="(?:site-header|decision-header)"/;
const DESKTOP_NAV = /(<nav\b[^>]*class="[^"]*\b(?:desktop-nav|decision-nav-links)\b[^"]*"[^>]*>)([\s\S]*?)(<\/nav>)/i;

function normalizePublicAccess(html, { fileName = '' } = {}) {
  if (!PUBLIC_HEADER.test(html)) return html;
  const home = fileName === 'index.html';
  const decision = !/class="site-header"/.test(html);
  let next = html.replace(DESKTOP_NAV,
    (m, open, inner, close) => `${open}${normalizeDesktopNav(inner, { home, decision })}${close}`);
  next = next.replace(/(<nav\b[^>]*id="mobile-navigation"[^>]*>)([\s\S]*?)(<\/nav>)/i,
    (m, open, inner, close) => `${open}${normalizeMobileNav(inner, { home })}${close}`);
  if (/class="[^"]*\bfooter-links\b/.test(next)) next = normalizeFooter(next);
  return ensureAssets(next);
}

// Returns a list of problems; an empty list means the page carries exactly the approved access experience.
function auditPublicAccess(html, fileName = '') {
  const problems = [];
  if (!PUBLIC_HEADER.test(html)) return problems;
  const desktop = html.match(DESKTOP_NAV)?.[2] || '';
  const mobile = html.match(/<nav\b[^>]*id="mobile-navigation"[^>]*>([\s\S]*?)<\/nav>/i)?.[1] || '';
  const footer = html.match(SITE_FOOTER)?.[0] || '';
  const count = (text, pattern) => (text.match(pattern) || []).length;
  if (/\bBeta Sign In\b/.test(html)) problems.push('retired "Beta Sign In" label is present');
  if (/data-app-preview=/.test(html)) problems.push('retired data-app-preview link is present');
  if (/>\s*(?:Sign In|Private Beta App|App Preview)\s*<\/a>/.test(html)) problems.push('a standalone sign-in link is present');
  for (const [where, nav] of [['desktop', desktop], ['mobile', mobile]]) {
    if (!nav) { problems.push(`${where} navigation is missing`); continue; }
    if (count(nav, new RegExp(`data-ff-access="${where}"`, 'g')) !== 1) problems.push(`${where} navigation must contain exactly one access group`);
    if (!nav.includes(`data-ff-access-state="signed-out"`)) problems.push(`${where} access group must default to signed-out`);
    if (count(nav, /data-ff-access-primary/g) !== 1) problems.push(`${where} navigation must contain exactly one primary access action`);
    if (!/data-ff-access-primary(?: aria-current="page")? href="beta-application\.html">Request Beta Access<\/a>/.test(nav)) problems.push(`${where} primary action must be Request Beta Access`);
    if (count(nav, /data-ff-access-sign-in/g) !== 1) problems.push(`${where} navigation must contain exactly one invited sign-in link`);
    if (!nav.includes(`data-ff-access-sign-in data-ff-marketing-sign-in href="${SIGN_IN_URL}" aria-label="${SIGN_IN_ARIA}">${SIGN_IN_TEXT}</a>`)) problems.push(`${where} sign-in must read "Already invited? Sign in" with the exact return URL and aria-label`);
    if (count(nav, /production-auth\.html/g) !== 1) problems.push(`${where} navigation must link to sign-in exactly once`);
    if (!nav.includes(`role="group" aria-label="${GROUP_ARIA}"`)) problems.push(`${where} access group needs role=group and an accessible name`);
  }
  if (/class="[^"]*\bfooter-links\b/.test(html)) {
    if (count(footer, /data-ff-access-footer/g) !== 1) problems.push('footer must contain exactly one invited sign-in link');
    if (!footer.includes(footerLink())) problems.push('footer sign-in must read "Already invited? Sign in" with the exact return URL');
  }
  if (!html.includes(ACCESS_STYLESHEET)) problems.push('access stylesheet missing');
  if (!html.includes(ACCESS_SCRIPT)) problems.push('verified access-state script missing');
  if (fileName === 'index.html' && (!desktop.includes('class="ffdemo-nav-actions"') || !mobile.includes('class="ffdemo-mobile-actions"'))) problems.push('homepage paired access classes missing');
  return problems;
}

module.exports = {
  PUBLIC_HEADER, SIGN_IN_URL, REQUEST_URL, SIGN_IN_ARIA, GROUP_ARIA, SIGN_IN_TEXT, ACCESS_STYLESHEET, ACCESS_SCRIPT,
  desktopGroup, mobileGroup, footerLink, normalizePublicAccess, auditPublicAccess
};
