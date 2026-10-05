/**
 * ASISTENCIA ODESA — Registro diario de operarios
 * ------------------------------------------------
 * Este archivo es el "motor": recibe lo que cada trabajador marca desde la app
 * de su celular, lo guarda en esta hoja de Google Sheets y envía los avisos
 * (notificaciones) de entrada y de salida.
 *
 * No hay que modificar nada aquí. Todo lo que se ajusta (trabajadores, obras,
 * actividades, correo de avisos) se cambia directamente en las hojas.
 */

const TZ = 'America/Bogota';

const HOJA = {
  TRAB: 'Trabajadores',
  OBRAS: 'Obras',
  ACT: 'Actividades',
  REG: 'Registros',
  NOV: 'Novedades',
  NOM: 'Nómina',
  CONF: 'Configuración',
  AVISOS: 'Avisos'
};

const ENCABEZADOS = {
  Trabajadores: ['Cédula', 'Nombre completo', 'Cargo', 'Tipo', 'Contratista', 'Estado',
    'Autorizó uso de datos', 'Registrado el', 'Celular (WhatsApp)'],
  Obras: ['Obra', 'Dirección', 'Coordenadas (pegar de Google Maps)', 'Radio permitido (m)', 'Activa',
    'Registrada por', 'Registrada el'],
  Actividades: ['Actividad', 'Activa'],
  Registros: ['ID', 'Fecha', 'Cédula', 'Nombre', 'Obra', 'Actividades',
    'Hora entrada', 'Distancia a la obra al entrar (m)', 'Ubicación entrada', 'Mapa entrada', 'Foto entrada',
    'Hora salida', 'Distancia a la obra al salir (m)', 'Ubicación salida', 'Mapa salida', 'Foto salida',
    'Horas', 'Estado', 'Alertas', 'Nota del trabajador',
    'Horas a pagar', 'Nota del administrador',
    'Lat. entrada', 'Lon. entrada', 'Precisión entrada (m)',
    'Lat. salida', 'Lon. salida', 'Precisión salida (m)', 'Celular'],
  Novedades: ['Fecha', 'Cédula', 'Nombre', 'Novedad', 'Detalle'],
  Avisos: ['Cédula', 'Nombre', 'Celular (identificador)', 'Dirección de avisos', 'Activado el', 'Último aviso', 'Resultado'],
  Nómina: ['Cédula', 'Nombre', 'Tipo', 'Contratista', 'Días a pagar', 'Horas a pagar',
    'Jornadas sin salida (por justificar)', 'Marcaciones fuera de obra', 'Jornadas con otras alertas']
};

// Posición de cada columna de la hoja "Registros" (1 = columna A).
const COL = {
  ID: 1, FECHA: 2, CEDULA: 3, NOMBRE: 4, OBRA: 5, ACTIV: 6,
  H_ENT: 7, DIST_ENT: 8, UBI_ENT: 9, MAPA_ENT: 10, FOTO_ENT: 11,
  H_SAL: 12, DIST_SAL: 13, UBI_SAL: 14, MAPA_SAL: 15, FOTO_SAL: 16,
  HORAS: 17, ESTADO: 18, ALERTAS: 19, NOTA: 20,
  HORAS_PAGAR: 21, NOTA_ADMIN: 22,
  LAT_ENT: 23, LON_ENT: 24, PREC_ENT: 25,
  LAT_SAL: 26, LON_SAL: 27, PREC_SAL: 28, DISP: 29
};
const ANCHO_REG = 29;
const ANCHO_TRAB = 9;
const ANCHO_OBRAS = 7;
const ANCHO_AVISOS = 7;
const FILA_NOMINA = 6; // primera fila de datos del resumen de nómina

const ACTIVIDADES_INICIALES = [
  'Excavación y movimiento de tierra', 'Demolición y desmonte', 'Armado de acero', 'Formaleta',
  'Fundida de concreto', 'Mampostería y pañete', 'Impermeabilización', 'Instalación hidráulica',
  'Instalación eléctrica', 'Cuarto de máquinas y equipos', 'Enchape y acabados',
  'Instalación de membrana', 'Mantenimiento de piscina', 'Cargue y transporte de materiales',
  'Limpieza y aseo de obra', 'Otra'
];

/* ============================================================
 * 1. LO QUE VE EL TRABAJADOR
 * ============================================================ */

/**
 * Puerta de entrada de la app instalada: cada vez que un trabajador hace algo en su celular,
 * la app envía aquí la petición y recibe la respuesta.
 */
function doPost(e) {
  let res;
  try {
    const cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const acciones = { iniciar: iniciar, aceptar: aceptar, marcar: marcar, suscribir: suscribir, probarAviso: probarAviso };
    const nombre = String(cuerpo.accion || '');
    res = Object.prototype.hasOwnProperty.call(acciones, nombre)
      ? acciones[nombre](cuerpo.datos || {})
      : { ok: false, mensaje: 'Acción desconocida.' };
  } catch (err) {
    res = { ok: false, mensaje: 'No se pudo procesar: ' + (err && err.message ? err.message : err) };
  }
  return json_(res);
}

/** Con "?accion=aviso" responde el texto de la notificación; sin eso, entrega la pantalla antigua (enlace de Google). */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.accion === 'aviso') return json_(textoAviso_(String(p.disp || '')));
  try {   // se anota el enlace de Google por si todavía no hay app publicada
    const url = ScriptApp.getService().getUrl();
    const props = PropertiesService.getScriptProperties();
    if (url && /\/exec$/.test(url) && props.getProperty('URL_APP') !== url) props.setProperty('URL_APP', url);
  } catch (err) {}
  try {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Asistencia ODESA')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) {
    const url = enlaceApp_();
    return HtmlService.createHtmlOutput('<p style="font:18px sans-serif;padding:24px">El registro de asistencia de ODESA ' +
      (/github\.io/.test(url) ? 'se abre aquí: <a href="' + url + '">' + url + '</a>' : 'funciona. Falta publicar la app.') + '</p>');
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Datos para pintar la pantalla: quién es, qué obras hay y cómo va su día. */
function iniciar(d) {
  d = d || {};
  const conf = configuracion_();
  const ahora = ahora_();
  const hoy = fechaTxt_(ahora);
  const res = {
    ok: true,
    hoy: hoy,
    ahoraMs: ahora.getTime(),               // hora de Google, para que el contador no dependa del reloj del celular
    horaRecordatorio: conf.horaRecordatorio,
    fotoObligatoria: conf.fotoObligatoria,
    gpsObligatorio: conf.gpsObligatorio,
    obras: obras_(conf).map(function (o) {
      return { nombre: o.nombre, lat: o.lat, lon: o.lon, radio: o.radio, porValidar: o.porValidar };
    }),
    actividades: actividades_(),
    trabajador: null,
    abierta: null,
    cerradas: [],
    clavePush: PropertiesService.getScriptProperties().getProperty('VAPID_PUB') || '',
    avisos: false
  };
  anotarEnlace_(d.app);

  const cedula = cedula_(d.cedula);
  if (!cedula) return res;
  res.avisos = !!filaAviso_(String(d.dispositivo || ''), true);

  const t = buscarTrabajador_(cedula);
  if (!t) { res.cedulaNueva = true; return res; }
  res.trabajador = {
    cedula: t.cedula, nombre: t.nombre,
    autorizo: !!t.autorizo, inactivo: t.estado === 'INACTIVO', tieneCelular: !!t.celular
  };

  const bloque = ultimas_(ss_().getSheetByName(HOJA.REG), 400);
  bloque.valores.forEach(function (f) {
    if (cedula_(f[COL.CEDULA - 1]) !== cedula) return;
    if (fechaTxt_(f[COL.FECHA - 1]) !== hoy) return;
    const estado = String(f[COL.ESTADO - 1]);
    if (estado === 'ABIERTA') {
      res.abierta = {
        obra: String(f[COL.OBRA - 1]),
        entrada: horaTxt_(f[COL.H_ENT - 1]),
        entradaMs: esFecha_(f[COL.H_ENT - 1]) ? f[COL.H_ENT - 1].getTime() : 0,
        actividades: String(f[COL.ACTIV - 1]).split(' / ').filter(String)
      };
    } else if (estado === 'COMPLETA') {
      res.cerradas.push({
        obra: String(f[COL.OBRA - 1]),
        entrada: horaTxt_(f[COL.H_ENT - 1]),
        salida: horaTxt_(f[COL.H_SAL - 1]),
        horas: Number(f[COL.HORAS - 1]) || 0
      });
    }
  });
  return res;
}

/** El trabajador acepta el uso de sus datos (y se registra, si es nuevo). */
function aceptar(d) {
  d = d || {};
  const cedula = cedula_(d.cedula);
  if (cedula.length < 5) return { ok: false, mensaje: 'Revisa el número de cédula.' };
  const celular = cedula_(d.celular);
  if (celular && !/^3\d{9}$/.test(celular)) {
    return { ok: false, mensaje: 'Revisa el celular: son 10 números y empieza por 3.' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = ss_().getSheetByName(HOJA.TRAB);
    const t = buscarTrabajador_(cedula);
    const ahora = ahora_();
    if (t) {
      if (!t.autorizo) sh.getRange(t.fila, 7).setValue(ahora);
      if (celular && !t.celular) sh.getRange(t.fila, 9).setValue(celular);
      return { ok: true, nombre: t.nombre };
    }
    const nombre = String(d.nombre || '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (nombre.length < 5 || nombre.indexOf(' ') < 0) {
      return { ok: false, mensaje: 'Escribe tu nombre y apellido completos.' };
    }
    const fila = filaNueva_(sh);
    sh.getRange(fila, 1, 1, ANCHO_TRAB).setValues([[cedula, nombre, '', '', '', 'POR VALIDAR', ahora, ahora, celular]]);
    return { ok: true, nombre: nombre };
  } finally {
    lock.releaseLock();
  }
}

/** El celular aceptó recibir notificaciones: se guarda a dónde enviárselas. */
function suscribir(d) {
  d = d || {};
  const t = buscarTrabajador_(cedula_(d.cedula));
  const disp = String(d.dispositivo || '').slice(0, 60);
  const endpoint = String(d.endpoint || '');
  if (!t || !disp) return { ok: false, mensaje: 'Faltan datos para activar los avisos.' };
  if (!SERVICIOS_PUSH.test(endpoint) || endpoint.length > 1000) {
    return { ok: false, mensaje: 'Este navegador no permite activar los avisos.' };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = ss_().getSheetByName(HOJA.AVISOS);
    const ya = filaAviso_(disp, false);
    const fila = ya ? ya.fila : filaNueva_(sh);
    sh.getRange(fila, 1, 1, ANCHO_AVISOS).setValues([[t.cedula, t.nombre, disp, endpoint, ahora_(), '', 'ACTIVO']]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Botón "Probar aviso" de la app: envía una notificación de prueba a ese celular. */
function probarAviso(d) {
  const disp = String((d || {}).dispositivo || '');
  if (!filaAviso_(disp, true)) return { ok: false, mensaje: 'Este celular todavía no tiene los avisos activados.' };
  CacheService.getScriptCache().put('PRUEBA_' + disp, '1', 180);
  const r = avisar_({}, disp);
  const codigo = r.codigos[0] || 0;
  return codigo >= 200 && codigo < 300
    ? { ok: true, codigo: codigo }
    : { ok: false, codigo: codigo, mensaje: 'No se pudo enviar el aviso (respuesta ' + codigo + '). Avísale a tu encargado.' };
}

/** Guarda una marcación de entrada o de salida. */
function marcar(d) {
  d = d || {};
  const tipo = d.tipo === 'salida' ? 'salida' : 'entrada';
  const cedula = cedula_(d.cedula);
  const conf = configuracion_();

  const t = buscarTrabajador_(cedula);
  if (!t) return { ok: false, mensaje: 'No encontramos tu cédula. Vuelve a empezar.' };
  if (t.estado === 'INACTIVO') {
    return { ok: false, mensaje: 'Tu registro está inactivo. Habla con tu encargado.' };
  }

  const lat = numero_(d.lat), lon = numero_(d.lon), precision = numero_(d.precision);
  const hayGps = lat !== '' && lon !== '';
  if (!hayGps && conf.gpsObligatorio) {
    return { ok: false, mensaje: 'Falta la ubicación. Activa el GPS del celular e intenta de nuevo.' };
  }
  const foto = String(d.foto || '');
  if (!foto && conf.fotoObligatoria) {
    return { ok: false, mensaje: 'Falta la foto.' };
  }
  const actividades = (d.actividades || []).map(String).filter(String).join(' / ');
  if (!actividades) return { ok: false, mensaje: 'Elige al menos una actividad.' };

  const ahora = ahora_();
  const hoy = fechaTxt_(ahora);
  const alertas = [];

  // Revisión rápida antes de guardar la foto (se repite más abajo, ya con la hoja bloqueada).
  const previa = jornadaAbierta_(ss_().getSheetByName(HOJA.REG), cedula, hoy);
  if (tipo === 'entrada' && previa.fila) {
    return { ok: false, mensaje: 'Ya tienes una entrada marcada hoy. Primero marca la salida.' };
  }
  // Obra que el trabajador escribió porque no estaba en la lista.
  let obraNueva = '';
  if (tipo === 'entrada' && d.obraNueva && String(d.obraNueva.nombre || '').trim()) {
    obraNueva = tituloObra_(d.obraNueva.nombre);
    if (obraNueva.length < 4) return { ok: false, mensaje: 'Escribe el nombre completo de la obra.' };
    const ya = obraPorNombre_(obraNueva, conf);
    if (ya && ya.inactiva) return { ok: false, mensaje: 'Esa obra está cerrada. Habla con tu encargado.' };
  }
  if (tipo === 'entrada' && !obraNueva && !buscarObra_(String(d.obra || ''), conf)) {
    return { ok: false, mensaje: 'Elige la obra.' };
  }
  if (tipo === 'salida' && !previa.fila) {
    return { ok: false, mensaje: 'No tienes una entrada abierta hoy. Marca primero la entrada.' };
  }

  // La foto se guarda antes de bloquear la hoja, para que varios puedan marcar a la vez.
  let enlaceFoto = '';
  if (foto) {
    try {
      enlaceFoto = guardarFoto_(foto, ahora, tipo, t);
    } catch (e) {
      alertas.push('No se pudo guardar la foto');
    }
  } else {
    alertas.push('Sin foto');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = ss_().getSheetByName(HOJA.REG);
    // Jornada abierta de hoy (si la hay); las de días anteriores que quedaron abiertas se cierran.
    const j = jornadaAbierta_(sh, cedula, hoy);
    const bloque = j.bloque, filaAbierta = j.fila, datosAbierta = j.datos;
    j.viejas.forEach(function (n) { sh.getRange(n, COL.ESTADO).setValue('SIN SALIDA'); });

    if (tipo === 'entrada') {
      if (filaAbierta) {
        return { ok: false, mensaje: 'Ya tienes una entrada marcada hoy. Primero marca la salida.' };
      }
      let obra = buscarObra_(obraNueva || String(d.obra || ''), conf);
      if (!obra && obraNueva) {
        obra = crearObra_(obraNueva, String(d.obraNueva.direccion || ''), lat, lon, conf, t, ahora);
      }
      if (!obra) return { ok: false, mensaje: 'Elige la obra.' };
      const ubi = ubicacion_(obra, lat, lon, precision, alertas, 'entrada');
      if (obra.porValidar) alertas.push('Obra nueva por validar');

      const disp = String(d.dispositivo || '');
      if (disp) {
        const otros = {};
        bloque.valores.forEach(function (f) {
          if (String(f[COL.DISP - 1]) !== disp) return;
          if (fechaTxt_(f[COL.FECHA - 1]) !== hoy) return;
          if (cedula_(f[COL.CEDULA - 1]) === cedula) return;
          otros[String(f[COL.NOMBRE - 1])] = true;
        });
        const nombres = Object.keys(otros);
        if (nombres.length) alertas.push('Marcó desde el mismo celular que ' + nombres.join(', '));
      }
      if (t.estado === 'POR VALIDAR') alertas.push('Trabajador por validar');

      const fila = new Array(ANCHO_REG).fill('');
      fila[COL.ID - 1] = 'R' + ahora.getTime().toString(36).toUpperCase() +
        Math.floor(Math.random() * 1296).toString(36).toUpperCase();
      fila[COL.FECHA - 1] = hoy;
      fila[COL.CEDULA - 1] = cedula;
      fila[COL.NOMBRE - 1] = t.nombre;
      fila[COL.OBRA - 1] = obra.nombre;
      fila[COL.ACTIV - 1] = actividades;
      fila[COL.H_ENT - 1] = ahora;
      fila[COL.DIST_ENT - 1] = ubi.distancia;
      fila[COL.UBI_ENT - 1] = ubi.texto;
      fila[COL.MAPA_ENT - 1] = hayGps ? mapa_(lat, lon) : '';
      fila[COL.FOTO_ENT - 1] = enlaceFoto;
      fila[COL.ESTADO - 1] = 'ABIERTA';
      fila[COL.ALERTAS - 1] = alertas.join(' · ');
      fila[COL.LAT_ENT - 1] = lat;
      fila[COL.LON_ENT - 1] = lon;
      fila[COL.PREC_ENT - 1] = precision;
      fila[COL.DISP - 1] = disp;

      const n = filaNueva_(sh);
      sh.getRange(n, 1, 1, ANCHO_REG).setValues([fila]);
      return {
        ok: true, tipo: 'entrada', hora: horaTxt_(ahora), obra: obra.nombre,
        ubicacion: ubi.texto, distancia: ubi.distancia
      };
    }

    // ----- Salida -----
    if (!filaAbierta) {
      return { ok: false, mensaje: 'No tienes una entrada abierta hoy. Marca primero la entrada.' };
    }
    const obraSal = buscarObra_(String(datosAbierta[COL.OBRA - 1]), conf, true);
    const ubiSal = ubicacion_(obraSal, lat, lon, precision, alertas, 'salida');
    const entrada = datosAbierta[COL.H_ENT - 1];
    let horas = '';
    if (esFecha_(entrada)) {
      horas = Math.round(((ahora.getTime() - entrada.getTime()) / 3600000) * 100) / 100;
    }
    const previas = String(datosAbierta[COL.ALERTAS - 1] || '');
    const todas = (previas ? [previas] : []).concat(alertas).join(' · ');

    sh.getRange(filaAbierta, COL.ACTIV).setValue(actividades);
    sh.getRange(filaAbierta, COL.H_SAL, 1, 5).setValues([[
      ahora, ubiSal.distancia, ubiSal.texto, hayGps ? mapa_(lat, lon) : '', enlaceFoto
    ]]);
    sh.getRange(filaAbierta, COL.HORAS, 1, 5).setValues([[
      horas, 'COMPLETA', todas, String(d.nota || '').slice(0, 500), horas
    ]]);
    sh.getRange(filaAbierta, COL.LAT_SAL, 1, 3).setValues([[lat, lon, precision]]);

    return {
      ok: true, tipo: 'salida', hora: horaTxt_(ahora), obra: String(datosAbierta[COL.OBRA - 1]),
      ubicacion: ubiSal.texto, distancia: ubiSal.distancia, horas: horas
    };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
 * 2. LO QUE USA EL ADMINISTRADOR (menú "ODESA Asistencia")
 * ============================================================ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('ODESA Asistencia')
    .addItem('Actualizar resumen de nómina', 'actualizarNomina')
    .addItem('Revisar novedades de hoy', 'revisarHoy')
    .addSeparator()
    .addItem('Instalar / reparar hojas', 'instalar')
    .addToUi();
}

/** Crea las hojas, la carpeta de fotos y la revisión automática de cada noche. Se puede repetir sin dañar nada. */
function instalar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  ss.setSpreadsheetLocale('es_CO');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('LIBRO_ID', ss.getId());

  const lista = function (valores) {
    return SpreadsheetApp.newDataValidation().requireValueInList(valores, true).build();
  };
  const columna = function (sh, col) { return sh.getRange(2, col, sh.getMaxRows() - 1, 1); };

  // --- Trabajadores ---
  let r = hoja_(ss, HOJA.TRAB);
  columna(r.sh, 1).setNumberFormat('@');
  columna(r.sh, 9).setNumberFormat('@');
  columna(r.sh, 4).setDataValidation(lista(['PROPIO', 'SUBCONTRATADO']));
  columna(r.sh, 6).setDataValidation(lista(['ACTIVO', 'POR VALIDAR', 'INACTIVO']));
  columna(r.sh, 7).setNumberFormat('dd/mm/yyyy hh:mm');
  columna(r.sh, 8).setNumberFormat('dd/mm/yyyy hh:mm');

  // --- Obras ---
  r = hoja_(ss, HOJA.OBRAS);
  columna(r.sh, 3).setNumberFormat('@');
  columna(r.sh, 5).setDataValidation(lista(['SI', 'NO', 'POR VALIDAR']));
  columna(r.sh, 7).setNumberFormat('dd/mm/yyyy hh:mm');
  if (r.nueva) {
    r.sh.getRange(2, 1, 2, 5).setValues([
      ['Summus', '', '', 150, 'SI'],
      ['Lago Mar Villa Campestre', '', '', 150, 'SI']
    ]);
  }

  // --- Actividades ---
  r = hoja_(ss, HOJA.ACT);
  columna(r.sh, 2).setDataValidation(lista(['SI', 'NO']));
  if (r.nueva) {
    r.sh.getRange(2, 1, ACTIVIDADES_INICIALES.length, 2)
      .setValues(ACTIVIDADES_INICIALES.map(function (a) { return [a, 'SI']; }));
  }

  // --- Registros ---
  r = hoja_(ss, HOJA.REG);
  columna(r.sh, COL.FECHA).setNumberFormat('dd/mm/yyyy');
  columna(r.sh, COL.CEDULA).setNumberFormat('@');
  columna(r.sh, COL.H_ENT).setNumberFormat('hh:mm');
  columna(r.sh, COL.H_SAL).setNumberFormat('hh:mm');
  columna(r.sh, COL.HORAS).setNumberFormat('0.00');
  columna(r.sh, COL.HORAS_PAGAR).setNumberFormat('0.00');
  columna(r.sh, COL.DISP).setNumberFormat('@');
  r.sh.getRange(1, COL.HORAS_PAGAR, 1, 2).setBackground('#B45309');

  // --- Novedades ---
  r = hoja_(ss, HOJA.NOV);
  columna(r.sh, 1).setNumberFormat('dd/mm/yyyy');
  columna(r.sh, 2).setNumberFormat('@');

  // --- Avisos (celulares que aceptaron notificaciones; la llena la app) ---
  r = hoja_(ss, HOJA.AVISOS);
  columna(r.sh, 1).setNumberFormat('@');
  columna(r.sh, 3).setNumberFormat('@');
  columna(r.sh, 5).setNumberFormat('dd/mm/yyyy hh:mm');
  columna(r.sh, 6).setNumberFormat('dd/mm/yyyy hh:mm');
  if (!props.getProperty('VAPID_PUB')) crearClavesPush_(props);

  // --- Nómina ---
  let sh = ss.getSheetByName(HOJA.NOM);
  if (!sh) {
    sh = ss.insertSheet(HOJA.NOM);
    const q = quincena_();
    sh.getRange(1, 1, 3, 2).setValues([
      ['RESUMEN PARA NÓMINA', ''], ['Desde', q[0]], ['Hasta', q[1]]
    ]);
    sh.getRange(4, 1).setValue(
      'Cambia las fechas y usa el menú "ODESA Asistencia > Actualizar resumen de nómina".');
    sh.getRange(1, 1).setFontWeight('bold').setFontSize(14);
    sh.getRange(2, 2, 2, 1).setNumberFormat('dd/mm/yyyy').setBackground('#FEF3C7');
    encabezado_(sh, FILA_NOMINA - 1, ENCABEZADOS[HOJA.NOM]);
    sh.getRange(FILA_NOMINA, 1, sh.getMaxRows() - FILA_NOMINA + 1, 1).setNumberFormat('@');
    sh.getRange(FILA_NOMINA, 6, sh.getMaxRows() - FILA_NOMINA + 1, 1).setNumberFormat('0.00');
  }

  // --- Configuración ---
  sh = ss.getSheetByName(HOJA.CONF);
  if (!sh) {
    sh = ss.insertSheet(HOJA.CONF);
    sh.setColumnWidth(1, 380);
    sh.setColumnWidth(2, 260);
  }
  encabezado_(sh, 1, ['Ajuste', 'Valor']);
  columna(sh, 2).setNumberFormat('@');   // como texto, para que "17:00" no se convierta en otra cosa
  const yaEstan = sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .map(function (f) { return String(f[0]).toLowerCase(); });
  [
    ['Correo para los avisos (resumen de la noche y recordatorio de salida)', ''],
    ['Foto obligatoria (SI/NO)', 'SI'],
    ['GPS obligatorio (SI/NO)', 'SI'],
    ['Radio por defecto de las obras (m)', '150'],
    ['Hora del recordatorio de salida (formato 24 h; vacío = sin recordatorio)', '17:00'],
    ['Aviso de entrada: hora (formato 24 h; vacío = sin aviso)', '07:00'],
    ['Domingos: enviar aviso de entrada (SI/NO)', 'NO'],
    ['Enlace de la app para los trabajadores (se llena solo)', '']
  ].forEach(function (a) {
    const clave = a[0].toLowerCase().split(' ')[0];
    if (yaEstan.some(function (k) { return k.indexOf(clave) === 0; })) return;   // no se toca lo que ya ajustaste
    sh.getRange(filaNueva_(sh), 1, 1, 2).setValues([a]);
  });

  // Hoja vacía que Google crea por defecto.
  ss.getSheets().forEach(function (h) {
    if (/^(hoja ?1|sheet ?1)$/i.test(h.getName()) && h.getLastRow() === 0) ss.deleteSheet(h);
  });

  // Carpeta de fotos.
  if (!props.getProperty('CARPETA_FOTOS')) {
    props.setProperty('CARPETA_FOTOS', DriveApp.createFolder('Fotos Asistencia ODESA').getId());
  }

  // Tareas automáticas: revisión de cada noche y recordatorio de salida.
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    const f = tr.getHandlerFunction();
    if (f === 'revisionAutomatica' || f === 'recordatorioSalida' || f === 'avisosAutomaticos') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('revisionAutomatica').timeBased().everyDays(1).atHour(23).inTimezone(TZ).create();
  ScriptApp.newTrigger('avisosAutomaticos').timeBased().everyMinutes(15).create();

  ss.toast('Listo. Ya puedes llenar las hojas Trabajadores y Obras.', 'ODESA Asistencia', 8);
}

/** Resumen por trabajador entre las dos fechas de la hoja "Nómina". */
function actualizarNomina() {
  const ss = ss_();
  const sh = ss.getSheetByName(HOJA.NOM);
  let desde = fechaTxt_(sh.getRange(2, 2).getValue());
  let hasta = fechaTxt_(sh.getRange(3, 2).getValue());
  if (!desde || !hasta) {
    const q = quincena_();
    desde = q[0]; hasta = q[1];
    sh.getRange(2, 2, 2, 1).setValues([[desde], [hasta]]);
  }

  const personas = {};
  filas_(HOJA.TRAB, 8).forEach(function (f) {
    const c = cedula_(f[0]);
    if (c) personas[c] = { nombre: String(f[1]), tipo: String(f[3]), contratista: String(f[4]) };
  });

  const suma = {};
  filas_(HOJA.REG, ANCHO_REG).forEach(function (f) {
    const fecha = fechaTxt_(f[COL.FECHA - 1]);
    if (!fecha || fecha < desde || fecha > hasta) return;
    const c = cedula_(f[COL.CEDULA - 1]);
    if (!c) return;
    const s = suma[c] || (suma[c] = {
      nombre: String(f[COL.NOMBRE - 1]), dias: {}, horas: 0, sinSalida: 0, fuera: 0, alertas: 0
    });
    const pagar = Number(f[COL.HORAS_PAGAR - 1]) || 0;
    const estado = String(f[COL.ESTADO - 1]);
    if (pagar > 0) { s.dias[fecha] = true; s.horas += pagar; }
    if (estado !== 'COMPLETA' && pagar <= 0) s.sinSalida++;
    let fuera = 0;
    if (String(f[COL.UBI_ENT - 1]) === 'FUERA DE OBRA') fuera++;
    if (String(f[COL.UBI_SAL - 1]) === 'FUERA DE OBRA') fuera++;
    s.fuera += fuera;
    if (!fuera && String(f[COL.ALERTAS - 1])) s.alertas++;
  });

  const salida = Object.keys(suma).map(function (c) {
    const s = suma[c], p = personas[c] || {};
    return [c, p.nombre || s.nombre, p.tipo || '', p.contratista || '',
      Object.keys(s.dias).length, Math.round(s.horas * 100) / 100, s.sinSalida, s.fuera, s.alertas];
  }).sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])); });

  const viejas = sh.getLastRow() - FILA_NOMINA + 1;
  if (viejas > 0) sh.getRange(FILA_NOMINA, 1, viejas, 9).clearContent();
  if (salida.length) {
    if (FILA_NOMINA + salida.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), salida.length);
    sh.getRange(FILA_NOMINA, 1, salida.length, 9).setValues(salida);
  }
  try { ss.toast(salida.length + ' trabajadores en el resumen.', 'Nómina actualizada', 5); } catch (e) {}
  return salida.length;
}

/** Botón del menú: arma las novedades de hoy sin cerrar las jornadas que siguen abiertas. */
function revisarHoy() {
  const n = revisarFecha_(hoy_(), false);
  try { ss_().toast(n + ' novedades hoy. Míralas en la hoja "Novedades".', 'ODESA Asistencia', 6); } catch (e) {}
  return n;
}

/** Se ejecuta sola cada noche: cierra lo que quedó abierto, arma las novedades y envía el correo. */
function revisionAutomatica() {
  const hoy = hoy_();
  const n = revisarFecha_(hoy, true);
  const correo = configuracion_().correo;
  if (!correo) return n;
  try {
    const lineas = filas_(HOJA.NOV, 5)
      .filter(function (f) { return fechaTxt_(f[0]) === hoy; })
      .map(function (f) { return '• ' + f[2] + ' — ' + f[3] + (f[4] ? ' (' + f[4] + ')' : ''); });
    const dia = hoy.split('-').reverse().join('/');
    MailApp.sendEmail(correo, 'Asistencia ODESA ' + dia + ' — ' + n + ' novedades',
      n ? 'Novedades del día:\n\n' + lineas.join('\n') : 'Hoy no hubo novedades.');
  } catch (e) {}
  return n;
}

/** Se ejecuta sola cada 15 minutos: decide si ya es hora de avisar la entrada o la salida. */
function avisosAutomaticos() {
  let n = 0;
  try { n += recordatorioEntrada(); } catch (e) {}
  try { n += recordatorioSalida(); } catch (e) {}
  return n;
}

/** A la hora configurada, notifica al celular de quienes todavía no han marcado entrada hoy. */
function recordatorioEntrada() {
  const conf = configuracion_();
  if (!conf.horaEntrada) return 0;
  const ahora = ahora_(), hoy = fechaTxt_(ahora);
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('AVISO_ENTRADA') === hoy) return 0;
  const pasados = minutos_(horaTxt_(ahora)) - minutos_(conf.horaEntrada);
  if (pasados < 0 || pasados > 120) return 0;
  props.setProperty('AVISO_ENTRADA', hoy);
  const p = hoy.split('-');
  const esDomingo = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))).getUTCDay() === 0;
  if (esDomingo && !conf.avisarDomingo) return 0;

  const marcaron = {};
  ultimas_(ss_().getSheetByName(HOJA.REG), 400).valores.forEach(function (f) {
    if (fechaTxt_(f[COL.FECHA - 1]) === hoy) marcaron[cedula_(f[COL.CEDULA - 1])] = true;
  });
  const pendientes = {};
  filas_(HOJA.TRAB, ANCHO_TRAB).forEach(function (f) {
    const c = cedula_(f[0]);
    if (c && String(f[5]).trim().toUpperCase() !== 'INACTIVO' && !marcaron[c]) pendientes[c] = true;
  });
  return Object.keys(avisar_(pendientes).avisados).length;
}

/**
 * A la hora configurada notifica al celular de quienes siguen sin marcar salida (y lo repite una hora después),
 * y envía UN correo al encargado con la lista y un enlace de WhatsApp por persona.
 */
function recordatorioSalida() {
  const conf = configuracion_();
  if (!conf.horaRecordatorio) return 0;
  const ahora = ahora_(), hoy = fechaTxt_(ahora);
  const props = PropertiesService.getScriptProperties();
  const pasados = minutos_(horaTxt_(ahora)) - minutos_(conf.horaRecordatorio);
  if (pasados < 0 || pasados > 180) return 0;
  const primera = props.getProperty('RECORDATORIO_ENVIADO') !== hoy;
  const segunda = !primera && pasados >= 60 && props.getProperty('RECORDATORIO_2') !== hoy;
  if (!primera && !segunda) return 0;
  props.setProperty(primera ? 'RECORDATORIO_ENVIADO' : 'RECORDATORIO_2', hoy);

  const celulares = {};
  filas_(HOJA.TRAB, ANCHO_TRAB).forEach(function (f) { celulares[cedula_(f[0])] = whatsapp_(f[8]); });
  const abiertas = [], cedulas = {};
  ultimas_(ss_().getSheetByName(HOJA.REG), 400).valores.forEach(function (f) {
    if (String(f[COL.ESTADO - 1]) !== 'ABIERTA' || fechaTxt_(f[COL.FECHA - 1]) !== hoy) return;
    const entrada = f[COL.H_ENT - 1], c = cedula_(f[COL.CEDULA - 1]);
    const min = esFecha_(entrada) ? Math.max(0, Math.round((ahora.getTime() - entrada.getTime()) / 60000)) : 0;
    cedulas[c] = true;
    abiertas.push({
      cedula: c, nombre: nombrePropio_(f[COL.NOMBRE - 1]), obra: String(f[COL.OBRA - 1]), entrada: horaTxt_(entrada),
      lleva: Math.floor(min / 60) + ' h ' + (min % 60) + ' min', celular: celulares[c] || ''
    });
  });
  if (!abiertas.length) return 0;

  const avisados = avisar_(cedulas).avisados;
  if (!primera || !conf.correo) return abiertas.length;

  const url = enlaceApp_();
  const cierre = ' Sin la salida no se cuentan las horas de hoy.' + (url ? ' Entra aquí: ' + url : '');
  const html = function (t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  };
  const paraGrupo = 'Recordatorio ODESA: todavía no han marcado SALIDA: ' +
    abiertas.map(function (a) { return a.nombre; }).join(', ') + '.' + cierre;
  const lineasTxt = [], lineasHtml = [];
  abiertas.forEach(function (a) {
    const detalle = a.nombre + ' — ' + a.obra + ', entró a las ' + a.entrada + ' (lleva ' + a.lleva + ')';
    const push = avisados[a.cedula] ? 'Ya se le envió el aviso a su celular.' : 'No tiene los avisos activados en su celular.';
    const enlace = a.celular ? 'https://wa.me/' + a.celular + '?text=' + encodeURIComponent(
      'Hola ' + a.nombre.split(' ')[0] + ', recuerda marcar tu SALIDA en el registro de ODESA.' + cierre) : '';
    lineasTxt.push('• ' + detalle + '\n  ' + push + (enlace ? '\n  Recordarle por WhatsApp: ' + enlace : '\n  (sin celular registrado)'));
    lineasHtml.push('<li style="margin-bottom:10px">' + html(detalle) + '<br><span style="color:#666">' + html(push) + '</span><br>' + (enlace
      ? '<a href="' + html(enlace) + '">Recordarle por WhatsApp</a>' : '<span style="color:#888">Sin celular registrado</span>') + '</li>');
  });
  const grupo = 'https://wa.me/?text=' + encodeURIComponent(paraGrupo);
  try {
    MailApp.sendEmail({
      to: conf.correo,
      subject: 'Asistencia ODESA — ' + abiertas.length + ' sin marcar salida',
      body: 'Siguen sin marcar salida:\n\n' + lineasTxt.join('\n') + '\n\nEnviar al grupo de WhatsApp: ' + grupo,
      htmlBody: '<p>Siguen sin marcar salida:</p><ul>' + lineasHtml.join('') + '</ul>' +
        '<p><a href="' + html(grupo) + '"><b>Enviar un solo recordatorio al grupo de WhatsApp</b></a></p>'
    });
  } catch (e) {}
  return abiertas.length;
}

/* ============================================================
 * 3. PIEZAS INTERNAS
 * ============================================================ */

function revisarFecha_(fecha, cerrar) {
  const ss = ss_();
  const sh = ss.getSheetByName(HOJA.REG);
  const novedades = [];
  const marcaron = {};
  let registrosDelDia = 0;

  filas_(HOJA.REG, ANCHO_REG).forEach(function (f, i) {
    const fFila = fechaTxt_(f[COL.FECHA - 1]);
    if (!fFila || fFila > fecha) return;
    let estado = String(f[COL.ESTADO - 1]);
    if (estado === 'ABIERTA' && (cerrar || fFila < fecha)) {
      sh.getRange(i + 2, COL.ESTADO).setValue('SIN SALIDA');
      estado = 'SIN SALIDA';
    }
    if (fFila !== fecha) return;
    registrosDelDia++;
    const c = cedula_(f[COL.CEDULA - 1]), nombre = String(f[COL.NOMBRE - 1]);
    marcaron[c] = true;
    if (estado === 'SIN SALIDA') {
      novedades.push([fecha, c, nombre, 'SIN SALIDA', 'Entró a las ' + horaTxt_(f[COL.H_ENT - 1]) + ' en ' + f[COL.OBRA - 1]]);
    } else if (estado === 'ABIERTA') {
      novedades.push([fecha, c, nombre, 'AÚN SIN SALIDA', 'Entró a las ' + horaTxt_(f[COL.H_ENT - 1]) + ' en ' + f[COL.OBRA - 1]]);
    }
    const alertas = String(f[COL.ALERTAS - 1] || '');
    if (alertas) novedades.push([fecha, c, nombre, 'ALERTA', alertas]);
  });

  // Solo se listan ausentes si ese día alguien marcó (así no salen domingos ni festivos).
  if (registrosDelDia > 0) {
    filas_(HOJA.TRAB, 8).forEach(function (f) {
      const c = cedula_(f[0]);
      const estado = String(f[5]).trim().toUpperCase() || 'ACTIVO';
      if (c && estado === 'ACTIVO' && !marcaron[c]) {
        novedades.push([fecha, c, String(f[1]), 'NO MARCÓ', '']);
      }
    });
  }

  filas_(HOJA.OBRAS, ANCHO_OBRAS).forEach(function (f) {
    if (String(f[0]).trim() && String(f[4]).trim().toUpperCase() === 'POR VALIDAR') {
      novedades.push([fecha, '', String(f[5]), 'OBRA POR VALIDAR', String(f[0]).trim() + ' — apruébala o recházala en la hoja Obras']);
    }
  });

  const shN = ss.getSheetByName(HOJA.NOV);
  const otras = filas_(HOJA.NOV, 5).filter(function (f) { return fechaTxt_(f[0]) && fechaTxt_(f[0]) !== fecha; })
    .map(function (f) { return [fechaTxt_(f[0]), cedula_(f[1]), f[2], f[3], f[4]]; });
  const todas = otras.concat(novedades);
  const viejas = shN.getLastRow() - 1;
  if (viejas > 0) shN.getRange(2, 1, viejas, 5).clearContent();
  if (todas.length) {
    if (todas.length + 1 > shN.getMaxRows()) shN.insertRowsAfter(shN.getMaxRows(), todas.length);
    shN.getRange(2, 1, todas.length, 5).setValues(todas);
  }
  return novedades.length;
}

function ss_() {
  const activa = SpreadsheetApp.getActiveSpreadsheet();
  if (activa) return activa;
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('LIBRO_ID'));
}

function ahora_() { return new Date(); }

function hoy_() { return fechaTxt_(ahora_()); }

function esFecha_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }

/** Cualquier fecha (de la hoja o escrita) convertida a texto AAAA-MM-DD. */
function fechaTxt_(v) {
  if (esFecha_(v)) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

function horaTxt_(v) {
  if (esFecha_(v)) return Utilities.formatDate(v, TZ, 'HH:mm');
  const m = String(v || '').match(/(\d{1,2}):(\d{2})/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
}

function minutos_(hhmm) {
  const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** Celular colombiano listo para un enlace de WhatsApp (57 + 10 dígitos), o vacío si no sirve. */
function whatsapp_(v) {
  const n = cedula_(v);
  if (/^3\d{9}$/.test(n)) return '57' + n;
  return /^573\d{9}$/.test(n) ? n : '';
}

/** "PEDRO PÉREZ GÓMEZ" -> "Pedro Pérez Gómez". */
function nombrePropio_(v) {
  return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); });
}

function tituloObra_(v) { return nombrePropio_(v).slice(0, 60).trim(); }

/** Para comparar nombres de obra sin importar mayúsculas, tildes ni espacios de más. */
function claveObra_(v) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function cedula_(v) { return String(v === null || v === undefined ? '' : v).replace(/\D/g, ''); }

function numero_(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  return isFinite(n) ? n : '';
}

function mapa_(lat, lon) { return 'https://www.google.com/maps?q=' + lat + ',' + lon; }

/** Primera quincena (1 al 15) o segunda (16 a fin de mes) según el día de hoy. */
function quincena_() {
  const p = hoy_().split('-');
  const a = Number(p[0]), m = Number(p[1]), d = Number(p[2]);
  const fin = new Date(a, m, 0).getDate();
  const base = p[0] + '-' + p[1] + '-';
  return d <= 15 ? [base + '01', base + '15'] : [base + '16', base + ('0' + fin).slice(-2)];
}

function filas_(nombre, ancho) {
  const sh = ss_().getSheetByName(nombre);
  if (!sh) throw new Error('Falta la hoja "' + nombre + '". Usa el menú ODESA Asistencia > Instalar / reparar hojas.');
  const n = sh.getLastRow();
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, ancho).getValues();
}

/** Las últimas filas de una hoja, con el número de fila donde empiezan. */
function ultimas_(sh, cuantas) {
  const n = sh.getLastRow();
  if (n < 2) return { inicio: 2, valores: [] };
  const inicio = Math.max(2, n - cuantas + 1);
  return { inicio: inicio, valores: sh.getRange(inicio, 1, n - inicio + 1, ANCHO_REG).getValues() };
}

/** Busca la jornada que el trabajador tiene abierta hoy y las que dejó abiertas en días anteriores. */
function jornadaAbierta_(sh, cedula, hoy) {
  const bloque = ultimas_(sh, 400);
  const r = { bloque: bloque, fila: 0, datos: null, viejas: [] };
  bloque.valores.forEach(function (f, i) {
    if (cedula_(f[COL.CEDULA - 1]) !== cedula) return;
    if (String(f[COL.ESTADO - 1]) !== 'ABIERTA') return;
    if (fechaTxt_(f[COL.FECHA - 1]) === hoy) { r.fila = bloque.inicio + i; r.datos = f; }
    else r.viejas.push(bloque.inicio + i);
  });
  return r;
}

function filaNueva_(sh) {
  const n = sh.getLastRow() + 1;
  if (n > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 200);
  return n;
}

function configuracion_() {
  const c = { correo: '', fotoObligatoria: true, gpsObligatorio: true, radio: 150, horaRecordatorio: '17:00',
    horaEntrada: '07:00', avisarDomingo: false, enlace: '' };
  const sh = ss_().getSheetByName(HOJA.CONF);
  if (!sh || sh.getLastRow() < 2) return c;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (f) {
    const k = String(f[0]).toLowerCase(), v = String(f[1]).trim();
    if (k.indexOf('correo') === 0) c.correo = v;
    else if (k.indexOf('foto') === 0) c.fotoObligatoria = v.toUpperCase() !== 'NO';
    else if (k.indexOf('gps') === 0) c.gpsObligatorio = v.toUpperCase() !== 'NO';
    else if (k.indexOf('radio') === 0) c.radio = Number(f[1]) > 0 ? Number(f[1]) : 150;
    else if (k.indexOf('hora') === 0) c.horaRecordatorio = horaTxt_(f[1]);
    else if (k.indexOf('aviso') === 0) c.horaEntrada = horaTxt_(f[1]);
    else if (k.indexOf('domingo') === 0) c.avisarDomingo = v.toUpperCase() === 'SI';
    else if (k.indexOf('enlace') === 0) c.enlace = /^https:\/\//.test(v) ? v : '';
  });
  return c;
}

function buscarTrabajador_(cedula) {
  if (!cedula) return null;
  const datos = filas_(HOJA.TRAB, ANCHO_TRAB);
  for (let i = 0; i < datos.length; i++) {
    if (cedula_(datos[i][0]) === cedula) {
      return {
        fila: i + 2, cedula: cedula, nombre: String(datos[i][1]).trim(),
        estado: String(datos[i][5]).trim().toUpperCase() || 'ACTIVO', autorizo: datos[i][6],
        celular: cedula_(datos[i][8])
      };
    }
  }
  return null;
}

function obras_(conf) {
  return filas_(HOJA.OBRAS, ANCHO_OBRAS).filter(function (f) { return String(f[0]).trim(); })
    .map(function (f) { return obraDeFila_(f, conf); })
    .filter(function (o) { return !o.inactiva; });
}

function actividades_() {
  return filas_(HOJA.ACT, 2).filter(function (f) {
    return String(f[0]).trim() && String(f[1]).trim().toUpperCase() !== 'NO';
  }).map(function (f) { return String(f[0]).trim(); });
}

function obraDeFila_(f, conf) {
  const m = String(f[2]).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  const activa = String(f[4]).trim().toUpperCase();
  return {
    nombre: String(f[0]).trim(),
    lat: m ? Number(m[1]) : '', lon: m ? Number(m[2]) : '',
    radio: Number(f[3]) > 0 ? Number(f[3]) : conf.radio,
    inactiva: activa === 'NO', porValidar: activa === 'POR VALIDAR'
  };
}

/** La obra con ese nombre (sin importar mayúsculas ni tildes), esté activa o no. */
function obraPorNombre_(nombre, conf) {
  const clave = claveObra_(nombre);
  if (!clave) return null;
  const datos = filas_(HOJA.OBRAS, ANCHO_OBRAS);
  for (let i = 0; i < datos.length; i++) {
    if (claveObra_(datos[i][0]) === clave) return obraDeFila_(datos[i], conf);
  }
  return null;
}

/** Agrega a la hoja "Obras" la que escribió un trabajador, con la ubicación de su celular. */
function crearObra_(nombre, direccion, lat, lon, conf, t, ahora) {
  const sh = ss_().getSheetByName(HOJA.OBRAS);
  const hayGps = lat !== '' && lon !== '';
  sh.getRange(filaNueva_(sh), 1, 1, ANCHO_OBRAS).setValues([[
    nombre, direccion.replace(/\s+/g, ' ').trim().slice(0, 120), hayGps ? lat + ', ' + lon : '',
    conf.radio, 'POR VALIDAR', t.nombre, ahora
  ]]);
  return { nombre: nombre, lat: lat, lon: lon, radio: conf.radio, inactiva: false, porValidar: true };
}

/** Busca una obra por nombre. Con "incluirInactivas" sirve para cerrar jornadas de obras ya desactivadas. */
function buscarObra_(nombre, conf, incluirInactivas) {
  nombre = nombre.trim();
  if (!nombre) return null;
  const o = obraPorNombre_(nombre, conf);
  if (o && (incluirInactivas || !o.inactiva)) return o;
  return incluirInactivas ? { nombre: nombre, lat: '', lon: '', radio: conf.radio } : null;
}

/** Compara la ubicación del celular con la de la obra. */
function ubicacion_(obra, lat, lon, precision, alertas, momento) {
  if (lat === '' || lon === '') {
    alertas.push('Sin GPS en la ' + momento);
    return { texto: 'SIN GPS', distancia: '' };
  }
  if (precision !== '' && precision > 200) {
    alertas.push('GPS impreciso en la ' + momento + ' (±' + Math.round(precision) + ' m)');
  }
  if (!obra || obra.lat === '' || obra.lon === '') return { texto: 'OBRA SIN COORDENADAS', distancia: '' };
  const d = Math.round(distancia_(lat, lon, obra.lat, obra.lon));
  if (d <= obra.radio) return { texto: 'EN OBRA', distancia: d };
  alertas.push('Fuera de obra en la ' + momento + ' (' + d + ' m)');
  return { texto: 'FUERA DE OBRA', distancia: d };
}

/** Distancia en metros entre dos puntos. */
function distancia_(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180, R = 6371000;
  const a = Math.pow(Math.sin((lat2 - lat1) * rad / 2), 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.pow(Math.sin((lon2 - lon1) * rad / 2), 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

function guardarFoto_(dataUrl, ahora, tipo, t) {
  const b64 = dataUrl.indexOf(',') >= 0 ? dataUrl.split(',')[1] : dataUrl;
  const props = PropertiesService.getScriptProperties();
  let raiz;
  try {
    raiz = DriveApp.getFolderById(props.getProperty('CARPETA_FOTOS'));
  } catch (e) {
    raiz = DriveApp.createFolder('Fotos Asistencia ODESA');
    props.setProperty('CARPETA_FOTOS', raiz.getId());
  }
  const mes = Utilities.formatDate(ahora, TZ, 'yyyy-MM');
  const sub = raiz.getFoldersByName(mes);
  const carpeta = sub.hasNext() ? sub.next() : raiz.createFolder(mes);
  const nombre = Utilities.formatDate(ahora, TZ, 'yyyy-MM-dd') + '_' + Utilities.formatDate(ahora, TZ, 'HHmm') +
    '_' + tipo.toUpperCase() + '_' + t.cedula + '_' + t.nombre + '.jpg';
  return carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', nombre)).getUrl();
}

function hoja_(ss, nombre) {
  let sh = ss.getSheetByName(nombre);
  const nueva = !sh;
  if (nueva) sh = ss.insertSheet(nombre);
  encabezado_(sh, 1, ENCABEZADOS[nombre]);   // siempre, para que aparezcan las columnas nuevas al actualizar
  return { sh: sh, nueva: nueva };
}

function encabezado_(sh, fila, titulos) {
  sh.getRange(fila, 1, 1, titulos.length).setValues([titulos])
    .setFontWeight('bold').setBackground('#0B3A66').setFontColor('#FFFFFF').setWrap(true);
  sh.setFrozenRows(fila);
}

/* ============================================================
 * 4. NOTIFICACIONES AL CELULAR
 * La app instalada le pide permiso al trabajador y nos entrega una "dirección de avisos".
 * Para enviarle un aviso se hace una petición firmada a esa dirección (estándar Web Push).
 * ============================================================ */

// Solo se aceptan direcciones de los servicios de avisos de Chrome/Android, Firefox, iPhone y Edge.
const SERVICIOS_PUSH = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;

/** Enlace público de la app: el de Configuración, o el que la propia app reportó, o el de Google. */
function enlaceApp_() {
  const props = PropertiesService.getScriptProperties();
  return configuracion_().enlace || props.getProperty('URL_APP_PUBLICA') || props.getProperty('URL_APP') || '';
}

/** La primera vez que la app publicada se conecta, se anota su dirección para usarla en los recordatorios. */
function anotarEnlace_(app) {
  app = String(app || '');
  if (!/^https:\/\/[a-z0-9-]+\.github\.io\/[\w.\/-]*$/i.test(app) || app.length > 200) return;
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('URL_APP_PUBLICA')) props.setProperty('URL_APP_PUBLICA', app);
}

/** Fila de la hoja "Avisos" de un celular. Con "soloActiva" ignora las que ya vencieron. */
function filaAviso_(disp, soloActiva) {
  if (!disp) return null;
  const sh = ss_().getSheetByName(HOJA.AVISOS);
  if (!sh) return null;
  const datos = filas_(HOJA.AVISOS, ANCHO_AVISOS);
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][2]) !== disp) continue;
    if (soloActiva && (!datos[i][3] || String(datos[i][6]) === 'VENCIDA')) return null;
    return { fila: i + 2, cedula: cedula_(datos[i][0]), endpoint: String(datos[i][3]) };
  }
  return null;
}

/** Envía la notificación a los celulares de esas cédulas (o a un solo celular) y anota el resultado. */
function avisar_(cedulas, soloDisp) {
  const sh = ss_().getSheetByName(HOJA.AVISOS);
  const destinos = [];
  if (sh) {
    filas_(HOJA.AVISOS, ANCHO_AVISOS).forEach(function (f, i) {
      if (!f[3] || String(f[6]) === 'VENCIDA') return;
      const c = cedula_(f[0]);
      if (soloDisp ? String(f[2]) === soloDisp : cedulas[c]) destinos.push({ fila: i + 2, cedula: c, endpoint: String(f[3]) });
    });
  }
  const codigos = enviarPush_(destinos);
  const ahora = ahora_(), avisados = {};
  destinos.forEach(function (d, i) {
    const c = codigos[i], bien = c >= 200 && c < 300;
    if (bien) avisados[d.cedula] = true;
    sh.getRange(d.fila, 6, 1, 2).setValues([[ahora, bien ? 'ENVIADO' : (c === 404 || c === 410) ? 'VENCIDA' : 'ERROR ' + c]]);
  });
  return { avisados: avisados, codigos: codigos };
}

/** Texto que muestra la notificación, según cómo va el día de ese trabajador. */
function textoAviso_(disp) {
  if (disp && CacheService.getScriptCache().get('PRUEBA_' + disp)) {
    return { titulo: 'ODESA: aviso de prueba', cuerpo: '¡Funciona! Así te van a llegar los recordatorios.' };
  }
  const fila = filaAviso_(disp, false);
  if (!fila) return { titulo: 'Asistencia ODESA', cuerpo: 'Abre la app para revisar tu registro de hoy.' };
  const ahora = ahora_(), hoy = fechaTxt_(ahora);
  let abierta = null, hay = false;
  ultimas_(ss_().getSheetByName(HOJA.REG), 400).valores.forEach(function (f) {
    if (cedula_(f[COL.CEDULA - 1]) !== fila.cedula || fechaTxt_(f[COL.FECHA - 1]) !== hoy) return;
    hay = true;
    if (String(f[COL.ESTADO - 1]) === 'ABIERTA') abierta = f;
  });
  if (abierta) {
    const entrada = abierta[COL.H_ENT - 1];
    const min = esFecha_(entrada) ? Math.max(0, Math.round((ahora.getTime() - entrada.getTime()) / 60000)) : 0;
    return { titulo: 'ODESA: marca tu SALIDA', cuerpo: 'Llevas ' + Math.floor(min / 60) + ' h ' + (min % 60) +
      ' min. Sin la salida no se cuentan tus horas. Toca aquí.' };
  }
  if (!hay) return { titulo: 'ODESA: marca tu ENTRADA', cuerpo: 'Toca aquí para registrar tu llegada a la obra.' };
  return { titulo: 'Asistencia ODESA', cuerpo: 'Tu registro de hoy está al día. ¡Gracias!' };
}

/** Hace las peticiones a los servicios de avisos. Devuelve el código de respuesta de cada una (0 = no se pudo). */
function enviarPush_(destinos) {
  if (!destinos.length) return [];
  const publica = PropertiesService.getScriptProperties().getProperty('VAPID_PUB');
  if (!publica) return destinos.map(function () { return 0; });
  const contacto = 'mailto:' + (configuracion_().correo.split(/[,; ]+/)[0] || 'avisos@asistencia-odesa.app');
  const pases = {};
  try {
    const peticiones = destinos.map(function (d) {
      const origen = d.endpoint.match(/^https:\/\/[^\/]+/)[0];
      if (!pases[origen]) pases[origen] = pasePush_(origen, contacto);
      return {
        url: d.endpoint, method: 'post', payload: '', muteHttpExceptions: true,
        headers: { Authorization: 'vapid t=' + pases[origen] + ', k=' + publica, TTL: '7200', Urgency: 'high' }
      };
    });
    return UrlFetchApp.fetchAll(peticiones).map(function (r) { return r.getResponseCode(); });
  } catch (e) {
    return destinos.map(function () { return 0; });
  }
}

/** "Pase" firmado (VAPID) que el servicio de avisos exige para aceptar el envío. Dura 12 horas. */
function pasePush_(origen, contacto) {
  const base = b64url_('{"typ":"JWT","alg":"ES256"}') + '.' + b64url_(JSON.stringify({
    aud: origen, exp: Math.floor(ahora_().getTime() / 1000) + 12 * 3600, sub: contacto
  }));
  return base + '.' + firmar_(base);
}

/* ---- Firma digital (curva P-256). Es matemática estándar; no hay nada que ajustar aquí. ---- */

function curva_() {
  if (curva_.c) return curva_.c;
  curva_.c = {
    p: BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
    n: BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
    g: {
      x: BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
      y: BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')
    },
    cero: BigInt(0), uno: BigInt(1), dos: BigInt(2), tres: BigInt(3)
  };
  return curva_.c;
}

function mod_(a, m) { const r = a % m; return r < curva_().cero ? r + m : r; }

function inverso_(a, m) {
  const C = curva_();
  let viejoR = mod_(a, m), r = m, viejoS = C.uno, s = C.cero;
  while (r !== C.cero) {
    const q = viejoR / r;
    let t = viejoR - q * r; viejoR = r; r = t;
    t = viejoS - q * s; viejoS = s; s = t;
  }
  return mod_(viejoS, m);
}

function sumar_(P, Q) {
  const C = curva_(), p = C.p;
  if (!P) return Q;
  if (!Q) return P;
  let l;
  if (P.x === Q.x) {
    if (mod_(P.y + Q.y, p) === C.cero) return null;
    l = mod_((C.tres * P.x * P.x - C.tres) * inverso_(C.dos * P.y, p), p);
  } else {
    l = mod_((Q.y - P.y) * inverso_(Q.x - P.x, p), p);
  }
  const x = mod_(l * l - P.x - Q.x, p);
  return { x: x, y: mod_(l * (P.x - x) - P.y, p) };
}

function multiplicar_(k, P) {
  const C = curva_();
  let R = null, Q = P;
  while (k > C.cero) {
    if ((k & C.uno) === C.uno) R = sumar_(R, Q);
    Q = sumar_(Q, Q);
    k = k >> C.uno;
  }
  return R;
}

function hexDeBytes_(bytes) {
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function bytesDeHex_(hex) {
  const out = [];
  for (let i = 0; i < hex.length; i += 2) {
    const v = parseInt(hex.substr(i, 2), 16);
    out.push(v > 127 ? v - 256 : v);
  }
  return out;
}

function hex64_(n) { return ('0000000000000000000000000000000000000000000000000000000000000000' + n.toString(16)).slice(-64); }

function b64url_(dato) { return Utilities.base64EncodeWebSafe(dato).replace(/=+$/, ''); }

/** Crea, una sola vez, el par de claves con que se firman los avisos. La privada nunca sale de este archivo de Google. */
function crearClavesPush_(props) {
  const C = curva_();
  let d = C.cero, semilla = '';
  while (d <= C.cero || d >= C.n) {
    semilla += Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + new Date().getTime();
    d = BigInt('0x' + hexDeBytes_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, semilla)));
  }
  const Q = multiplicar_(d, C.g);
  props.setProperty('VAPID_PRIV', hex64_(d));
  props.setProperty('VAPID_PUB', b64url_(bytesDeHex_('04' + hex64_(Q.x) + hex64_(Q.y))));
}

/** Firma ES256 de un texto, en el formato que piden los servicios de avisos. */
function firmar_(texto) {
  const C = curva_();
  const privada = PropertiesService.getScriptProperties().getProperty('VAPID_PRIV');
  const d = BigInt('0x' + privada);
  const resumen = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto);
  const z = BigInt('0x' + hexDeBytes_(resumen));
  for (let i = 0; i < 100; i++) {
    // Número de un solo uso, derivado de la clave y del mensaje (no depende del azar).
    const k = BigInt('0x' + hexDeBytes_(Utilities.computeHmacSha256Signature(resumen.concat([i]), bytesDeHex_(privada))));
    if (k <= C.cero || k >= C.n) continue;
    const r = mod_(multiplicar_(k, C.g).x, C.n);
    if (r === C.cero) continue;
    const s = mod_(inverso_(k, C.n) * (z + r * d), C.n);
    if (s === C.cero) continue;
    return b64url_(bytesDeHex_(hex64_(r) + hex64_(s)));
  }
  throw new Error('No se pudo firmar el aviso.');
}
