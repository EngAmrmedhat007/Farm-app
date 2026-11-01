const CACHE='farm-v9';
const FILES=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png'];
self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    await Promise.all(FILES.map(async f=>{
      const r=await fetch(new Request(f,{cache:'reload'}));
      if(r&&r.ok)await c.put(f,r);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
// network first: always the newest files when online, saved copy when offline
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET'||new URL(req.url).origin!==location.origin)return;
  e.respondWith((async()=>{
    try{
      const r=await fetch(new Request(req,{cache:'no-cache'}));
      if(r&&r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp))}
      return r;
    }catch(err){
      const hit=await caches.match(req,{ignoreSearch:true});
      if(hit)return hit;
      if(req.mode==='navigate'){const idx=await caches.match('index.html');if(idx)return idx}
      throw err;
    }
  })());
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window'}).then(cs=>{for(const c of cs){if('focus' in c)return c.focus()}return self.clients.openWindow('./')}))});
