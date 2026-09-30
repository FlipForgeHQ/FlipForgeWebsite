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
          const c = value / 255;
          return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);
        };
        const luminance = rgb => .2126 * channel(rgb.r) + .7152 * channel(rgb.g) + .0722 * channel(rgb.b);
        const contrast = (a,b) => {
          const l1 = luminance(a), l2 = luminance(b);
          return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
        };
        const visible = el => {
          const style = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > .01 && box.width > 0 && box.height > 0;
        };
        const ownText = el => [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent || '').join(' ').replace(/\s+/g,' ').trim();
        const backgroundFor = el => {
          let node = el;
          while (node && node !== document.documentElement) {
            const bg = parseRgb(getComputedStyle(node).backgroundColor);
            if (bg && bg.a >= .85) return bg;
            node = node.parentElement;
          }
          return { r:5, g:8, b:12, a:1 };
        };

        const skip = el =>
          el.closest('svg') ||
          el.closest('.ffg-slab-label') ||
          el.closest('.ffg-mini-card') ||
          el.closest('input,textarea,select');

        const candidates = [...document.querySelectorAll('main#main *')].filter(el => {
          if (!visible(el) || skip(el)) return false;
          const text = ownText(el);
          if (!text) return false;
          const size = Number.parseFloat(getComputedStyle(el).fontSize || '0');
          const cls = String(el.className || '');
          return size <= 13.5 || /caption|small|meta|note|label|copy|status|summary|footer|helper|sub/i.test(cls);
        });

        return candidates.map(el => {
          const style = getComputedStyle(el);
          const textColor = parseRgb(style.color);
          const bg = backgroundFor(el);
          const size = Number.parseFloat(style.fontSize || '0');
          const ratio = textColor ? contrast(textColor,bg) : 0;
          const text = ownText(el).slice(0,100);
          const role = `${el.tagName.toLowerCase()}.${String(el.className || '').replace(/\s+/g,'.').slice(0,120)}`;
          const minContrast = size <= 13.5 ? 7 : 4.5;
          const minSize = /caption|figcaption|summary|copy|note|footer|helper/i.test(String(el.className || '')) || el.tagName === 'FIGCAPTION' ? 12 : 11;
          const problems = [];
          if (size < minSize) problems.push(`font ${size}px < ${minSize}px`);
          if (ratio < minContrast) problems.push(`contrast ${ratio.toFixed(2)} < ${minContrast}`);
          return problems.length ? { role, text, size, ratio:Number(ratio.toFixed(2)), problems } : null;
        }).filter(Boolean).slice(0,80);
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
