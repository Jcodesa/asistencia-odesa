// Servicio del panel del administrador: permite instalarlo como app. No guarda datos en el equipo;
// todo se consulta siempre al motor (la hoja de Google).
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (ev) { ev.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (ev) {
  if (ev.request.method !== 'GET' || ev.request.mode !== 'navigate') return;
  ev.respondWith(fetch(ev.request).catch(function () {
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
      '<p style="font:18px system-ui;padding:24px">Sin conexión a internet. El panel necesita internet para funcionar.</p>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }));
});
