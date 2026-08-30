import fs from 'node:fs';

const css=fs.readFileSync('saas-prototype/mobile-shell-v3.css','utf8');
const guide=fs.readFileSync('saas-prototype/guided-mode-compact-v1.css','utf8');
const failures=[];
const need=(label,text,needle)=>{if(!text.includes(needle))failures.push(`${label}: missing ${JSON.stringify(needle)}`);};

need('mobile shell purpose',css,'final phone chrome owner');
need('mobile topbar height',css,'height:54px!important');
need('mobile topbar columns',css,'grid-template-columns:40px minmax(0,1fr)!important');
need('mobile search height',css,'height:40px!important');
need('mobile topbar actions hidden',css,'.topbar-actions,.topbar>.topbar-actions,.notification-button,.profile-button,.date-button{display:none!important}');
need('mobile banner removed',css,'.prototype-banner{display:none!important}');
need('mobile sidebar off canvas',css,'transform:translateX(-105%)!important');
need('mobile sidebar open',css,'.app-shell[data-nav-open="true"] .sidebar{transform:translateX(0)!important}');
need('mobile content padding',css,'padding:12px 10px 82px!important');
need('cache-busted layout import',guide,'customer-layout-system-v2.css?v=20260829-4');
need('cache-busted mobile shell import',guide,'mobile-shell-v3.css?v=20260829-1');

if(failures.length){console.error('Mobile shell v3 validation failed:');failures.forEach(x=>console.error(`- ${x}`));process.exit(1);}
console.log('PASS: mobile shell v3 ownership and cache-busted loading validated.');
