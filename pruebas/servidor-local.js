// Servidor de pruebas: publica la app en este computador y pone al frente un motor simulado
// (el mismo google/Codigo.gs, corriendo sobre el simulador de Google). Nada sale a internet.
//
//   App:   http://localhost:8765/      Motor: http://localhost:8766/exec
//
// El motor responde igual que Google: primero una redirección y luego el resultado,
// desde una dirección distinta a la de la app (así se prueba lo mismo que pasará en GitHub Pages).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { entorno, raiz } = require('./simulador');

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

function iniciar(opciones) {
  const o = Object.assign({ puertoApp: 8765, puertoMotor: 8766, hora: '2026-10-05T07:02:00' }, opciones || {});
  const e = entorno();
  e.a(o.hora);
  e.ctx.instalar();
  e.hoja('Obras').getRange(2, 3).setValue('11.0041, -74.807');
  e.hoja('Configuración').getRange(2, 2).setValue('jefe@ejemplo.com');
  e.hoja('Trabajadores').getRange(2, 1, 1, 9).setValues([
    ['1045678901', 'PEDRO PÉREZ GÓMEZ', 'Oficial', 'PROPIO', '', 'ACTIVO', new Date(), '', '3001234567']]);

  const respuestas = {};
  let serie = 0;
  const cors = { 'Access-Control-Allow-Origin': '*' };

  const motor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/eco') {                       // segundo paso: el resultado
      const cuerpo = respuestas[url.searchParams.get('id')] || '{"ok":false}';
      delete respuestas[url.searchParams.get('id')];
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
      return res.end(cuerpo);
    }
    if (url.pathname === '/_estado') {                   // solo para las pruebas: qué quedó guardado
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
      return res.end(JSON.stringify({
        registros: e.filas('Registros'), obras: e.filas('Obras'), trabajadores: e.filas('Trabajadores'),
        avisos: e.filas('Avisos'), peticiones: e.peticiones, enlace: e.props.URL_APP_PUBLICA || ''
      }));
    }
    if (url.pathname === '/_hora') {                     // solo para las pruebas: mover el reloj del motor
      e.a(url.searchParams.get('t'));
      res.writeHead(200, cors); return res.end('ok');
    }
    if (url.pathname !== '/exec') { res.writeHead(404, cors); return res.end(); }
    const trozos = [];
    req.on('data', t => trozos.push(t));
    req.on('end', () => {
      let salida;
      if (req.method === 'POST') {
        salida = e.ctx.doPost({ postData: { contents: Buffer.concat(trozos).toString('utf8') } }).texto;
      } else {
        const parametros = {};
        url.searchParams.forEach((v, k) => { parametros[k] = v; });
        const r = e.ctx.doGet({ parameter: parametros });
        salida = r.texto || JSON.stringify({ ok: true, pantalla: r.archivo || 'aviso' });
      }
      const id = String(++serie);
      respuestas[id] = salida;
      res.writeHead(302, Object.assign({ Location: 'http://localhost:' + o.puertoMotor + '/eco?id=' + id }, cors));
      res.end();
    });
  });

  const app = http.createServer((req, res) => {
    let ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (ruta === '/') ruta = '/index.html';
    if (ruta === '/config.js') {                         // la app de pruebas apunta al motor simulado
      res.writeHead(200, { 'Content-Type': TIPOS['.js'] });
      return res.end("window.ODESA_API = 'http://localhost:" + o.puertoMotor + "/exec';");
    }
    const archivo = path.join(raiz, ruta);
    if (archivo.indexOf(raiz) !== 0 || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      res.writeHead(404); return res.end('No existe');
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(archivo));
  });

  return new Promise(listo => {
    motor.listen(o.puertoMotor, () => app.listen(o.puertoApp, () => listo({
      entorno: e,
      api: 'http://localhost:' + o.puertoMotor + '/exec',
      direccion: 'http://localhost:' + o.puertoApp + '/',
      cerrar() {
        motor.closeAllConnections && motor.closeAllConnections(); app.closeAllConnections && app.closeAllConnections();
        return new Promise(fin => motor.close(() => app.close(fin)));
      }
    })));
  });
}

module.exports = { iniciar };

if (require.main === module) {
  iniciar().then(s => console.log('App de pruebas en ' + s.direccion + '  (cédula de ejemplo: 1045678901). Ctrl+C para cerrar.'));
}
