import { chromium } from 'playwright';

const baseUrl = process.env.FLIPFORGE_PUBLIC_AUDIT_URL || 'http://127.0.0.1:4173';

const pages = [
  ['Home', '/'],
  ['Product', '/product.html'],
  ['Decision Intelligence', '/decision-intelligence.html'],
  ['Evidence Lab', '/learn.html'],
  ['Launch Plans', '/pricing.html'],
  ['About', '/about.html'],
  ['Beta Access', '/beta-application.html'],
  ['FAQ', '/faq.html']
];

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 900, height: 800 },
  { name: 'desktop', width: 1440, height: 1000 }
];

const failures = [];

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();

    for (const [label, path] of pages) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.fonts?.status === 'loaded' || !document.fonts, null, { timeout: 5000 }).catch(() => {});

      const issues = await page.evaluate(() => {
        const parseRgb = value => {
          const match = String(value || '').match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)/i);
          if (!match) return null;
          return { r:+match[1], g:+match[2], b:+match[3], a:match[4] == null ? 1 : +match[4] };
        };
        const channel = value => {
          const v = value / 255;
          return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
        };
        const luminance = rgb => .2126 * channel(rgb.r) + .7152 * channel(rgb.g) + .0722 * channel(rgb.b);
        const contrast = (a,b) => {
          const l1 = luminance(a), l2 = luminance(b);
          return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
        };
        const backgroundFor = el => {
          let node = el;
          while (node && node !== document.documentElement) {
            const bg = parseRgb(getComputedStyle(node).backgroundColor);
            if (bg && bg.a >= .85) return bg;
            node = node.parentElement;
          }
          return { r:5, g:8, b:12, a:1 };
        };
        const visible = el => {
          const style = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > .01 && box.width > 0 && box.height > 0;
        };

        /* Audit explanatory/public-reading copy only. Micro-badges, controls, stage
         * numbers, and CTA labels are governed by their component contracts and
         * should not be forced into body-copy sizing. */
        const selectors = [
          '.ff-approved-graphic figcaption',
          '.ff-approved-data-summary p',
          '.lead',
          '.section-copy',
          '.ffg-heading p',
          '.ffg-caption',
          '.ffg-case-panel p',
          '.ffg-beta-entry p',
          '.ffg-beta-result p',
          '.ffg-depth-plane p',
          '.ff-df-stage-copy',
          '.ff-df-footer p',
          '.ff-df-reveal-card>p',
          '.ff-df-why p',
          '.ff-product-copy>p',
          '.ff-founder-card p',
          '.ff-mission-card p',
          '.ff-page-vision p',
          '.faq-answer',
          '.ff-faq-intro',
          '.ff-beta-notice p',
          '.ff-pricing-boundaries p',
          '.ff-beta-expectations p',
          '.ff-lab-card p',
          '.ff-lab-case p'
        ];

        const candidates = [...new Set(selectors.flatMap(selector => [...document.querySelectorAll(selector)]))].filter(visible);

        return candidates.map(el => {
          const style = getComputedStyle(el);
          const textColor = parseRgb(style.color);
          const bg = backgroundFor(el);
          const size = Number.parseFloat(style.fontSize || '0');
          const ratio = textColor ? contrast(textColor,bg) : 0;
          const text = (el.textContent || '').replace(/\s+/g,' ').trim().slice(0,120);
          const role = `${el.tagName.toLowerCase()}.${String(el.className || '').replace(/\s+/g,'.').slice(0,120)}`;
          const isCaption = el.matches('.ff-approved-graphic figcaption,.ff-approved-data-summary p,.ffg-caption');
          const minSize = isCaption ? 13 : 12;
          const minContrast = 7;
          const problems = [];
          if (size < minSize) problems.push(`font ${size}px < ${minSize}px`);
          if (ratio < minContrast) problems.push(`contrast ${ratio.toFixed(2)} < ${minContrast}`);
          return problems.length ? { role, text, size, ratio:Number(ratio.toFixed(2)), problems } : null;
        }).filter(Boolean);
      });
      if (issues.length) {
        for (const issue of issues) {
          failures.push(`${viewport.name} ${label}: ${issue.role} "${issue.text}" — ${issue.problems.join(', ')}`);
        }
      }
    }

    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error('Public readability audit failed:');
  failures.slice(0,240).forEach(failure => console.error(`- ${failure}`));
  if (failures.length > 240) console.error(`... ${failures.length - 240} more failures`);
  process.exit(1);
}

console.log('PASS: public text meets FlipForge minimum rendered size and high-contrast requirements across mobile, tablet, and desktop.');
