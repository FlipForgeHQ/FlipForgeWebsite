import { chromium } from 'playwright';

const baseUrl = process.env.FLIPFORGE_PUBLIC_AUDIT_URL || 'http://127.0.0.1:4173';
const viewports = [
  { name: 'desktop', width: 1440, height: 1000, pageTitleMax: 48.1, sectionTitleMax: 36.1, homeDisplayMax: 54.1 },
  { name: 'mobile', width: 390, height: 844, pageTitleMax: 40.1, sectionTitleMax: 30.1, homeDisplayMax: 44.1 }
];

const internalPages = [
  ['Product', '/product.html'],
  ['Evidence Lab', '/learn.html'],
  ['Launch Plans', '/pricing.html'],
  ['About', '/about.html'],
  ['Beta', '/beta-application.html'],
  ['FAQ', '/faq.html']
];

const sectionPages = [
  ['Product', '/product.html'],
  ['Evidence Lab', '/learn.html'],
  ['Launch Plans', '/pricing.html'],
  ['About', '/about.html']
];

const failures = [];
const nearlyEqual = (a, b, tolerance = 0.15) => Math.abs(a - b) <= tolerance;
const px = value => Number.parseFloat(value || 'NaN');

async function measure(page, path, selector) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
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

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();

    const pageTitles = [];
    const leads = [];
    const sectionTitles = [];

    for (const [label, path] of internalPages) {
      const title = await measure(page, path, '.page-hero h1');
      pageTitles.push([label, title.fontSize]);
      if (!title.fontFamily.toLowerCase().includes('geist')) failures.push(`${viewport.name} ${label}: page title is not using Geist (${title.fontFamily})`);
      if (title.fontSize > viewport.pageTitleMax) failures.push(`${viewport.name} ${label}: page title ${title.fontSize}px exceeds ${viewport.pageTitleMax}px cap`);

      const lead = await measure(page, path, '.page-hero .lead');
      leads.push([label, lead.fontSize]);
      if (!nearlyEqual(lead.fontSize, 16, 0.15)) failures.push(`${viewport.name} ${label}: lead ${lead.fontSize}px is not the 16px shared role`);
    }

    const baselineTitle = pageTitles[0][1];
    for (const [label, size] of pageTitles.slice(1)) {
      if (!nearlyEqual(size, baselineTitle)) failures.push(`${viewport.name} ${label}: page title ${size}px differs from Product ${baselineTitle}px`);
    }

    const baselineLead = leads[0][1];
    for (const [label, size] of leads.slice(1)) {
      if (!nearlyEqual(size, baselineLead)) failures.push(`${viewport.name} ${label}: lead ${size}px differs from Product ${baselineLead}px`);
    }

    for (const [label, path] of sectionPages) {
      const heading = await measure(page, path, '.section-head h2');
      sectionTitles.push([label, heading.fontSize]);
      if (heading.fontSize > viewport.sectionTitleMax) failures.push(`${viewport.name} ${label}: section title ${heading.fontSize}px exceeds ${viewport.sectionTitleMax}px cap`);
      if (!heading.fontFamily.toLowerCase().includes('geist')) failures.push(`${viewport.name} ${label}: section title is not using Geist (${heading.fontFamily})`);
    }

    const baselineSection = sectionTitles[0][1];
    for (const [label, size] of sectionTitles.slice(1)) {
      if (!nearlyEqual(size, baselineSection)) failures.push(`${viewport.name} ${label}: section title ${size}px differs from Product ${baselineSection}px`);
    }

    const homeDisplay = await measure(page, '/', '.decision-hero h1 span');
    if (homeDisplay.fontSize > viewport.homeDisplayMax) failures.push(`${viewport.name} Home: display ${homeDisplay.fontSize}px exceeds ${viewport.homeDisplayMax}px cap`);
    if (homeDisplay.fontSize < baselineTitle) failures.push(`${viewport.name} Home: display ${homeDisplay.fontSize}px is smaller than internal page title ${baselineTitle}px`);
    if (homeDisplay.fontSize - baselineTitle > 8.1) failures.push(`${viewport.name} Home: display is more than one scale step above internal page title (${homeDisplay.fontSize}px vs ${baselineTitle}px)`);

    await page.goto(`${baseUrl}/learn.html`, { waitUntil: 'networkidle' });
    const navSize = px(await page.$eval('.site-header .desktop-nav a', el => getComputedStyle(el).fontSize));
    if (!nearlyEqual(navSize, 13, 0.15)) failures.push(`${viewport.name}: desktop navigation resolved to ${navSize}px instead of 13px`);

    console.log(`${viewport.name}: internal titles ${pageTitles.map(([label, size]) => `${label}=${size}px`).join(', ')}`);
    console.log(`${viewport.name}: section titles ${sectionTitles.map(([label, size]) => `${label}=${size}px`).join(', ')}`);
    console.log(`${viewport.name}: leads ${leads.map(([label, size]) => `${label}=${size}px`).join(', ')}`);
    console.log(`${viewport.name}: Home=${homeDisplay.fontSize}px, nav=${navSize}px`);

    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error('Rendered public typography audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: rendered public typography roles are consistent across Home, Product, Evidence Lab, Launch Plans, About, Beta, and FAQ at desktop and mobile viewports.');
