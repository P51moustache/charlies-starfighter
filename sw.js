const PREFIX = "charlies-starfighter-";
const CACHE = PREFIX + "3f0d69c2fd3e";
const FILES = ["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./icon-maskable-512.png","./voice/032c0fbc.mp3?v=23ba677a8b","./voice/0447af4e.mp3?v=430af6d398","./voice/055c8da1.mp3?v=2ba495ae4b","./voice/059c0416.mp3?v=6a5e4f288f","./voice/05e41d77.mp3?v=60833d8508","./voice/06684a96.mp3?v=872a764c55","./voice/06b2883b.mp3?v=15dc0692f6","./voice/0deb40ca.mp3?v=10271bf0dc","./voice/0ff6191c.mp3?v=c50d3abd63","./voice/1075bb36.mp3?v=6037e330ba","./voice/1226f31b.mp3?v=4ebd6b6711","./voice/145d32f7.mp3?v=699ae1ac0f","./voice/146924c5.mp3?v=a724df2d29","./voice/1580a9f5.mp3?v=cf4ef5d6c9","./voice/19bd42b2.mp3?v=d51479bfb3","./voice/1a690133.mp3?v=8bbc2793d1","./voice/1ac903b7.mp3?v=cc628db5b0","./voice/1b665ba5.mp3?v=074d4ea32c","./voice/1d93ac37.mp3?v=60d78195ac","./voice/1e68daf1.mp3?v=b5c6006965","./voice/1eb39f8a.mp3?v=04766e10b8","./voice/21b6c631.mp3?v=3eacf3b5a0","./voice/237f5b06.mp3?v=3ce66b6b66","./voice/26f951c3.mp3?v=06aa8040bd","./voice/270ac219.mp3?v=400a3e7328","./voice/2b6925cc.mp3?v=2e8a436d28","./voice/2dd51695.mp3?v=561e4e2aeb","./voice/2f252aa5.mp3?v=2f5a039d3d","./voice/2f5e560e.mp3?v=d67f81bdc8","./voice/3733143d.mp3?v=ed0ec8d75b","./voice/38b09538.mp3?v=3cae21972f","./voice/38f1ceb2.mp3?v=d44095505b","./voice/39dae950.mp3?v=ddbe9f0134","./voice/3ade7d1c.mp3?v=7763ad0993","./voice/3d41ee14.mp3?v=e0fcaedc1f","./voice/3f8bcbff.mp3?v=328d8a8d92","./voice/418e2c93.mp3?v=878d99eddd","./voice/43e565db.mp3?v=0acef9b827","./voice/45992f39.mp3?v=e1d6ef8dc8","./voice/46a15a02.mp3?v=2806f0e980","./voice/48747340.mp3?v=2355d47c8a","./voice/4901d6bd.mp3?v=07302f2405","./voice/49288200.mp3?v=2736dc9717","./voice/4be278da.mp3?v=47a5568aa0","./voice/4c0c741d.mp3?v=7a6bae3cb4","./voice/5240cc4b.mp3?v=c308c43c77","./voice/52e666f6.mp3?v=760ae4fde9","./voice/53e842f5.mp3?v=dd15448fcb","./voice/54368781.mp3?v=ddb8a0d63f","./voice/54b8dd4c.mp3?v=725790f138","./voice/57948493.mp3?v=c3d136ec52","./voice/5b808604.mp3?v=0e21a7f6fa","./voice/5f75f39e.mp3?v=6fb78f045c","./voice/63aab6e1.mp3?v=a9b17ce6dd","./voice/6511de7b.mp3?v=c45cfb2096","./voice/65ae99ca.mp3?v=9e3598cddf","./voice/67b4e929.mp3?v=23fb9e140e","./voice/6b111ed1.mp3?v=8ee6b6b496","./voice/6c603ce2.mp3?v=8554b12215","./voice/71c931e9.mp3?v=64caa7008b","./voice/7bf76a7b.mp3?v=97ee90f94a","./voice/7c522e40.mp3?v=1841349c04","./voice/7ce4fddc.mp3?v=072a4d0347","./voice/7e34e9f5.mp3?v=e8b3dfde02","./voice/80721214.mp3?v=fdcc8e6e33","./voice/80d1abc2.mp3?v=1470e0bede","./voice/849a5d84.mp3?v=5e88c00bd9","./voice/8bde696e.mp3?v=7b998b2706","./voice/8c5d0829.mp3?v=60ed7ffcc6","./voice/9021efff.mp3?v=6d255541b8","./voice/9065bf2d.mp3?v=59aa9b2f42","./voice/90bacace.mp3?v=9e3462b6b6","./voice/92900ed7.mp3?v=69f1b9a2e4","./voice/946e54ae.mp3?v=43992287b1","./voice/996598bc.mp3?v=602b1d40f3","./voice/99893701.mp3?v=72a82c7be7","./voice/9b037087.mp3?v=757d478025","./voice/9d2371a4.mp3?v=54ead4829d","./voice/a3207f1d.mp3?v=7c757069e9","./voice/a500c9d4.mp3?v=94b221a956","./voice/a5ae08ce.mp3?v=c976c1ba2f","./voice/a6ebd31b.mp3?v=912642fa87","./voice/a7a0742c.mp3?v=f87f8e5240","./voice/a87c289e.mp3?v=29ba538d76","./voice/a9aa1e7e.mp3?v=24b1d20556","./voice/aff72b30.mp3?v=17e6eec42f","./voice/b0d04787.mp3?v=3d00cafdc2","./voice/b24b9517.mp3?v=cf88f2bae0","./voice/b50d660c.mp3?v=dbcc25a481","./voice/ba16f115.mp3?v=f8caf1e1a9","./voice/bb82389a.mp3?v=72ff071055","./voice/bdb4d28b.mp3?v=178aeabb3e","./voice/c3453170.mp3?v=ad3b485634","./voice/c3ec67c3.mp3?v=209d06bf93","./voice/c53bfc06.mp3?v=2001299fc8","./voice/c5818c6b.mp3?v=b0ca7df8e7","./voice/c7374ec1.mp3?v=4dba76cd4a","./voice/c748fb00.mp3?v=7358367cc3","./voice/c979c1eb.mp3?v=e79ce39297","./voice/d3ab9f46.mp3?v=1bbe8a9cc5","./voice/d413ae83.mp3?v=64384ed50c","./voice/d552ed0d.mp3?v=a20451a749","./voice/e26dd8e5.mp3?v=4285cbe78c","./voice/e3710753.mp3?v=4e2895b08c","./voice/e5ffb295.mp3?v=db83041886","./voice/e84b69b3.mp3?v=a66949d9ae","./voice/eab4c7e1.mp3?v=f9bcd3af49","./voice/eac239f9.mp3?v=6f1030cb50","./voice/efd3ed8a.mp3?v=13aa9f92aa","./voice/f28acf2f.mp3?v=523d1e526d","./voice/f2c54bb9.mp3?v=bafa474c78","./voice/f4d8ddf1.mp3?v=5a190bf128","./voice/f775b410.mp3?v=99f5ad2f9f","./voice/f9e93345.mp3?v=f74be76a95","./voice/custom/dark-lord-challenge.m4a?v=f7f021e4e6","./voice/custom/dark-lord-defeated.m4a?v=d65d25450e","./voice/custom/dark-lord-halfway.m4a?v=061a83944d","./voice/custom/dark-lord-rematch.m4a?v=8ade53ef6c","./voice/custom/dark-lord-retreat.m4a?v=512bd38a59","./voice/custom/dark-lord-victorious.m4a?v=1ee4a42be2","./voice/custom/incoming-transmission.m4a?v=2112dcece9","./voice/custom/trooper-alert.m4a?v=24cef62eaa","./voice/custom/update-dark-lord.m4a?v=b99d0a5608","./voice/custom/update-game-master.m4a?v=51aa7a1b74","./voice/custom/update-look-down.m4a?v=7eec950c3b","./voice/custom/update-new-voices.m4a?v=ef4afebad8","./voice/custom/update-tough-walkers.m4a?v=76c372f7d3","./music/ice-e84eb97b.m4a?v=e84eb97bff","./music/space-567e6346.m4a?v=567e6346f0","./music/theme-8d757f21.m4a?v=8d757f2186"];
/** Files that are only ever read live from the site, never from the cache. */
const LIVE_FILES = ['/version.json', '/events.json'];
const isLive = (path) => LIVE_FILES.some((name) => path.endsWith(name));
/** A file whose address carries its content hash: the same address always means the same bytes. */
const HASHED = /[?&]v=/;

/** An identical copy of a content-hashed file from this version's own cache or an older one, or undefined. */
async function copyOf(url, names) {
  if (!HASHED.test(url)) return undefined;
  for (const name of names) {
    const cached = await (await caches.open(name)).match(url);
    if (cached) return cached;
  }
  return undefined;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // This version's own cache first: an install cut short picks up where it left off.
      const names = [CACHE, ...(await caches.keys()).filter((key) => key.startsWith(PREFIX) && key !== CACHE)];
      const fresh = [];
      await Promise.all(
        FILES.map(async (url) => {
          const copy = await copyOf(url, names);
          if (copy) await cache.put(url, copy);
          // 'reload' skips the browser's HTTP cache, so a new version never stores an older copy of a file.
          else fresh.push(new Request(url, { cache: 'reload' }));
        }),
      );
      await cache.addAll(fresh);
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  // version.json, events.json and anything asked for with no-store (a newer version's voice clip) always go to the
  // network: they are how a running game finds and greets a new version and hears from the Game Master.
  if (request.method !== 'GET' || request.cache === 'no-store' || isLive(new URL(request.url).pathname)) return;
  // ignoreSearch: the page asks for voice/x.mp3, the cache holds voice/x.mp3?v=<hash> (and ./ answers ./?update=...).
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request).catch(() => caches.match('./index.html'))),
  );
});
