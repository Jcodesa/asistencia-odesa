# Asistencia ODESA

App instalable para que los operarios marquen entrada, salida, obra y actividad desde su celular.
Los datos quedan en una hoja de Google Sheets y las fotos en Google Drive. No tiene ningún costo.

## Cómo está armada

| Parte | Dónde vive | Archivos |
|---|---|---|
| **La app** (lo que ve el trabajador) | GitHub Pages | `index.html`, `config.js`, `sw.js`, `manifest.webmanifest`, íconos |
| **El motor** (guarda los datos y envía los avisos) | Google Apps Script, pegado a tu hoja | `google/Codigo.gs` |
| **Las pruebas** | Tu computador | carpeta `pruebas/` |

La app y el motor se conectan con un solo dato: el enlace de la aplicación web de Google (termina en `/exec`),
que se pega en `config.js`.

## Montaje

### 1. El motor, en Google
1. Abre tu hoja de Google Sheets (o crea una en blanco llamada "Asistencia ODESA").
2. Menú **Extensiones > Apps Script**.
3. Borra todo lo que haya en `Código.gs` y pega el contenido completo de `google/Codigo.gs`. Guarda.
4. Arriba, elige la función **instalar** y toca **Ejecutar**. Autoriza cuando Google lo pida
   ("Configuración avanzada" > "Ir a … (no seguro)" > "Permitir"). El aviso es normal: la aplicación es tuya.
5. **Implementar > Nueva implementación > engranaje > Aplicación web**.
   "Ejecutar como": **Yo**. "Quién tiene acceso": **Cualquier usuario**. Toca **Implementar** y copia el enlace que termina en `/exec`.
   - Si ya tenías una implementación: **Implementar > Administrar implementaciones > lápiz > Versión: Nueva versión > Implementar**. El enlace no cambia.
6. En la hoja: llena **Obras** (pega las coordenadas desde Google Maps) y **Trabajadores**, y escribe tu correo en **Configuración**.

El archivo `Index` que había antes en Apps Script ya no hace falta. Si lo dejas, no estorba.

### 2. La app, en GitHub
1. Abre `config.js` con el Bloc de notas y pega tu enlace `/exec` entre las comillas. Guarda.
2. En GitHub Desktop: **File > New repository**, nombre `asistencia-odesa`, **Create repository**.
3. Copia dentro de esa carpeta todo el contenido de este ZIP.
4. Escribe el Summary, toca **Commit to main** y luego **Publish repository**.
   Desmarca **Keep this code private**: GitHub Pages gratis solo publica repositorios públicos.
   El repositorio no contiene datos de trabajadores.
5. En github.com, entra al repositorio: **Settings > Pages > Deploy from a branch > main / (root) > Save**.
6. En uno o dos minutos la app queda en `https://TU-USUARIO.github.io/asistencia-odesa/`.

### 3. Prueba en tu celular
1. Abre la dirección de la app y escribe tu cédula.
2. Toca **Activar avisos**, acepta el permiso y luego toca **Probar aviso**: debe sonar una notificación.
3. Marca una entrada y una salida, y revisa que aparezcan en la pestaña **Registros**.

## Ajustes (pestaña "Configuración" de la hoja)

| Ajuste | Para qué sirve |
|---|---|
| Correo para los avisos | A dónde llega el resumen de la noche y la lista de quienes no han marcado salida |
| Foto obligatoria / GPS obligatorio | SI o NO |
| Radio por defecto de las obras (m) | Distancia máxima para contar como "EN OBRA" |
| Hora del recordatorio de salida | A esa hora se avisa a quien sigue sin salida, y se repite una hora después. Vacío = apagado |
| Aviso de entrada: hora | A esa hora se avisa a quien no ha marcado entrada. Vacío = apagado |
| Domingos: enviar aviso de entrada | SI o NO |
| Enlace de la app | Se llena solo; es el que va en los recordatorios por WhatsApp |

Los avisos salen dentro de los 15 minutos siguientes a la hora configurada.

## Para actualizar más adelante
- **La app:** reemplaza los archivos en la carpeta del repositorio (menos `config.js`), y en GitHub Desktop: Summary, Commit, Push.
- **El motor:** pega el nuevo `google/Codigo.gs`, ejecuta **instalar** y publica una **Nueva versión**.

## Verificación
`npm run verificar` ejecuta el motor sobre un simulador de Google y comprueba marcaciones, nómina,
firma de los avisos y la conexión entre la app y el motor. `npm run local` abre la app en
`http://localhost:8765/` con un motor simulado (cédula de ejemplo: 1045678901).
