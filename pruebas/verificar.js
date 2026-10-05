// Verificación automática: ejecuta el motor (google/Codigo.gs) sobre un simulador de Google
// y recorre el uso real: instalar, registrarse, marcar, novedades, nómina y notificaciones.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { entorno, raiz } = require('./simulador');

let fallos = 0, pruebas = 0;
function ok(cond, texto) {
  pruebas++;
  if (cond) console.log('  ✓ ' + texto);
  else { fallos++; console.log('  ✗ ' + texto); }
}

/* ---------------- Pruebas ---------------- */
const FOTO = 'data:image/jpeg;base64,' + Buffer.from('foto').toString('base64');
const SUMMUS = { lat: 11.00410, lon: -74.80700 };

console.log('\n1. Instalación');
const e = entorno();
e.a('2026-10-05T06:00:00');
e.ctx.instalar();
ok(['Trabajadores', 'Obras', 'Actividades', 'Registros', 'Novedades', 'Nómina', 'Configuración', 'Avisos'].every(n => e.hoja(n)), 'crea las ocho hojas');
ok(!e.hoja('Hoja 1'), 'quita la hoja vacía por defecto');
ok(e.filas('Actividades').length === 16, 'carga las 16 actividades iniciales');
ok(e.disparadores.length === 2 && e.disparadores.some(d => d.getHandlerFunction() === 'avisosAutomaticos'), 'programa la revisión de cada noche y los avisos automáticos');
e.ctx.instalar();
ok(e.disparadores.length === 2 && e.filas('Actividades').length === 16 && e.filas('Configuración').length === 8, 'instalar dos veces no duplica nada');
ok(e.ctx.doGet().archivo === 'Index', 'la pantalla del celular se entrega desde el archivo Index');

// El administrador llena sus hojas.
e.hoja('Obras').getRange(2, 3).setValue(SUMMUS.lat + ', ' + SUMMUS.lon);
e.hoja('Trabajadores').getRange(2, 1, 2, 6).setValues([
  ['1.045.678.901', 'PEDRO PÉREZ GÓMEZ', 'Oficial', 'PROPIO', '', 'ACTIVO'],
  [72123456, 'LUIS DÍAZ MOLINA', 'Ayudante', 'SUBCONTRATADO', 'Acabados del Caribe', '']
]);
e.hoja('Configuración').getRange(2, 2).setValue('jefe@ejemplo.com');

console.log('\n2. Primera vez del trabajador');
let r = e.ctx.iniciar({ cedula: '1045678901' });
ok(r.trabajador && r.trabajador.nombre === 'PEDRO PÉREZ GÓMEZ', 'reconoce la cédula aunque en la hoja esté con puntos');
ok(r.trabajador.autorizo === false, 'pide la autorización de datos la primera vez');
ok(r.obras.length === 2 && r.obras[0].lat === SUMMUS.lat && r.obras[1].lat === '', 'lee las coordenadas pegadas de Google Maps');
e.ctx.aceptar({ cedula: '1045678901' });
ok(e.ctx.iniciar({ cedula: '1045678901' }).trabajador.autorizo === true, 'guarda la autorización');
r = e.ctx.iniciar({ cedula: '99887766' });
ok(r.trabajador === null && r.cedulaNueva === true, 'detecta una cédula que no está en la lista');
ok(e.ctx.aceptar({ cedula: '99887766', nombre: 'juan' }).ok === false, 'no acepta un nombre incompleto');
r = e.ctx.aceptar({ cedula: '99887766', nombre: ' carlos   ruiz ' });
ok(r.ok && r.nombre === 'CARLOS RUIZ' && e.filas('Trabajadores')[2][5] === 'POR VALIDAR', 'registra al nuevo como POR VALIDAR');

console.log('\n3. Marcar entrada');
const base = { cedula: '1045678901', obra: 'Summus', actividades: ['Armado de acero'], foto: FOTO, dispositivo: 'CEL-A' };
ok(e.ctx.marcar({ ...base, tipo: 'entrada', lat: '', lon: '' }).ok === false, 'rechaza la entrada sin GPS');
ok(e.ctx.marcar({ ...base, tipo: 'entrada', ...SUMMUS, foto: '' }).ok === false, 'rechaza la entrada sin foto');
ok(e.ctx.marcar({ ...base, tipo: 'entrada', ...SUMMUS, actividades: [] }).ok === false, 'rechaza la entrada sin actividad');
ok(e.ctx.marcar({ ...base, tipo: 'salida', ...SUMMUS }).ok === false, 'no deja marcar salida sin entrada');
e.a('2026-10-05T07:02:00');
r = e.ctx.marcar({ ...base, tipo: 'entrada', lat: SUMMUS.lat + 0.0003, lon: SUMMUS.lon, precision: 12 });
ok(r.ok && r.hora === '07:02' && r.ubicacion === 'EN OBRA' && r.distancia > 25 && r.distancia < 45, 'guarda la entrada con hora del servidor y distancia a la obra (' + r.distancia + ' m)');
ok(e.ctx.marcar({ ...base, tipo: 'entrada', ...SUMMUS }).ok === false, 'no deja marcar dos entradas seguidas');
let reg = e.filas('Registros');
ok(reg.length === 1 && reg[0][17] === 'ABIERTA' && /maps\?q=/.test(reg[0][9]) && /drive\.google/.test(reg[0][10]), 'la fila queda ABIERTA con enlace de mapa y de foto');
ok(e.archivos[0] === '2026-10-05_0702_ENTRADA_1045678901_PEDRO PÉREZ GÓMEZ.jpg', 'la foto queda con fecha, hora y nombre');
r = e.ctx.iniciar({ cedula: '1045678901' });
ok(r.abierta && r.abierta.entrada === '07:02' && r.abierta.obra === 'Summus', 'al volver a abrir el enlace ve su entrada');

// Luis marca desde el mismo celular y lejos de la obra.
e.ctx.aceptar({ cedula: '72123456' });
e.a('2026-10-05T07:10:00');
r = e.ctx.marcar({ cedula: '72123456', tipo: 'entrada', obra: 'Summus', actividades: ['Enchape y acabados'], foto: FOTO, dispositivo: 'CEL-A', lat: 10.9800, lon: -74.8000, precision: 20 });
ok(r.ok && r.ubicacion === 'FUERA DE OBRA' && r.distancia > 2000, 'marca FUERA DE OBRA cuando está lejos (' + r.distancia + ' m)');
reg = e.filas('Registros');
ok(/Fuera de obra/.test(reg[1][18]) && /mismo celular que PEDRO/.test(reg[1][18]), 'anota las alertas: fuera de obra y celular compartido');

console.log('\n4. Marcar salida');
e.a('2026-10-05T16:32:00');
r = e.ctx.marcar({ ...base, tipo: 'salida', ...SUMMUS, precision: 8, actividades: ['Armado de acero', 'Fundida de concreto'], nota: 'Faltó alambre' });
ok(r.ok && r.hora === '16:32' && r.horas === 9.5, 'guarda la salida y calcula 9,5 horas');
reg = e.filas('Registros');
ok(reg[0][17] === 'COMPLETA' && reg[0][20] === 9.5 && reg[0][5] === 'Armado de acero / Fundida de concreto' && reg[0][19] === 'Faltó alambre', 'la fila queda COMPLETA con actividades, nota y horas a pagar');
r = e.ctx.iniciar({ cedula: '1045678901' });
ok(!r.abierta && r.cerradas.length === 1 && r.cerradas[0].horas === 9.5, 'el trabajador ve su jornada completa');

console.log('\n5. Revisión del día y nómina');
ok(e.ctx.revisarHoy() === 2 && e.filas('Novedades').some(f => f[3] === 'AÚN SIN SALIDA'), 'revisar a mano durante el día muestra quién sigue sin salida');
ok(e.filas('Registros')[1][17] === 'ABIERTA', 'revisar a mano durante el día no cierra jornadas abiertas');
ok(e.archivos.length === 3, 'las marcaciones rechazadas no dejan fotos sueltas en Drive');
e.a('2026-10-05T23:20:00');
const n = e.ctx.revisionAutomatica();
reg = e.filas('Registros');
ok(reg[1][17] === 'SIN SALIDA', 'la revisión nocturna cierra la jornada que quedó sin salida');
const nov = e.filas('Novedades');
ok(n === 2 && nov.some(f => f[3] === 'SIN SALIDA') && nov.some(f => f[3] === 'ALERTA') && !nov.some(f => f[3] === 'NO MARCÓ'), 'arma las novedades (sin salida y alertas; el nuevo por validar no cuenta como ausente)');
ok(e.correos.length === 1 && /2 novedades/.test(e.correos[0].asunto) && e.correos[0].a === 'jefe@ejemplo.com', 'envía el correo con el resumen');

// Día siguiente: Pedro marca, Luis no.
e.a('2026-10-06T07:00:00');
e.ctx.marcar({ ...base, tipo: 'entrada', ...SUMMUS });
e.a('2026-10-06T15:00:00');
e.ctx.marcar({ ...base, tipo: 'salida', ...SUMMUS });
e.a('2026-10-06T23:10:00');
e.ctx.revisionAutomatica();
ok(e.filas('Novedades').some(f => f[3] === 'NO MARCÓ' && f[2] === 'LUIS DÍAZ MOLINA'), 'al otro día reporta a quien no marcó');
ok(e.filas('Novedades').filter(f => e.ctx.fechaTxt_(f[0]) === '2026-10-05').length === 2, 'conserva las novedades de los días anteriores');

ok(e.ctx.actualizarNomina() === 2, 'el resumen de nómina incluye a los dos trabajadores con registros');
let nom = e.hoja('Nómina').celdas.slice(5).filter(f => f && f[0] !== '' && f[0] !== undefined);
const luis = nom.find(f => /LUIS/.test(f[1])), pedro = nom.find(f => /PEDRO/.test(f[1]));
ok(pedro[4] === 2 && pedro[5] === 17.5 && pedro[6] === 0, 'Pedro: 2 días y 17,5 horas a pagar');
ok(luis[4] === 0 && luis[5] === 0 && luis[6] === 1 && luis[7] === 1 && luis[3] === 'Acabados del Caribe', 'Luis: 0 horas, 1 jornada sin salida por justificar, 1 marcación fuera de obra');
// El administrador justifica la jornada de Luis.
e.hoja('Registros').getRange(3, 21).setValue(8);
e.ctx.actualizarNomina();
nom = e.hoja('Nómina').celdas.slice(5).filter(f => f && f[0] !== '' && f[0] !== undefined);
ok(nom.find(f => /LUIS/.test(f[1]))[5] === 8 && nom.find(f => /LUIS/.test(f[1]))[6] === 0, 'al justificar las horas a mano, entran a la nómina');
// Rango de fechas.
e.hoja('Nómina').getRange(2, 2, 2, 1).setValues([['2026-10-06'], ['2026-10-06']]);
e.ctx.actualizarNomina();
nom = e.hoja('Nómina').celdas.slice(5).filter(f => f && f[0] !== '' && f[0] !== undefined);
ok(nom.length === 1 && nom[0][5] === 8, 'respeta las fechas Desde / Hasta');

console.log('\n6. Casos límite');
{
  const x = entorno(); x.a('2026-10-05T07:00:00'); x.ctx.instalar();
  x.hoja('Trabajadores').getRange(2, 1, 1, 6).setValues([['555666777', 'ANA MARÍA SOTO', '', 'PROPIO', '', 'ACTIVO']]);
  const m = { cedula: '555666777', obra: 'Summus', actividades: ['Otra'], foto: FOTO, lat: 11, lon: -74.8 };
  x.ctx.marcar({ ...m, tipo: 'entrada' });
  x.a('2026-10-06T07:05:00');
  const s = x.ctx.marcar({ ...m, tipo: 'salida' });
  const en = x.ctx.marcar({ ...m, tipo: 'entrada' });
  const f = x.filas('Registros');
  ok(s.ok === false && en.ok && f[0][17] === 'SIN SALIDA' && f[1][17] === 'ABIERTA', 'si ayer no marcó salida, esa jornada se cierra como SIN SALIDA y hoy empieza una nueva');
  // 30 personas marcando seguidas
  for (let i = 0; i < 30; i++) {
    x.ctx.aceptar({ cedula: String(80000000 + i), nombre: 'OPERARIO NUMERO ' + i });
    x.ctx.marcar({ ...m, cedula: String(80000000 + i), tipo: 'entrada' });
  }
  ok(x.filas('Registros').length === 32 && x.filas('Trabajadores').length === 31, '30 trabajadores marcando seguidos: ninguna fila se pisa');
}
e.a('2026-10-07T07:00:00');
e.hoja('Trabajadores').getRange(2, 6).setValue('INACTIVO');
ok(e.ctx.marcar({ ...base, tipo: 'entrada', ...SUMMUS }).ok === false, 'un trabajador INACTIVO no puede marcar');
e.hoja('Configuración').getRange(4, 2).setValue('NO');
r = e.ctx.marcar({ cedula: '99887766', tipo: 'entrada', obra: 'Lago Mar Villa Campestre', actividades: ['Otra'], foto: FOTO, lat: '', lon: '' });
ok(r.ok && r.ubicacion === 'SIN GPS', 'con GPS opcional deja marcar, pero queda anotado SIN GPS');
r = e.ctx.marcar({ cedula: '72123456', tipo: 'entrada', obra: 'Lago Mar Villa Campestre', actividades: ['Otra'], foto: FOTO, lat: 11.03, lon: -74.87 });
ok(r.ok && r.ubicacion === 'OBRA SIN COORDENADAS', 'obra sin coordenadas: guarda la ubicación pero no puede comparar');
ok(e.ctx.marcar({ cedula: '72123456', tipo: 'entrada', obra: 'Obra inventada', actividades: ['Otra'], foto: FOTO, lat: 1, lon: 1 }).ok === false, 'rechaza una obra que no existe');
ok(e.ctx.quincena_().join() === '2026-10-01,2026-10-15', 'calcula la quincena en curso');
e.a('2026-02-20T10:00:00');
ok(e.ctx.quincena_().join() === '2026-02-16,2026-02-28', 'segunda quincena de febrero termina el 28');
e.a('2026-10-05T23:59:00');
ok(e.ctx.hoy_() === '2026-10-05', 'a las 11:59 p. m. sigue siendo el mismo día en Colombia');

console.log('\n7. Contador de tiempo');
{
  const x = entorno(); x.a('2026-10-05T06:55:00'); x.ctx.instalar(); x.ctx.doGet();
  x.hoja('Obras').getRange(2, 3).setValue(SUMMUS.lat + ', ' + SUMMUS.lon);
  x.hoja('Configuración').getRange(2, 2).setValue('jefe@ejemplo.com');
  x.hoja('Trabajadores').getRange(2, 1, 2, 9).setValues([
    ['1045678901', 'PEDRO PÉREZ GÓMEZ', '', 'PROPIO', '', 'ACTIVO', '', '', '3001234567'],
    ['72123456', 'LUIS DÍAZ MOLINA', '', 'SUBCONTRATADO', '', 'ACTIVO', '', '', '']]);
  const m = { obra: 'Summus', actividades: ['Otra'], foto: FOTO, ...SUMMUS };
  x.a('2026-10-05T07:02:00');
  x.ctx.marcar({ ...m, cedula: '1045678901', tipo: 'entrada' });
  x.a('2026-10-05T09:37:10');
  let i = x.ctx.iniciar({ cedula: '1045678901' });
  ok(i.ahoraMs - i.abierta.entradaMs === (2 * 3600 + 35 * 60 + 10) * 1000, 'el contador sale de la hora de Google: 2 h 35 min 10 s después de la entrada');
  ok(i.horaRecordatorio === '17:00' && i.trabajador.tieneCelular === true, 'la pantalla recibe la hora del recordatorio (17:00 por defecto)');

  console.log('\n8. Obra que no está en la lista');
  const aqui = { lat: 10.9905, lon: -74.7889 };
  let r = x.ctx.marcar({ cedula: '72123456', tipo: 'entrada', obra: 'altos del prado', obraNueva: { nombre: '  conjunto   altos del PRADO ', direccion: 'Cra 53 # 80' }, actividades: ['Otra'], foto: FOTO, ...aqui, precision: 10 });
  const ob = x.filas('Obras');
  ok(r.ok && r.obra === 'Conjunto Altos Del Prado' && ob.length === 3, 'el trabajador registra su obra y queda en la hoja Obras');
  ok(ob[2][2] === '10.9905, -74.7889' && ob[2][4] === 'POR VALIDAR' && ob[2][5] === 'LUIS DÍAZ MOLINA' && ob[2][1] === 'Cra 53 # 80', 'la obra nueva guarda la ubicación del celular, quién la creó y queda POR VALIDAR');
  let reg = x.filas('Registros');
  ok(reg[1][8] === 'EN OBRA' && /Obra nueva por validar/.test(reg[1][18]), 'la marcación queda con la alerta "Obra nueva por validar"');
  i = x.ctx.iniciar({ cedula: '1045678901' });
  ok(i.obras.length === 3 && i.obras[2].porValidar === true && i.obras[2].lat === 10.9905, 'la obra nueva les aparece de inmediato a los compañeros');
  x.a('2026-10-05T09:50:00');
  x.ctx.marcar({ ...m, cedula: '1045678901', tipo: 'salida' });
  r = x.ctx.marcar({ cedula: '1045678901', tipo: 'entrada', obra: '', obraNueva: { nombre: 'CONJUNTO ALTOS DEL PRÁDO' }, actividades: ['Otra'], foto: FOTO, lat: 10.9906, lon: -74.7889 });
  ok(r.ok && r.obra === 'Conjunto Altos Del Prado' && x.filas('Obras').length === 3, 'si otro escribe la misma obra (con tildes o mayúsculas distintas) no se duplica');
  ok(x.ctx.marcar({ cedula: '72123456', tipo: 'entrada', obra: '', obraNueva: { nombre: 'ab' }, actividades: ['Otra'], foto: FOTO, ...aqui }).ok === false, 'no acepta un nombre de obra demasiado corto');
  x.hoja('Obras').getRange(4, 5).setValue('NO');
  ok(x.ctx.iniciar({ cedula: '1045678901' }).obras.length === 2, 'si el administrador la rechaza (Activa = NO) deja de aparecer');
  x.ctx.aceptar({ cedula: '333444555', nombre: 'Mario Cano', celular: '3109998877' });
  r = x.ctx.marcar({ cedula: '333444555', tipo: 'entrada', obra: '', obraNueva: { nombre: 'conjunto altos del prado' }, actividades: ['Otra'], foto: FOTO, ...aqui });
  ok(r.ok === false && /cerrada/.test(r.mensaje) && x.filas('Obras').length === 3, 'una obra rechazada no se puede volver a crear con el mismo nombre');
  ok(x.ctx.aceptar({ cedula: '333444556', nombre: 'Otro Nombre', celular: '12345' }).ok === false && x.filas('Trabajadores')[2][8] === '3109998877', 'guarda el celular del trabajador y rechaza uno mal escrito');
  x.hoja('Obras').getRange(4, 5).setValue('POR VALIDAR');
  ok(x.ctx.revisarHoy() >= 1 && x.filas('Novedades').some(f => f[3] === 'OBRA POR VALIDAR' && /Altos Del Prado/.test(f[4])), 'las obras pendientes de aprobar salen en Novedades');

  console.log('\n9. Recordatorio de salida');
  x.a('2026-10-05T16:50:00');
  ok(x.ctx.recordatorioSalida() === 0 && x.correos.length === 0, 'antes de la hora configurada no envía nada');
  x.a('2026-10-05T17:05:00');
  ok(x.ctx.recordatorioSalida() === 2 && x.correos.length === 1, 'a la hora configurada envía un correo con los que siguen sin salida');
  const c = x.correos[0];
  ok(/2 sin marcar salida/.test(c.asunto) && /Pedro Pérez Gómez/.test(c.cuerpo) && /lleva 7 h 15 min/.test(c.cuerpo), 'el correo dice quién, dónde y cuánto tiempo lleva');
  ok(/wa\.me\/573001234567\?text=Hola%20Pedro/.test(c.html) && /macros%2Fs%2FABC%2Fexec/.test(c.html), 'trae el botón de WhatsApp de Pedro con el mensaje y el enlace de la app');
  ok(/Sin celular registrado/.test(c.html) && /wa\.me\/\?text=Recordatorio%20ODESA/.test(c.html), 'avisa quién no tiene celular y trae el mensaje para el grupo');
  x.a('2026-10-05T17:20:00');
  ok(x.ctx.recordatorioSalida() === 0 && x.correos.length === 1, 'no repite el correo el mismo día');
  x.a('2026-10-06T17:05:00');
  x.hoja('Configuración').getRange(6, 2).setValue('');
  ok(x.ctx.recordatorioSalida() === 0 && x.ctx.iniciar({}).horaRecordatorio === '', 'con la hora vacía el recordatorio queda apagado');
  x.hoja('Configuración').getRange(6, 2).setValue('15:30');
  ok(x.ctx.iniciar({}).horaRecordatorio === '15:30', 'la hora del recordatorio se puede cambiar en Configuración');
}

console.log('\n10. Actualizar una instalación que ya estaba funcionando');
{
  const x = entorno(); x.a('2026-10-05T08:00:00');
  const L = x.libro;
  const vieja = (n, filas) => { const h = L.insertSheet(n); filas.forEach((f, i) => { h.celdas[i] = f.slice(); }); return h; };
  vieja('Trabajadores', [['Cédula', 'Nombre completo', 'Cargo', 'Tipo', 'Contratista', 'Estado', 'Autorizó uso de datos', 'Registrado el'], ['1045678901', 'PEDRO PÉREZ GÓMEZ', 'Oficial', 'PROPIO', '', 'ACTIVO', new Date(), new Date()]]);
  vieja('Obras', [['Obra', 'Dirección', 'Coordenadas (pegar de Google Maps)', 'Radio permitido (m)', 'Activa'], ['Summus', 'Cra 1', '11.0041, -74.807', 200, 'SI']]);
  vieja('Configuración', [['Ajuste', 'Valor'], ['Correo para el resumen diario', 'jefe@ejemplo.com'], ['Foto obligatoria (SI/NO)', 'SI'], ['GPS obligatorio (SI/NO)', 'NO'], ['Radio por defecto de las obras (m)', 80]]);
  x.ctx.instalar();
  const conf = x.ctx.configuracion_();
  ok(x.hoja('Trabajadores').celdas[0][8] === 'Celular (WhatsApp)' && x.hoja('Obras').celdas[0][6] === 'Registrada el', 'agrega las columnas nuevas sin borrar nada');
  ok(x.filas('Trabajadores')[0][1] === 'PEDRO PÉREZ GÓMEZ' && x.filas('Obras')[0][3] === 200 && x.filas('Obras').length === 1, 'los trabajadores y las obras que ya tenías quedan intactos');
  ok(conf.correo === 'jefe@ejemplo.com' && conf.gpsObligatorio === false && conf.radio === 80 && conf.horaRecordatorio === '17:00' && x.filas('Configuración').length === 8, 'respeta tus ajustes y agrega solo los que faltaban');
  ok(x.ctx.marcar({ cedula: '1045678901', tipo: 'entrada', obra: 'Summus', actividades: ['Otra'], foto: FOTO, ...SUMMUS }).ok, 'después de actualizar se puede seguir marcando');
}

console.log('\n11. La app instalada habla con el motor por internet');
{
  const x = entorno(); x.a('2026-10-05T06:30:00'); x.ctx.instalar();
  x.hoja('Obras').getRange(2, 3).setValue(SUMMUS.lat + ', ' + SUMMUS.lon);
  x.hoja('Configuración').getRange(2, 2).setValue('jefe@ejemplo.com');
  x.hoja('Trabajadores').getRange(2, 1, 4, 9).setValues([
    ['1045678901', 'PEDRO PÉREZ GÓMEZ', '', 'PROPIO', '', 'ACTIVO', new Date(), '', '3001234567'],
    ['72123456', 'LUIS DÍAZ MOLINA', '', 'SUBCONTRATADO', '', 'ACTIVO', new Date(), '', ''],
    ['55555555', 'ANA SOTO RÍOS', '', 'PROPIO', '', 'ACTIVO', new Date(), '', ''],
    ['66666666', 'JOSÉ MEZA', '', 'PROPIO', '', 'INACTIVO', new Date(), '', '']]);
  let r = x.pedir('iniciar', { cedula: '1045678901', dispositivo: 'CEL-P', app: 'https://juan.github.io/asistencia-odesa/' });
  ok(r.ok && r.trabajador.nombre === 'PEDRO PÉREZ GÓMEZ' && r.obras.length === 2, 'la app recibe los mismos datos que antes, ahora por internet');
  r = x.pedir('marcar', { cedula: '1045678901', tipo: 'entrada', obra: 'Summus', actividades: ['Otra'], foto: FOTO, ...SUMMUS, dispositivo: 'CEL-P' });
  ok(r.ok && r.ubicacion === 'EN OBRA' && x.filas('Registros').length === 1, 'una marcación enviada desde la app queda en la hoja Registros');
  ok(x.pedir('instalar', {}).ok === false && x.pedir('actualizarNomina', {}).ok === false && x.pedir('constructor', {}).ok === false, 'desde internet solo se permiten las acciones del trabajador');
  ok(JSON.parse(x.ctx.doPost({ postData: { contents: 'esto no es válido' } }).texto).ok === false, 'una petición dañada no tumba el motor');

  console.log('\n12. Notificaciones al celular');
  const pub = x.props.VAPID_PUB, priv = x.props.VAPID_PRIV;
  const crudo = Buffer.from(pub, 'base64url');
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(Buffer.from(priv, 'hex'));
  ok(crudo.length === 65 && crudo[0] === 4 && ecdh.getPublicKey().equals(crudo), 'al instalar se crea el par de claves de los avisos, y la pública corresponde a la privada');
  const llave = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: crudo.subarray(1, 33).toString('base64url'), y: crudo.subarray(33).toString('base64url') } });
  const valida = pase => { const [a, b, c] = pase.split('.'); return crypto.verify('sha256', Buffer.from(a + '.' + b), { key: llave, dsaEncoding: 'ieee-p1363' }, Buffer.from(c, 'base64url')); };
  let todas = true;
  for (let i = 0; i < 25; i++) todas = todas && valida(x.ctx.pasePush_('https://servicio' + i + '.example', 'mailto:a@b.co'));
  ok(todas, 'la firma de los avisos es válida (25 firmas comprobadas con una herramienta independiente)');
  const falso = x.ctx.pasePush_('https://fcm.googleapis.com', 'mailto:a@b.co').split('.'); falso[1] = Buffer.from('{"aud":"otro"}').toString('base64url');
  ok(!valida(falso.join('.')), 'una firma alterada se detecta como falsa');
  x.ctx.instalar();
  ok(x.props.VAPID_PUB === pub, 'reinstalar no cambia las claves (los celulares ya activados siguen sirviendo)');

  const EP = 'https://fcm.googleapis.com/fcm/send/abc123:XYZ';
  ok(x.pedir('suscribir', { cedula: '1045678901', dispositivo: 'CEL-P', endpoint: 'https://sitio-raro.example/push/1' }).ok === false, 'no acepta direcciones de avisos que no sean de Chrome, Firefox, iPhone o Edge');
  ok(x.pedir('suscribir', { cedula: '1045678901', dispositivo: 'CEL-P', endpoint: EP }).ok && x.filas('Avisos').length === 1, 'al activar los avisos, el celular queda en la hoja Avisos');
  x.pedir('suscribir', { cedula: '1045678901', dispositivo: 'CEL-P', endpoint: EP + '-nuevo' });
  ok(x.filas('Avisos').length === 1 && /-nuevo$/.test(x.filas('Avisos')[0][3]), 'si el celular cambia su dirección de avisos, se actualiza sin duplicar');
  ok(x.pedir('iniciar', { cedula: '1045678901', dispositivo: 'CEL-P' }).avisos === true && x.pedir('iniciar', { cedula: '1045678901', dispositivo: 'OTRO' }).avisos === false, 'la app sabe si ese celular ya tiene avisos activados');

  r = x.pedir('probarAviso', { dispositivo: 'CEL-P' });
  const pet = x.peticiones[0];
  ok(r.ok && r.codigo === 201 && pet.url === EP + '-nuevo' && pet.method === 'post' && pet.headers.TTL === '7200', 'el botón "Probar aviso" envía la notificación a ese celular');
  const m = pet.headers.Authorization.match(/^vapid t=([\w.-]+), k=([\w-]+)$/);
  const datosPase = m ? JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString()) : {};
  ok(m && m[2] === pub && valida(m[1]) && datosPase.aud === 'https://fcm.googleapis.com' && datosPase.sub === 'mailto:jefe@ejemplo.com' && datosPase.exp > Date.parse('2026-10-05T11:30:00Z') / 1000, 'el envío va firmado y dirigido al servicio de avisos correcto');
  const texto = d => JSON.parse(x.ctx.doGet({ parameter: { accion: 'aviso', disp: d } }).texto);
  ok(/prueba/.test(texto('CEL-P').titulo), 'la notificación de prueba dice que es de prueba');
  delete x.cache['PRUEBA_CEL-P'];
  x.a('2026-10-05T09:32:00');
  ok(/SALIDA/.test(texto('CEL-P').titulo) && /Llevas 3 h 2 min/.test(texto('CEL-P').cuerpo), 'con la jornada abierta, la notificación pide marcar la SALIDA y dice cuánto lleva');
  x.pedir('suscribir', { cedula: '72123456', dispositivo: 'CEL-L', endpoint: 'https://web.push.apple.com/QWERTY' });
  x.pedir('suscribir', { cedula: '66666666', dispositivo: 'CEL-J', endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/zzz' });
  ok(/ENTRADA/.test(texto('CEL-L').titulo), 'sin registro hoy, la notificación pide marcar la ENTRADA');
  ok(x.pedir('probarAviso', { dispositivo: 'NO-EXISTE' }).ok === false, 'no se puede probar un celular que no activó avisos');

  console.log('\n13. Avisos automáticos de entrada y de salida');
  const y = entorno(); y.a('2026-10-06T06:40:00'); y.ctx.instalar();
  y.hoja('Configuración').getRange(2, 2).setValue('jefe@ejemplo.com');
  y.hoja('Trabajadores').getRange(2, 1, 4, 9).setValues(x.hoja('Trabajadores').getRange(2, 1, 4, 9).getValues());
  y.pedir('iniciar', { cedula: '1045678901', app: 'https://sitio-falso.example/' });
  y.pedir('iniciar', { cedula: '1045678901', app: 'https://juan.github.io/asistencia-odesa/' });
  y.pedir('iniciar', { cedula: '1045678901', app: 'https://otro.github.io/trampa/' });
  y.pedir('suscribir', { cedula: '1045678901', dispositivo: 'CEL-P', endpoint: EP });
  y.pedir('suscribir', { cedula: '72123456', dispositivo: 'CEL-L', endpoint: 'https://web.push.apple.com/QWERTY' });
  y.pedir('suscribir', { cedula: '66666666', dispositivo: 'CEL-J', endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/zzz' });
  const marca = (c, tipo) => y.pedir('marcar', { cedula: c, tipo, obra: 'Summus', actividades: ['Otra'], foto: FOTO, ...SUMMUS });
  marca('1045678901', 'entrada');                                   // Pedro llegó temprano
  ok(y.ctx.avisosAutomaticos() === 0 && y.peticiones.length === 0, 'antes de la hora de entrada no se envía nada');
  y.a('2026-10-06T07:05:00');
  ok(y.ctx.avisosAutomaticos() === 1 && y.peticiones.length === 1 && /apple/.test(y.peticiones[0].url), 'a las 7:00 avisa solo a quien no ha marcado entrada (no a quien ya marcó ni al inactivo)');
  y.a('2026-10-06T07:20:00');
  ok(y.ctx.avisosAutomaticos() === 0 && y.peticiones.length === 1, 'el aviso de entrada no se repite el mismo día');
  marca('72123456', 'entrada');
  y.a('2026-10-06T16:00:00'); marca('1045678901', 'salida');        // Pedro sale; Luis sigue abierto; Ana nunca marcó
  marca('55555555', 'entrada');
  y.a('2026-10-06T17:05:00');
  ok(y.ctx.avisosAutomaticos() === 2 && y.peticiones.length === 2 && y.correos.length === 1, 'a las 5:00 p. m. avisa al celular de quien sigue sin salida y te envía el correo');
  const c = y.correos[0];
  ok(/Luis Díaz Molina[^•]*Ya se le envió el aviso a su celular/.test(c.cuerpo) && /Ana Soto Ríos[^•]*No tiene los avisos activados/.test(c.cuerpo), 'el correo dice a quién ya le llegó el aviso y quién no los tiene activados');
  ok(/juan\.github\.io%2Fasistencia-odesa/.test(c.html) && !/trampa|sitio-falso/.test(c.html), 'los recordatorios llevan el enlace de la app publicada (el primero que se conectó)');
  y.a('2026-10-06T17:35:00'); y.ctx.avisosAutomaticos();
  ok(y.peticiones.length === 2, 'media hora después todavía no insiste');
  y.red.codigo = () => 410;
  y.a('2026-10-06T18:05:00');
  ok(y.ctx.avisosAutomaticos() === 2 && y.peticiones.length === 3 && y.correos.length === 1, 'una hora después insiste una vez más al celular, sin repetir el correo');
  ok(y.filas('Avisos').find(f => f[2] === 'CEL-L')[6] === 'VENCIDA' && y.pedir('iniciar', { cedula: '72123456', dispositivo: 'CEL-L' }).avisos === false, 'si el celular ya no acepta avisos, queda marcado como VENCIDA y la app lo vuelve a pedir');
  y.red.codigo = () => 201;
  y.pedir('suscribir', { cedula: '72123456', dispositivo: 'CEL-L', endpoint: 'https://web.push.apple.com/NUEVA' });
  ok(y.filas('Avisos').find(f => f[2] === 'CEL-L')[6] === 'ACTIVO', 'al reactivarlos vuelve a quedar ACTIVO');
  y.a('2026-10-11T07:05:00');                                       // domingo
  ok(y.ctx.avisosAutomaticos() === 0 && y.peticiones.length === 3, 'los domingos no se envía el aviso de entrada');
  y.hoja('Configuración').getRange(8, 2).setValue('SI');
  y.a('2026-10-18T07:05:00');
  ok(y.ctx.avisosAutomaticos() === 2, 'salvo que en Configuración se pida avisar los domingos');
  y.hoja('Configuración').getRange(7, 2).setValue('');
  y.a('2026-10-19T07:05:00');
  ok(y.ctx.avisosAutomaticos() === 0, 'con la hora de entrada vacía, ese aviso queda apagado');
  y.red.codigo = () => { throw new Error('sin internet'); };
  y.a('2026-10-19T17:05:00'); marca('1045678901', 'entrada');
  ok(y.ctx.avisosAutomaticos() === 1 && y.correos.length === 2, 'si falla el envío al celular, el correo de respaldo sale igual');
}

async function final() {
  console.log('\n14. Viaje real por internet (app → motor) en este computador');
  const srv = await require('./servidor-local').iniciar({ puertoApp: 8875, puertoMotor: 8876 });
  try {
    const pedir = (accion, datos) => fetch(srv.api, { method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ accion, datos }) }).then(r => r.json());
    let r = await pedir('iniciar', { cedula: '1045678901', dispositivo: 'CEL-X' });
    ok(r.ok && r.trabajador.nombre === 'PEDRO PÉREZ GÓMEZ' && r.clavePush.length === 87, 'la respuesta del motor llega completa después de la redirección (como en Google)');
    r = await pedir('marcar', { cedula: '1045678901', tipo: 'entrada', obra: 'Summus', actividades: ['Otra'], foto: FOTO, lat: 11.0041, lon: -74.807, dispositivo: 'CEL-X' });
    ok(r.ok && srv.entorno.filas('Registros').length === 1, 'una marcación con foto viaja y se guarda');
    const aviso = await fetch(srv.api + '?accion=aviso&disp=NADIE').then(x => x.json());
    ok(/ODESA/.test(aviso.titulo), 'el servicio de avisos puede preguntarle al motor qué texto mostrar');
    const pagina = await fetch(srv.direccion).then(x => x.text());
    const piezas = await Promise.all(['sw.js', 'manifest.webmanifest', 'icono-192.png', 'icono-512.png', 'insignia.png', 'config.js'].map(f => fetch(srv.direccion + f).then(x => x.status)));
    ok(/manifest\.webmanifest/.test(pagina) && piezas.every(c => c === 200), 'la app publica todas sus piezas (pantalla, ícono, instalación y servicio de avisos)');
  } finally { await srv.cerrar(); }

  console.log('\n15. Servicio de avisos del celular (sw.js)');
  {
    const eventos = {}, mostradas = [], abiertas = [];
    let ajustes = { api: 'https://motor.example/exec', disp: 'CEL-P' }, respuesta = { titulo: 'ODESA: marca tu SALIDA', cuerpo: 'Llevas 9 h 3 min.' };
    let pedida = '', enfocada = 0, ventanas = [];
    const mundo = {
      Date, Promise, setTimeout, encodeURIComponent,
      self: {
        addEventListener: (n, f) => { eventos[n] = f; }, skipWaiting() {},
        registration: { showNotification: (titulo, o) => { mostradas.push({ titulo, cuerpo: o.body, icono: o.icon }); return Promise.resolve(); } },
        clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve(ventanas), openWindow: u => { abiertas.push(u); return Promise.resolve(); } }
      },
      caches: { open: () => Promise.resolve({ match: () => Promise.resolve(ajustes ? { json: () => Promise.resolve(ajustes) } : undefined) }) },
      fetch: u => { pedida = u; return respuesta === 'caido' ? Promise.reject(new Error('sin red')) : Promise.resolve({ ok: true, json: () => Promise.resolve(respuesta) }); }
    };
    vm.createContext(mundo);
    vm.runInContext(fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8'), mundo);
    const empujar = () => new Promise(fin => eventos.push({ waitUntil: p => p.then(fin) }));
    await empujar();
    ok(mostradas.length === 1 && mostradas[0].titulo === 'ODESA: marca tu SALIDA' && /9 h 3 min/.test(mostradas[0].cuerpo) && /accion=aviso&disp=CEL-P$/.test(pedida), 'al llegar el aviso muestra la notificación con el texto que da el motor');
    respuesta = 'caido';
    await empujar();
    ok(mostradas.length === 2 && /ODESA: marca tu (ENTRADA|SALIDA)/.test(mostradas[1].titulo), 'si el celular no logra consultar al motor, igual muestra el recordatorio');
    ajustes = null;
    await empujar();
    ok(mostradas.length === 3, 'nunca deja un aviso sin mostrar');
    await new Promise(fin => eventos.notificationclick({ notification: { close() {} }, waitUntil: p => p.then(fin) }));
    ok(abiertas.length === 1 && abiertas[0] === './', 'al tocar la notificación se abre la app');
    ventanas = [{ focus: () => { enfocada++; return Promise.resolve(); } }];
    await new Promise(fin => eventos.notificationclick({ notification: { close() {} }, waitUntil: p => p.then(fin) }));
    ok(enfocada === 1 && abiertas.length === 1, 'si la app ya estaba abierta, la trae al frente en vez de abrir otra');
  }

  console.log('\n16. Archivos de la app');
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  const guion = html.match(/<script>([\s\S]*?)<\/script>/);
  let sintaxis = true;
  try { new vm.Script(guion[1]); } catch (err) { sintaxis = false; console.log('    ' + err.message); }
  ok(sintaxis, 'el código de la pantalla no tiene errores de escritura');
  const e0 = entorno();
  ['iniciar', 'aceptar', 'marcar', 'suscribir', 'probarAviso'].forEach(f => ok(typeof e0.ctx[f] === 'function' && new RegExp("llamar\\('" + f + "'").test(html), 'la pantalla usa la función "' + f + '" y el motor la tiene'));
  const manifiesto = JSON.parse(fs.readFileSync(path.join(raiz, 'manifest.webmanifest'), 'utf8'));
  ok(manifiesto.display === 'standalone' && manifiesto.icons.every(i => fs.existsSync(path.join(raiz, i.src))) && manifiesto.icons.some(i => i.sizes === '512x512'), 'el archivo de instalación está completo y sus íconos existen');
  ok(/PEGA_AQUI/.test(fs.readFileSync(path.join(raiz, 'config.js'), 'utf8')), 'config.js se entrega sin ningún enlace real (lo pones tú)');
  ok(!/VAPID_PRIV\s*=|AKfycb/.test(html + fs.readFileSync(path.join(raiz, 'google', 'Codigo.gs'), 'utf8')), 'ningún archivo trae claves ni enlaces privados escritos');

  console.log('\n' + (fallos ? '✗ ' + fallos + ' de ' + pruebas + ' pruebas fallaron' : '✓ ' + pruebas + ' pruebas pasaron'));
  process.exit(fallos ? 1 : 0);
}
final().catch(err => { console.error(err); process.exit(1); });
