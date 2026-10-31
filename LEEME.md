# Asistencia ODESA

App instalable para que los operarios marquen entrada, salida, obra y actividad desde su celular.
Los datos quedan en una hoja de Google Sheets y las fotos en Google Drive. No tiene ningún costo.

## Cómo está armada

| Parte | Dónde vive | Archivos |
|---|---|---|
| **La app** (lo que ve el trabajador) | GitHub Pages | `index.html`, `config.js`, `sw.js`, `manifest.webmanifest`, íconos |
| **El motor** (guarda los datos y envía los avisos) | Google Apps Script, pegado a tu hoja | `google/Codigo.gs` |
| **El tablero** (indicadores y gráficos en la hoja) | El mismo proyecto de Apps Script, en otro archivo | `google/Tablero.gs` |
| **El panel del administrador** (app aparte para la oficina) | GitHub Pages, carpeta `admin/` + archivo `Panel` en Apps Script | `admin/`, `google/Panel.gs` |
| **Las pruebas** | Tu computador | carpeta `pruebas/` |

La app y el motor se conectan con un solo dato: el enlace de la aplicación web de Google (termina en `/exec`),
que se pega en `config.js`.

## Montaje

### 1. El motor, en Google
1. Abre tu hoja de Google Sheets (o crea una en blanco llamada "Asistencia ODESA").
2. Menú **Extensiones > Apps Script**.
3. Borra todo lo que haya en `Código.gs` y pega el contenido completo de `google/Codigo.gs`. Guarda.
   Luego toca el **+** de "Archivos" > **Secuencia de comandos**, llámalo `Tablero`, y pega el contenido de `google/Tablero.gs`. Guarda.
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
| Correo del administrador | Recibe el resumen de la noche y los avisos de quien no marca. Pueden ser varios, separados por coma |
| Foto obligatoria / GPS obligatorio | SI o NO |
| Radio por defecto de las obras (m) | Distancia máxima para contar como "EN OBRA" |
| Hora del recordatorio de salida | Desde esa hora se avisa a quien sigue sin salida. Vacío = apagado |
| Aviso de entrada: hora | Desde esa hora se avisa a quien no ha marcado entrada. Vacío = apagado |
| Domingos: enviar avisos | SI o NO (por defecto NO: los domingos no sale ningún aviso) |
| Enlace de la app | Se llena solo; es el que va en los recordatorios por WhatsApp |
| Repetir los avisos cada cuántos minutos | Cada cuánto se le vuelve a avisar a quien sigue sin marcar (5, 10, 15, 30...) |
| Máximo de avisos seguidos por persona | Cuántas veces se insiste como máximo en cada aviso. 1 = sin repetir |
| Sábados: hora del recordatorio de salida | Los sábados el aviso de salida sale a esta hora (por defecto 12:00) |
| Festivos de Colombia: enviar avisos | SI o NO (por defecto NO). Los festivos se calculan solos cada año |
| Días libres adicionales | Fechas sin avisos, por ejemplo `24/12/2026, 31/12/2026` |
| Avisar al administrador si alguien sigue sin marcar después de (minutos) | Pasados esos minutos desde la hora de entrada o de salida, llega UN correo con quienes siguen sin marcar (por defecto 30). Vacío = apagado |
| Enviar esos correos también a todos los que pueden editar la hoja | SI o NO (por defecto SI): además del correo de arriba, les llega al dueño y a los editores de la hoja |

Los avisos salen dentro de los 5 minutos siguientes a la hora configurada y se repiten solo a quien sigue sin marcar;
en cuanto la persona marca, dejan de llegarle. Desde el tercer aviso el texto es más insistente.

## Tablero (pestaña "Tablero" de la hoja)

Muestra, para el periodo que elijas en la celda amarilla, seis indicadores, seis gráficos y debajo las mismas cifras en tablas.

- Se actualiza solo: al abrir la hoja, al cambiar el periodo y cada 15 minutos. También con el menú **ODESA Asistencia > Actualizar tablero**.
- Periodos: Hoy, Últimos 7 días, Quincena actual, Este mes, Mes anterior, Últimos 30 días, o las fechas que escribas en Desde y Hasta.
- Las horas son las de la columna **Horas a pagar** de "Registros": si corriges una jornada allí, el tablero cambia.
- No escribas nada en esa pestaña fuera de la celda del periodo y las dos fechas: lo demás se vuelve a calcular.
- Para compartirlo: **Archivo > Descargar > PDF**, eligiendo "Hoja actual" y orientación horizontal.

## Panel del administrador

Dirección: la de la app terminada en **/admin/** (por ejemplo `https://jcodesa.github.io/asistencia-odesa/admin/`).
Se instala como app aparte en iPhone (Safari › Compartir › Agregar a inicio), Android (botón **Instalar**) o en el PC (Chrome/Edge › ícono de instalar en la barra de direcciones).

- **Quién entra:** quien pueda editar la hoja de asistencia y los correos de la fila 1 de Configuración. Escribe su correo, le llega un código de 6 dígitos y queda dentro 30 días en ese equipo. Si le quitas el permiso de edición en la hoja, pierde el acceso.
- **Hoy:** quién no ha marcado, quién está trabajando (obra, hora y tiempo), quién ya salió. Botones para recordar la entrada o la salida, WhatsApp de cada persona y casillas para escribirle a varias.
- **Enviar:** recordatorio, anuncio o mensaje; a los que no han marcado entrada, a los que no han marcado salida, a todos o a personas elegidas; ahora o programado (se envía solo a esa hora). Llega como notificación y queda en la tarjeta **Mensajes de la oficina** de la app del trabajador (14 días).
- **Enviados:** todo lo enviado y lo programado (se puede cancelar). También queda en la pestaña **Mensajes** de la hoja.
- **Avisos:** cambia las horas de los avisos, la insistencia, el correo de control y los días sin avisos. Escribe las mismas filas de Configuración.

## Para actualizar más adelante
- **La app:** reemplaza los archivos en la carpeta del repositorio (menos `config.js`), y en GitHub Desktop: Summary, Commit, Push.
- **El motor:** pega el nuevo `google/Codigo.gs`, ejecuta **instalar** y publica una **Nueva versión**.
- **El tablero:** pega el nuevo `google/Tablero.gs` en el archivo `Tablero` y guarda. No hay que publicar nada.
- **El panel:** pega el nuevo `google/Panel.gs` en el archivo `Panel`, guarda y publica una **Nueva versión**.

## Verificación
`npm run verificar` ejecuta el motor sobre un simulador de Google y comprueba marcaciones, nómina, tablero,
firma de los avisos y la conexión entre la app y el motor. `npm run local` abre la app en
`http://localhost:8765/` con un motor simulado (cédula de ejemplo: 1045678901).
