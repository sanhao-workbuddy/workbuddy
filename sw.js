const CACHE = 'sanhao-workbench-v9';  // v9: 适配 GitHub Pages 云端部署

/* ---- 所有需要预缓存的资源（含 HTML） ---- */
const PRECACHE_ASSETS = [
  '工作台.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // 逐个缓存，某个失败不影响其他
      Promise.allSettled(PRECACHE_ASSETS.map(url => c.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

/* ---- 缓存优先 + 后台更新（Stale-While-Revalidate） ---- */
/* 核心逻辑：有缓存就秒开，后台静默更新；没缓存才走网络 */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {

      const url = new URL(e.request.url);
      const isPage = e.request.mode === 'navigate' || url.pathname.includes('%E5%B7%A5') || url.pathname.includes('工作台');

      // 后台静默拉取最新版本（不阻塞用户）
      const backgroundUpdate = fetch(e.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
            // 如果是主页面更新了，通知前端刷新
            if (isPage && cached) {
              // 对比新旧内容是否不同
              Promise.all([cached.text(), clone.text()]).then(([oldText, newText]) => {
                if (oldText !== newText) {
                  self.clients.matchAll().then(clients => {
                    clients.forEach(cl => cl.postMessage({ type: 'CONTENT_UPDATED' }));
                  });
                }
              });
            }
          }
          return response;
        })
        .catch(() => null);

      // 1) 有缓存 → 立刻返回（秒开），后台同时更新
      if (cached) {
        return cached;
      }

      // 2) 没缓存（首次访问 / 缓存被清） → 等网络
      return backgroundUpdate.then(response => {
        if (response) return response;

        // 3) 网络也挂了 → 离线提示页
        return new Response(
          '<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">'
          + '<meta name="viewport" content="width=device-width,initial-scale=1">'
          + '<title>离线</title><style>'
          + 'body{background:#FAF6EF;color:#D97757;font-family:-apple-system,sans-serif;'
          + 'display:flex;align-items:center;justify-content:center;height:100vh;margin:0}'
          + '</style></head><body><div style="text-align:center;padding:2rem">'
          + '<p style="font-size:2rem;margin-bottom:.5rem">📱</p>'
          + '<p style="font-size:1.1rem;font-weight:600;margin-bottom:.3rem">首次使用需要联网加载</p>'
          + '<p style="font-size:.9rem;opacity:.7">请连接网络后重新打开</p>'
          + '</div></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      });
    })
  );
});
