const CACHE='flipforge-shell-v13';
const SHELL=[
  '/',
  '/index.html',
  '/assets/css/site.css',
  '/assets/css/brand-v2.css',
  '/assets/css/visual-sections.css',
  '/assets/css/marketing-v3.css',
  '/assets/css/marketing-density-v1.css',
  '/assets/css/homepage-focus-v1.css',
  '/assets/css/homepage-conversion-v2.css',
  '/assets/css/homepage-evidence-v1.css',
  '/assets/css/homepage-contender-v1.css',
  '/assets/js/homepage-v1.js',
  '/assets/js/homepage-contender-v1.js',
  '/assets/brand/flipforge-app-icon-dark.svg',
  '/assets/images/flipforge-homepage-dashboard.svg'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>{}));
});

self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
  ]));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html').then(response=>response||caches.match('/'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
