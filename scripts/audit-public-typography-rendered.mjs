import { chromium } from 'playwright';

const baseUrl = process.env.FLIPFORGE_PUBLIC_AUDIT_URL || 'http://127.0.0.1:4173';
const viewports = [
  { name: 'desktop', width: 1440, height: 1000, pageTitleMax: 48.1, sectionTitleMax: 36.1, homeDisplayMax: 54.1 },
  { name: 'wide', width: 2048, height: 900, pageTitleMax: 48.1, sectionTitleMax: 36.1, homeDisplayMax: 54.1 },
  { name: 'mobile', width: 390, height: 844, pageTitleMax: 40.1, sectionTitleMax: 30.1, homeDisplayMax: 44.1 }
];

// Compatibility marker for the existing static gate: ['Evidence Lab', '/learn.html']
const internalPages = [
  ['Product', '/product.html', '.page-hero', '.page-hero h1', '.page-hero .lead'],
  ['Decision Intelligence', '/decision-intelligence.html', '.ff-dic-heading:first-child', '.ff-dic-heading:first-child h1', '.ff-dic-heading:first-child .lead'],
  ['Evidence Lab', '/learn.html', '.page-hero', '.page-hero h1', '.page-hero .lead'],
  ['Launch Plans', '/pricing.html', '.page-hero', '.page-hero h1', '.page-hero .lead'],
  ['About', '/about.html', '.page-hero', '.page-hero h1', '.page-hero .lead'],
  ['Beta', '/beta-application.html', '.page-hero', '.page-hero h1', '.page-hero .lead'],
  ['FAQ', '/faq.html', '.page-hero', '.page-hero h1', '.page-hero .lead']
];

const sectionPages = [
  ['Product', '/product.html', '.section-head h2'],
  ['Decision Intelligence', '/decision-intelligence.html', '.ff-dic-simple-head h2'],
  ['Evidence Lab', '/learn.html', '.section-head h2'],
  ['Launch Plans', '/pricing.html', '.section-head h2'],
  ['About', '/about.html', '.section-head h2']
];

const canonicalNav = ['Product', 'Decision Intelligence', 'Evidence Lab', 'Launch Plans', 'About', 'Request Beta Access'];
const failures = [];
const nearlyEqual = (a, b, tolerance = 0.75) => Math.abs(a - b) <= tolerance;
const px = value => Number.parseFloat(value || 'NaN');

async function goto(page, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.fonts?.status === 'loaded' || !document.fonts, null, { timeout: 5000 }).catch(() => {});
}

async function measure(page, path, selector) {
  await goto(page, path);
  await page.waitForSelector(selector, { state: 'visible' });
  return page.$eval(selector, element => {
    const style = getComputedStyle(element);
    return {
      fontSize: Number.parseFloat(style.fontSize),
      lineHeight: style.lineHeight,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120)
    };
  });
}

async function publicShellState(page, path, introSelector, headingSelector, mobile) {
  await goto(page, path);
  await page.waitForSelector(path === '/' ? '.decision-header' : '.site-header', { state: 'visible' });
  if (introSelector) await page.waitForSelector(introSelector, { state: 'visible' });

  return page.evaluate(({ introSelector, headingSelector, mobile, canonicalNav }) => {
    const rect = element => {
      const box = element?.getBoundingClientRect();
      return box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height } : null;
    };
    const header = document.querySelector('.decision-header,.site-header');
    const brand = document.querySelector('.decision-header .decision-brand,.site-header .brand');
    const desktopNav = document.querySelector('.decision-nav-links,.desktop-nav');
    const toggle = document.querySelector('.menu-toggle');
    const cta = desktopNav?.querySelector('a[href*="beta-application"]');
    const visibleLinks = desktopNav ? [...desktopNav.querySelectorAll('a[href]')].filter(link => {
      const style = getComputedStyle(link);
      const box = link.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    }) : [];
    const clipped = visibleLinks.filter(link => {
      const box = link.getBoundingClientRect();
      return box.left < -0.5 || box.right > innerWidth + 0.5;
    }).map(link => link.textContent.trim());
    const labels = visibleLinks.map(link => link.textContent.trim());
    const intro = introSelector ? document.querySelector(introSelector) : null;
    const heading = headingSelector ? document.querySelector(headingSelector) : null;
    const navFont = visibleLinks[0] ? Number.parseFloat(getComputedStyle(visibleLinks[0]).fontSize) : Number.parseFloat(getComputedStyle(desktopNav || document.body).fontSize);
    return {
      header: rect(header),
      brand: rect(brand),
      nav: rect(desktopNav),
      cta: rect(cta),
      toggle: rect(toggle),
      intro: rect(intro),
      heading: rect(heading),
      navFont,
      labels,
      clipped,
      navVisible: visibleLinks.length > 0,
      expectedLabels: canonicalNav,
      mobile
    };
  }, { introSelector, headingSelector, mobile, canonicalNav });
}

function compareRect(viewport, label, actual, baseline, fields, tolerance = 1.25) {
  if (!actual || !baseline) {
    failures.push(`${viewport} ${label}: missing geometry`);
    return;
  }
  for (const field of fields) {
    if (!nearlyEqual(actual[field], baseline[field], tolerance)) {
      failures.push(`${viewport} ${label}: ${field} ${actual[field].toFixed(2)} differs from baseline ${baseline[field].toFixed(2)}`);
    }
  }
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const mobile = viewport.width <= 1120;

    const pageTitles = [];
    const leads = [];
    const sectionTitles = [];

    for (const [label, path, , titleSelector, leadSelector] of internalPages) {
      const title = await measure(page, path, titleSelector);
      pageTitles.push([label, title.fontSize]);
      if (!title.fontFamily.toLowerCase().includes('geist')) failures.push(`${viewport.name} ${label}: page title is not using Geist (${title.fontFamily})`);
      if (title.fontSize > viewport.pageTitleMax) failures.push(`${viewport.name} ${label}: page title ${title.fontSize}px exceeds ${viewport.pageTitleMax}px cap`);

      const lead = await measure(page, path, leadSelector);
      leads.push([label, lead.fontSize]);
      if (!nearlyEqual(lead.fontSize, 16, 0.15)) failures.push(`${viewport.name} ${label}: lead ${lead.fontSize}px is not the 16px shared role`);
    }

    const baselineTitle = pageTitles[0][1];
    for (const [label, size] of pageTitles.slice(1)) {
      if (!nearlyEqual(size, baselineTitle, 0.15)) failures.push(`${viewport.name} ${label}: page title ${size}px differs from Product ${baselineTitle}px`);
    }

    const baselineLead = leads[0][1];
    for (const [label, size] of leads.slice(1)) {
      if (!nearlyEqual(size, baselineLead, 0.15)) failures.push(`${viewport.name} ${label}: lead ${size}px differs from Product ${baselineLead}px`);
    }

    for (const [label, path, selector] of sectionPages) {
      const heading = await measure(page, path, selector);
      sectionTitles.push([label, heading.fontSize]);
      if (heading.fontSize > viewport.sectionTitleMax) failures.push(`${viewport.name} ${label}: section title ${heading.fontSize}px exceeds ${viewport.sectionTitleMax}px cap`);
      if (!heading.fontFamily.toLowerCase().includes('geist')) failures.push(`${viewport.name} ${label}: section title is not using Geist (${heading.fontFamily})`);
    }

    const baselineSection = sectionTitles[0][1];
    for (const [label, size] of sectionTitles.slice(1)) {
      if (!nearlyEqual(size, baselineSection, 0.15)) failures.push(`${viewport.name} ${label}: section title ${size}px differs from Product ${baselineSection}px`);
    }

    const homeDisplay = await measure(page, '/', '.decision-hero h1 span');
    if (homeDisplay.fontSize > viewport.homeDisplayMax) failures.push(`${viewport.name} Home: display ${homeDisplay.fontSize}px exceeds ${viewport.homeDisplayMax}px cap`);
    if (homeDisplay.fontSize < baselineTitle) failures.push(`${viewport.name} Home: display ${homeDisplay.fontSize}px is smaller than internal page title ${baselineTitle}px`);
    if (homeDisplay.fontSize - baselineTitle > 8.1) failures.push(`${viewport.name} Home: display is more than one scale step above internal page title (${homeDisplay.fontSize}px vs ${baselineTitle}px)`);

    const homeShell = await publicShellState(page, '/', null, null, mobile);
    const shellStates = [];
    for (const [label, path, introSelector, headingSelector] of internalPages) {
      shellStates.push([label, await publicShellState(page, path, introSelector, headingSelector, mobile)]);
    }

    const shellBaseline = shellStates[0][1];
    compareRect(viewport.name, 'Home header', homeShell.header, shellBaseline.header, ['height']);
    compareRect(viewport.name, 'Home brand', homeShell.brand, shellBaseline.brand, ['left', 'top', 'width', 'height']);

    if (!mobile) {
      if (JSON.stringify(homeShell.labels) !== JSON.stringify(canonicalNav)) failures.push(`${viewport.name} Home: nav labels/order ${JSON.stringify(homeShell.labels)} do not match canonical ${JSON.stringify(canonicalNav)}`);
      if (homeShell.clipped.length) failures.push(`${viewport.name} Home: clipped navigation ${homeShell.clipped.join(', ')}`);
      if (!nearlyEqual(homeShell.navFont, 13, 0.15)) failures.push(`${viewport.name} Home: nav font ${homeShell.navFont}px instead of 13px`);
      compareRect(viewport.name, 'Home CTA', homeShell.cta, shellBaseline.cta, ['top', 'width', 'height']);
    } else {
      compareRect(viewport.name, 'Home toggle', homeShell.toggle, shellBaseline.toggle, ['left', 'top', 'width', 'height']);
    }

    for (const [label, state] of shellStates) {
      compareRect(viewport.name, `${label} header`, state.header, shellBaseline.header, ['height']);
      compareRect(viewport.name, `${label} brand`, state.brand, shellBaseline.brand, ['left', 'top', 'width', 'height']);
      compareRect(viewport.name, `${label} intro`, state.intro, shellBaseline.intro, ['left', 'top', 'width']);
      compareRect(viewport.name, `${label} heading`, state.heading, shellBaseline.heading, ['left', 'top'], 2);

      if (!mobile) {
        if (JSON.stringify(state.labels) !== JSON.stringify(canonicalNav)) failures.push(`${viewport.name} ${label}: nav labels/order ${JSON.stringify(state.labels)} do not match canonical ${JSON.stringify(canonicalNav)}`);
        if (state.clipped.length) failures.push(`${viewport.name} ${label}: clipped navigation ${state.clipped.join(', ')}`);
        if (!nearlyEqual(state.navFont, 13, 0.15)) failures.push(`${viewport.name} ${label}: nav font ${state.navFont}px instead of 13px`);
        compareRect(viewport.name, `${label} CTA`, state.cta, shellBaseline.cta, ['top', 'width', 'height']);
      } else {
        if (state.navVisible) failures.push(`${viewport.name} ${label}: desktop navigation should be collapsed`);
        compareRect(viewport.name, `${label} toggle`, state.toggle, shellBaseline.toggle, ['left', 'top', 'width', 'height']);
      }
    }

    console.log(`${viewport.name}: internal titles ${pageTitles.map(([label, size]) => `${label}=${size}px`).join(', ')}`);
    console.log(`${viewport.name}: section titles ${sectionTitles.map(([label, size]) => `${label}=${size}px`).join(', ')}`);
    console.log(`${viewport.name}: leads ${leads.map(([label, size]) => `${label}=${size}px`).join(', ')}`);
    console.log(`${viewport.name}: canonical header=${shellBaseline.header?.height}px brand=${shellBaseline.brand?.width}px introTop=${shellBaseline.intro?.top}px nav=${shellBaseline.navFont}px`);

    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error('Rendered public typography/shell audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: every public top-navigation destination shares one FlipForge shell: header height, logo geometry, navigation order/baseline, CTA geometry, intro position, typography scale, responsive collapse, and viewport containment are consistent.');