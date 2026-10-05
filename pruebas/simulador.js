// Simulador de los servicios de Google (hojas, Drive, correo, tareas, peticiones a internet).
// Permite ejecutar google/Codigo.gs en este computador, sin tocar ninguna cuenta real.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const raiz = path.join(__dirname, '..');
const aBytes = buf => Array.from(buf).map(b => (b > 127 ? b - 256 : b));          // como los entrega Google: de -128 a 127
const aBuffer = d => (typeof d === 'string' ? Buffer.from(d, 'utf8') : Buffer.from(d.map(b => (b + 256) % 256)));

/* ---------------- Simulador de los servicios de Google ---------------- */
const TZ_OFF = 5 * 3600000; // Bogotá = UTC-5, sin horario de verano
function partes(d) { const l = new Date(d.getTime() - TZ_OFF); return {
  yyyy: l.getUTCFullYear(), MM: ('0' + (l.getUTCMonth() + 1)).slice(-2), dd: ('0' + l.getUTCDate()).slice(-2),
  HH: ('0' + l.getUTCHours()).slice(-2), mm: ('0' + l.getUTCMinutes()).slice(-2) }; }

class Hoja {
  constructor(nombre) { this.nombre = nombre; this.celdas = []; this.max = 1000; this.fmt = {}; }
  getName() { return this.nombre; }
  getMaxRows() { return this.max; }
  getLastRow() {
    for (let r = this.celdas.length - 1; r >= 0; r--) {
      if ((this.celdas[r] || []).some(v => v !== '' && v !== undefined && v !== null)) return r + 1;
    }
    return 0;
  }
  insertRowsAfter(_, n) { this.max += n; }
  setFrozenRows() {} setColumnWidth() {}
  getRange(f, c, nf = 1, nc = 1) {
    if (typeof f !== 'number') throw new Error('El simulador solo acepta rangos numéricos');
    if (f < 1 || c < 1 || nf < 1 || nc < 1) throw new Error('Rango inválido ' + [f, c, nf, nc]);
    if (f + nf - 1 > this.max) throw new Error('Rango fuera de la hoja ' + this.nombre + ': fila ' + (f + nf - 1));
    return new Rango(this, f, c, nf, nc);
  }
}
class Rango {
  constructor(h, f, c, nf, nc) { Object.assign(this, { h, f, c, nf, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nf; i++) {
      const fila = [];
      for (let j = 0; j < this.nc; j++) {
        const v = (this.h.celdas[this.f - 1 + i] || [])[this.c - 1 + j];
        fila.push(v === undefined ? '' : v);
      }
      out.push(fila);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    if (vals.length !== this.nf || vals.some(f => f.length !== this.nc)) {
      throw new Error('setValues: el tamaño no coincide con el rango en ' + this.h.nombre);
    }
    vals.forEach((fila, i) => fila.forEach((v, j) => {
      const r = this.f - 1 + i, c = this.c - 1 + j;
      while (this.h.celdas.length <= r) this.h.celdas.push([]);
      const texto = this.h.fmt[c] === '@' && r >= 1;
      // Sheets interpreta lo que se escribe igual que si lo tecleara una persona.
      if (typeof v === 'string' && !texto) {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) v = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + TZ_OFF);
        else if (/^\d+$/.test(v)) v = Number(v);
      }
      this.h.celdas[r][c] = v;
    }));
    return this;
  }
  setValue(v) { return new Rango(this.h, this.f, this.c, 1, 1).setValues([[v]]); }
  clearContent() { return this.setValuesCrudos(''); }
  setValuesCrudos(v) {
    for (let i = 0; i < this.nf; i++) for (let j = 0; j < this.nc; j++) {
      const r = this.f - 1 + i; if (this.h.celdas[r]) this.h.celdas[r][this.c - 1 + j] = v;
    }
    return this;
  }
  setNumberFormat(f) { if (this.nc === 1 && this.f === 2) this.h.fmt[this.c - 1] = f; return this; }
  setDataValidation() { return this; } setFontWeight() { return this; } setFontSize() { return this; }
  setBackground() { return this; } setFontColor() { return this; } setWrap() { return this; }
}
class Libro {
  constructor() { this.hojas = [new Hoja('Hoja 1')]; this.avisos = []; }
  getId() { return 'LIBRO123'; }
  getSheetByName(n) { return this.hojas.find(h => h.nombre === n) || null; }
  insertSheet(n) { const h = new Hoja(n); this.hojas.push(h); return h; }
  getSheets() { return this.hojas.slice(); }
  deleteSheet(h) { this.hojas = this.hojas.filter(x => x !== h); }
  setSpreadsheetTimeZone(z) { this.tz = z; } setSpreadsheetLocale(l) { this.loc = l; }
  toast(m) { this.avisos.push(m); }
}

function entorno() {
  const libro = new Libro();
  const props = {}, archivos = [], correos = [], disparadores = [], peticiones = [], cache = {};
  const red = { codigo: () => 201 };   // las pruebas pueden cambiar la respuesta del servicio de avisos
  class Carpeta {
    constructor(n) { this.n = n; this.sub = {}; this.id = 'F' + Math.random(); }
    getId() { return this.id; }
    getFoldersByName(n) { const c = this.sub[n]; let dado = false; return { hasNext: () => !!c && !dado, next: () => { dado = true; return c; } }; }
    createFolder(n) { return (this.sub[n] = new Carpeta(n)); }
    createFile(blob) { archivos.push(blob.nombre); return { getUrl: () => 'https://drive.google.com/file/d/' + archivos.length }; }
  }
  const carpetas = {};
  const ctx = {
    console, Math, JSON, Object, Array, String, Number, Date, isFinite, isNaN,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => libro, openById: () => libro,
      getUi: () => ({ createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => {} }; return m; } }),
      newDataValidation: () => { const b = { requireValueInList: () => b, build: () => ({}) }; return b; }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      formatDate(d, tz, patron) {
        if (tz !== 'America/Bogota') throw new Error('Zona horaria inesperada');
        const p = partes(d);
        return patron.replace(/yyyy|MM|dd|HH|mm/g, t => p[t]);
      },
      base64Decode: s => Buffer.from(s, 'base64'),
      base64EncodeWebSafe: d => aBuffer(d).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, d) => aBytes(crypto.createHash(alg).update(aBuffer(d)).digest()),
      computeHmacSha256Signature: (valor, clave) => aBytes(crypto.createHmac('sha256', aBuffer(clave)).update(aBuffer(valor)).digest()),
      getUuid: () => crypto.randomUUID(),
      newBlob: (bytes, tipo, nombre) => ({ bytes, tipo, nombre })
    },
    DriveApp: {
      createFolder(n) { const c = new Carpeta(n); carpetas[c.id] = c; return c; },
      getFolderById(id) { if (!carpetas[id]) throw new Error('No existe'); return carpetas[id]; }
    },
    ScriptApp: {
      getProjectTriggers: () => disparadores.slice(),
      deleteTrigger: t => disparadores.splice(disparadores.indexOf(t), 1),
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/ABC/exec' }),
      newTrigger(fn) { const b = { timeBased: () => b, everyDays: () => b, everyMinutes: () => b, atHour: () => b, inTimezone: () => b,
        create() { disparadores.push({ getHandlerFunction: () => fn }); } }; return b; }
    },
    MailApp: { sendEmail: (a, asunto, cuerpo) => correos.push(typeof a === 'object'
      ? { a: a.to, asunto: a.subject, cuerpo: a.body, html: a.htmlBody } : { a, asunto, cuerpo }) },
    HtmlService: {
      createHtmlOutputFromFile: f => { const o = { archivo: f, setTitle: () => o, addMetaTag: () => o }; return o; },
      createHtmlOutput: h => ({ html: h })
    },
    ContentService: { MimeType: { JSON: 'application/json' },
      createTextOutput: txt => { const o = { texto: txt, setMimeType: m => { o.tipo = m; return o; } }; return o; } },
    CacheService: { getScriptCache: () => ({ put: (k, v) => { cache[k] = v; }, get: k => cache[k] || null }) },
    UrlFetchApp: { fetchAll: lista => lista.map(p => { peticiones.push(p); const c = red.codigo(p); return { getResponseCode: () => c }; }) }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, 'google', 'Codigo.gs'), 'utf8'), ctx, { filename: 'Codigo.gs' });
  let reloj = new Date();
  ctx.ahora_ = () => new Date(reloj.getTime());
  return { ctx, libro, archivos, correos, disparadores, peticiones, props, red, cache,
    // Igual que la app publicada: una petición por internet a la puerta de entrada del motor.
    pedir(accion, datos) { return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ accion, datos }) } }).texto); },
    a(iso) { reloj = new Date(iso + '-05:00'); },            // fija la hora de Bogotá
    hoja: n => libro.getSheetByName(n),
    filas(n) { const h = libro.getSheetByName(n); return h.celdas.slice(1).filter(f => f && f.some(v => v !== '' && v !== undefined)); } };
}


module.exports = { entorno, raiz };
