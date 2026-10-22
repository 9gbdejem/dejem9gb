// Mantém a aplicação instalável sem armazenar páginas antigas em cache.
const REVISAO_PWA = '20261022-1';
const PREFIXO_CACHE = 'dejem9gb-';

self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cachesExistentes = await caches.keys();
        await Promise.all(
            cachesExistentes
                .filter((nome) => nome.startsWith(PREFIXO_CACHE) && nome !== `${PREFIXO_CACHE}${REVISAO_PWA}`)
                .map((nome) => caches.delete(nome))
        );

        await self.clients.claim();
    })());
});
