const APP_VERSION="0.3.1";
const SHELL_CACHE=`pwd-shell-${APP_VERSION}`;
const RUNTIME_CACHE="pwd-runtime-v5";
const APP_SHELL=[
"./","./index.html","./styles.css","./app.js","./ai.js","./ai-worker.js","./cpu-worker.js","./whisper-worker.js","./smolvlm-worker.js","./pwa.js","./manifest.webmanifest","./version.json","./icon.svg",
"./modules/i18n.js","./modules/db.js","./modules/agent.js","./modules/benchmark.js","./modules/offline.js","./modules/gpu.js","./modules/p2p.js","./modules/voice.js","./modules/vision.js","./modules/media.js","./modules/vlm.js"
];
self.addEventListener("install",e=>e.waitUntil(caches.open(SHELL_CACHE).then(c=>c.addAll(APP_SHELL))));
self.addEventListener("activate",e=>e.waitUntil((async()=>{const ks=await caches.keys();await Promise.all(ks.filter(k=>k.startsWith("pwd-shell-")&&k!==SHELL_CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener("message",e=>{if(e.data?.type==="SKIP_WAITING")self.skipWaiting();});
self.addEventListener("fetch",e=>{
 if(e.request.method!=="GET")return;
 const u=new URL(e.request.url);
 if(u.origin===self.location.origin){
  e.respondWith((async()=>{try{const r=await fetch(e.request,{cache:"no-store"});const c=await caches.open(SHELL_CACHE);c.put(e.request,r.clone());return r;}catch(_){return(await caches.match(e.request))||(await caches.match("./index.html"));}})());return;
 }
 if(["esm.run","cdn.jsdelivr.net","storage.googleapis.com"].includes(u.hostname)){
  e.respondWith((async()=>{const hit=await caches.match(e.request);if(hit)return hit;const r=await fetch(e.request);const c=await caches.open(RUNTIME_CACHE);c.put(e.request,r.clone());return r;})());
 }
});