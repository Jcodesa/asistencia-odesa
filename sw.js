// Servicio de avisos de la app Asistencia ODESA.
// Queda instalado en el celular y muestra la notificación cuando el motor (la hoja de Google) lo pide,
// aunque la app esté cerrada.

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (ev) { ev.waitUntil(self.clients.claim()); });

// Texto de respaldo, por si el celular no logra consultar al motor: se decide por la hora de Colombia.
function textoPorHora() {
  var hora = new Date(Date.now() - 5 * 3600000).getUTCHours();
  return hora < 12
    ? { titulo: 'ODESA: marca tu ENTRADA', cuerpo: 'Toca aquí para registrar tu llegada a la obra.' }
    : { titulo: 'ODESA: marca tu SALIDA', cuerpo: 'Sin la salida no se cuentan tus horas. Toca aquí.' };
}

function leerAjustes() {
  return caches.open('odesa-ajustes')
    .then(function (c) { return c.match('ajustes.json'); })
    .then(function (r) { return r ? r.json() : null; })
    .catch(function () { return null; });
}

// Le pregunta al motor qué decir exactamente (entrada, salida o prueba). Espera máximo 6 segundos.
function consultarTexto() {
  return leerAjustes().then(function (a) {
    if (!a || !a.api) return null;
    var espera = new Promise(function (listo) { setTimeout(function () { listo(null); }, 6000); });
    var consulta = fetch(a.api + '?accion=aviso&disp=' + encodeURIComponent(a.disp || ''), { redirect: 'follow' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    return Promise.race([consulta, espera]);
  });
}

self.addEventListener('push', function (ev) {
  ev.waitUntil(consultarTexto().then(function (t) {
    if (!t || !t.titulo) t = textoPorHora();
    // Un mensaje o anuncio de la oficina no reemplaza al aviso de marcar ni a otro mensaje.
    var msj = t.mensaje === true;
    return self.registration.showNotification(t.titulo, {
      body: t.cuerpo || '',
      icon: 'icono-192.png',
      badge: 'insignia.png',
      tag: msj ? 'odesa-mensaje-' + Date.now() : 'odesa-asistencia',
      renotify: true,
      requireInteraction: true,
      vibrate: [600, 200, 600, 200, 600, 200, 900],
      actions: [t.abrir === 'chat' ? { action: 'ver', title: 'Responder' } : msj ? { action: 'ver', title: 'Ver mensaje' } : { action: 'marcar', title: 'Marcar ahora' }],
      data: { abrir: t.abrir || '' }
    });
  }));
});

// Al tocar la notificación se abre la app (o se trae al frente si ya estaba abierta).
self.addEventListener('notificationclick', function (ev) {
  ev.notification.close();
  var abrir = (ev.notification.data && ev.notification.data.abrir) || '';   // 'chat' = respuesta de la oficina
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ventanas) {
    for (var i = 0; i < ventanas.length; i++) {
      if ('focus' in ventanas[i]) {
        if (abrir && ventanas[i].postMessage) ventanas[i].postMessage({ abrir: abrir });
        return ventanas[i].focus();
      }
    }
    return self.clients.openWindow(abrir ? './#' + abrir : './');
  }));
});
