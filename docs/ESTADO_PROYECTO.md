# Estado completo del proyecto

Fecha de snapshot: 2026-06-27.

Este documento resume el estado actual del TP para poder compactar o retomar la conversacion sin perder contexto.

## Objetivo del TP

Construir un calibrador de camara online:

- Puro frontend.
- Hosteable en GitHub Pages.
- Basado conceptualmente en el `calibrate.py` del profesor.
- Usando OpenCV.js.
- Capaz de detectar un chessboard `9x6` esquinas internas.
- Capaz de capturar muestras, calibrar y mostrar el feed antidistorsionado.
- Con un switch para activar/desactivar la antidistorsion.

## Ubicaciones importantes

Workspace principal:

```text
/Users/kevin.niedfeld/Documents/Personal/Universidad/Vision Artificial/TP Final
```

App frontend:

```text
/Users/kevin.niedfeld/Documents/Personal/Universidad/Vision Artificial/TP Final/camera-calibrator-online
```

Build custom de OpenCV.js:

```text
/Users/kevin.niedfeld/Documents/Personal/Universidad/Vision Artificial/TP Final/opencv-js-build/opencv
```

No hay repo git inicializado dentro de `camera-calibrator-online` al momento de este snapshot.

## Estructura actual de la app

```text
camera-calibrator-online/
  README.md
  index.html
  styles.css
  capability-check.html
  assets/patterns/chessboard-9x6.svg
  docs/
    ARQUITECTURA.md
    BUILD_OPENCV.md
    DEFENSA.md
    ESTADO_PROYECTO.md
    PRUEBAS.md
  js/
    calibrator.js
    camera.js
    export.js
    main.js
    opencv-capability-worker.js
    opencv-loader.js
    opencv-worker.js
    undistort.js
  lib/
    opencv.js
    opencv_js.wasm
```

Notas:

- La app actual usa principalmente `index.html`, `styles.css`, `js/main.js`, `js/camera.js`, `js/opencv-worker.js`, `js/opencv-capability-worker.js`, `capability-check.html` y `lib/opencv.*`.
- Existen archivos heredados o alternativos (`js/calibrator.js`, `js/opencv-loader.js`, `js/undistort.js`, `js/export.js`) que no son el camino principal actual, pero se mantienen en el proyecto.

## Estado funcional actual

Completado:

- UI principal implementada.
- Camara por `getUserMedia`.
- OpenCV.js corriendo en Web Worker.
- Build custom de OpenCV.js compilada e instalada.
- Smoke test de funciones OpenCV exitoso.
- Deteccion/captura/calibracion/undistorsion conectadas en `js/opencv-worker.js`.
- UX refinada para demo/profesores.
- Documentacion base del TP creada.

Pendiente de validar manualmente en navegador:

- Click en `Iniciar camara`.
- Carga automatica de OpenCV al iniciar la camara.
- Deteccion real del chessboard 9x6.
- Captura de 15 muestras variadas.
- Calibracion completa.
- Switch de antidistorsion ON/OFF.
- Prueba en mobile/monitor externo si se va a presentar proyectado.

## Comando para levantar la app

Desde `camera-calibrator-online`:

```bash
npx --yes http-server . -p 8080 -c-1
```

Abrir:

```text
http://localhost:8080/
```

Pagina de diagnostico:

```text
http://localhost:8080/capability-check.html
```

## Flujo actual de la UI

La UI esta pensada como herramienta tecnica de presentacion, no como landing page.

Partes principales:

- Header con titulo y pills de estado.
- Indicador de progreso pasivo de 4 etapas.
- Panel grande de video/canvas.
- Panel lateral con controles, metricas, cobertura y resultados.
- Registro abajo, ancho alineado con `Vista en vivo + Controles`.

### Indicador de progreso

El stepper es pasivo, no interactivo. No reemplaza controles.

Pasos:

1. `Camara`
   - Activo cuando la camara esta corriendo.
   - Muestra `Camara activa` o `Esperando inicio`.

2. `Tablero`
   - Activo cuando camara + OpenCV estan listos.
   - Muestra conteo `muestras/minimo`, por ejemplo `3/15 muestras`.
   - Completado cuando se alcanza el minimo o cuando ya hay calibracion.

3. `Calibracion`
   - Activo cuando hay muestras suficientes.
   - Completado cuando existe calibracion.
   - Muestra `RMS xxxx` al terminar.

4. `Correccion`
   - Bloqueado hasta que exista calibracion.
   - Desbloqueado cuando el switch de antidistorsion queda disponible.
   - Activo cuando el switch esta encendido.
   - El switch sigue siendo el unico control que ejecuta la correccion.

### Switch de antidistorsion

- Esta arriba del video.
- Permanece deshabilitado hasta tener calibracion.
- OFF: feed original.
- ON: feed antidistorsionado.

### Feedback sobre el video

Se agrego un badge sobre el canvas:

- `Tablero: esperando`
- `Tablero: sin OpenCV`
- `Tablero: buscando`
- `Tablero: detectado`
- `Tablero: sin lectura`

El borde del canvas cambia segun estado:

- Gris/neutral: esperando.
- Naranja: buscando.
- Verde: detectado.
- Rojo: error/sin lectura.

### Controles

Botones actuales:

- `Iniciar camara`: pide permiso y abre webcam.
- `Detener`: apaga la camara.
- `Capturar muestra`: captura si hay tablero valido.
- `Calibrar`: se habilita al alcanzar el minimo.
- `Eliminar ultima`: elimina la ultima muestra guardada.
- `Reiniciar`: borra muestras/resultados.

Atajo:

```text
Espacio = capturar muestra
```

OpenCV se carga automaticamente en Web Worker cuando la camara inicia.

### Metricas

- `Muestras`: cantidad de capturas validas.
- `Minimo`: actualmente `15`.
- `RMS`: error final de calibracion.

Interpretacion RMS:

- Verde: `RMS < 1px`, bueno.
- Amarillo: aceptable, revisar cobertura.
- Rojo: alto, conviene repetir muestras.

### Cobertura

Se agrego una seccion de ayuda para evitar capturar siempre la misma pose:

- Hint rotativo con proxima pose sugerida.
- Miniaturas de muestras validas capturadas.

Hints actuales:

- Centro del cuadro.
- Cerca de un borde.
- En una esquina.
- Inclinado.
- Mas cerca de la camara.
- Mas lejos y completo.

Limitacion actual:

- Las miniaturas son visuales, no permiten borrar una muestra puntual.
- `Eliminar ultima` sigue borrando solo la ultima muestra.

### Resultados

La presentacion de resultados fue mejorada:

- `Matriz K` se renderiza como grilla 3x3.
- Se etiquetan los valores importantes:
  - `fx`, `fy`: focales.
  - `cx`, `cy`: centro optico.
- `Coeficientes` se renderizan etiquetados:
  - `k1`, `k2`: distorsion radial.
  - `p1`, `p2`: distorsion tangencial.
  - `k3`: radial adicional.

Esto mantiene el mismo dato que devuelve `calibrateCamera`; solo mejora la lectura.

## Archivos principales y responsabilidades

### `index.html`

Define:

- Header.
- Stepper pasivo.
- Viewer/canvas.
- Switch antidistorsion.
- Badge de deteccion.
- Panel de controles.
- Metricas.
- Cobertura.
- Resultados.
- Registro.

IDs importantes:

```text
opencvStatus
cameraStatus
boardStatus
undistortToggle
detectionBadge
startCameraBtn
stopCameraBtn
captureBtn
calibrateBtn
undoBtn
resetBtn
sampleCount
minSamples
rmsValue
rmsQuality
cameraMatrix
distCoeffs
poseHint
sampleStrip
logOutput
```

### `styles.css`

Direccion visual:

- Inspirada en referencia tipo Httpster/Making Software.
- Fondo oscuro con grilla sutil.
- Paneles claros.
- Bordes finos.
- Tipografia `Manrope`.
- Acento naranja.
- Layout ancho con columna lateral grande.
- Registro abajo alineado con el ancho combinado de la grilla superior.

Variables clave:

```css
--page-max: 1880px;
--page-pad: 24px;
--accent: #ff5a1f;
```

### `js/main.js`

Responsable de:

- Estado UI.
- Camara.
- Render loop.
- Comunicacion con worker.
- Stepper dinamico.
- Feedback de deteccion.
- Thumbnails de muestras.
- Hints de cobertura.
- Render de matriz K y coeficientes etiquetados.
- Interpretacion cualitativa de RMS.

Estado principal:

```js
workerReady
running
busy
lastCorners
sampleCount
minSamples // 15
calibrationData
pendingCapturePreview
sampleThumbnails
```

Funciones relevantes:

```text
handleStartCamera
startOpenCvWorker
renderLoop
requestDetection
requestUndistortedFrame
handleCapture
handleCalibrate
handleWorkerMessage
updateButtons
updateFlow
updateDetectionFeedback
renderCameraMatrix
renderDistCoeffs
setRmsQuality
```

### `js/opencv-worker.js`

Responsable de vision artificial:

- Carga `../lib/opencv.js`.
- Usa `locateFile` para encontrar `../lib/opencv_js.wasm`.
- Valida funciones requeridas.
- Detecta esquinas del chessboard.
- Refina con `cornerSubPix` al capturar.
- Guarda `imagePoints` y `objectPoints`.
- Ejecuta `cv.calibrateCamera`.
- Ejecuta `cv.undistort`.

Constantes:

```js
const BOARD = { cols: 9, rows: 6, squareSize: 1 };
const MIN_SAMPLES = 15;
```

Funciones OpenCV requeridas:

```text
findChessboardCorners
findChessboardCornersSB
drawChessboardCorners
cornerSubPix
calibrateCamera
getOptimalNewCameraMatrix
undistort
initUndistortRectifyMap
```

### `js/opencv-capability-worker.js`

Worker de diagnostico para `capability-check.html`.

Tambien usa `locateFile` para el `.wasm`.

### `js/camera.js`

Abstraccion de camara:

- `startCamera(videoElement, constraints)`.
- `stopCamera(videoElement)`.
- Espera metadata/video listo.

### `capability-check.html`

Pagina de diagnostico para ver si el OpenCV.js cargado expone funciones necesarias.

## Build custom de OpenCV.js

Artefactos finales instalados:

```text
camera-calibrator-online/lib/opencv.js        139 KB
camera-calibrator-online/lib/opencv_js.wasm   4.0 MB
```

Smoke test runtime final:

```text
findChessboardCorners: function
findChessboardCornersSB: function
drawChessboardCorners: function
cornerSubPix: function
calibrateCamera: function
getOptimalNewCameraMatrix: function
undistort: function
initUndistortRectifyMap: function
```

Comando usado para smoke test:

```bash
cd "/Users/kevin.niedfeld/Documents/Personal/Universidad/Vision Artificial/TP Final/camera-calibrator-online"
node - <<'NODE'
const path = require('path');
global.Module = {
  locateFile: (file) => path.join(__dirname, 'lib', file),
  onRuntimeInitialized() {
    const cv = global.cv || global.Module;
    const names = ['findChessboardCorners','findChessboardCornersSB','drawChessboardCorners','cornerSubPix','calibrateCamera','getOptimalNewCameraMatrix','undistort','initUndistortRectifyMap'];
    for (const name of names) console.log(`${name}: ${typeof cv[name]}`);
  },
};
require('./lib/opencv.js');
NODE
```

### Problemas encontrados durante build

1. Builds publicas no servian:

- `docs.opencv.org`
- `@techstark/opencv-js`
- `@opencvjs/web`
- `opencv-js-wasm`

Problema: no exponian todas las funciones de `calib3d` necesarias.

2. Primer build custom fallaba porque `BUILD_LIST` no incluia `js`.

Sintoma:

```text
No rule to make target 'opencv.js'
```

Solucion:

```text
-DBUILD_LIST=core,imgproc,calib3d,features2d,flann,js
```

3. Link final fallaba por flag obsoleto de Emscripten moderno.

Sintoma:

```text
em++: error: --memory-init-file is no longer supported
```

Solucion aplicada:

Archivo:

```text
opencv-js-build/opencv/modules/js/CMakeLists.txt
```

Cambio:

```text
Quitar --memory-init-file 0 de EMSCRIPTEN_LINK_FLAGS
```

Luego se continuo desde `opencv/build_wasm`:

```bash
cd "/Users/kevin.niedfeld/Documents/Personal/Universidad/Vision Artificial/TP Final/opencv-js-build"
set -o pipefail
docker run --rm --workdir /code/build_wasm -v "$PWD/opencv":/code emscripten/emsdk:3.1.64 \
  bash -lc 'source /emsdk/emsdk_env.sh >/dev/null && emmake make -j2 opencv.js' \
  2>&1 | tee build_make_opencvjs_retry.log
```

Resultado:

```text
[ 97%] Built target opencv_js
[ 97%] Generating ../../bin/opencv.js
[ 97%] Built target opencv.js
```

## Archivos modificados en OpenCV source

Estos cambios viven fuera de `camera-calibrator-online`:

### `opencv/platforms/js/opencv_js.config.py`

Se agregaron bindings:

- `cornerSubPix` en `imgproc`.
- `findChessboardCorners` en `calib3d`.
- `findChessboardCornersSB` en `calib3d`.
- `drawChessboardCorners` en `calib3d`.
- `calibrateCamera` en `calib3d`.
- `getOptimalNewCameraMatrix` en `calib3d`.

### `opencv/modules/js/CMakeLists.txt`

Se quito:

```text
--memory-init-file 0
```

Motivo: Emscripten actual lo rechaza.

## Validaciones ejecutadas

Sintaxis JS:

```bash
node --check js/main.js
node --check js/opencv-worker.js
node --check js/opencv-capability-worker.js
node --check js/calibrator.js
```

Estado actual: OK.

Errores del editor:

```text
No errors found
```

Assets servidos localmente:

```text
http://localhost:8080/lib/opencv.js       -> 200 OK
http://localhost:8080/lib/opencv_js.wasm  -> 200 OK, application/wasm
```

Contenedores Docker:

```text
docker ps -> sin contenedores activos al final del build
```

## Comandos utiles

Levantar app:

```bash
cd "/Users/kevin.niedfeld/Documents/Personal/Universidad/Vision Artificial/TP Final/camera-calibrator-online"
npx --yes http-server . -p 8080 -c-1
```

Validar JS:

```bash
cd "/Users/kevin.niedfeld/Documents/Personal/Universidad/Vision Artificial/TP Final/camera-calibrator-online"
node --check js/main.js && node --check js/opencv-worker.js && node --check js/opencv-capability-worker.js && node --check js/calibrator.js
```

Verificar funciones OpenCV:

```bash
cd "/Users/kevin.niedfeld/Documents/Personal/Universidad/Vision Artificial/TP Final/camera-calibrator-online"
node - <<'NODE'
const path = require('path');
global.Module = {
  locateFile: (file) => path.join(__dirname, 'lib', file),
  onRuntimeInitialized() {
    const cv = global.cv || global.Module;
    const names = ['findChessboardCorners','findChessboardCornersSB','drawChessboardCorners','cornerSubPix','calibrateCamera','getOptimalNewCameraMatrix','undistort','initUndistortRectifyMap'];
    for (const name of names) console.log(`${name}: ${typeof cv[name]}`);
  },
};
require('./lib/opencv.js');
NODE
```

Monitorear build si se relanza:

```bash
cd "/Users/kevin.niedfeld/Documents/Personal/Universidad/Vision Artificial/TP Final/opencv-js-build"
grep -E '\[[[:space:]]*[0-9]+%\]|Built target|Linking|error:|FAILED|No rule' build_make_opencvjs_retry.log | tail -40
```

## Decisiones de UX importantes

- La app no muestra links de documentacion en la pantalla principal.
- Se removieron las secciones visibles `Patron` y `Entrega`.
- El stepper no es navegacion, es progreso pasivo.
- La antidistorsion solo se controla con el switch.
- El registro esta abajo, alineado al ancho de `Vista en vivo + Controles`.
- El minimo actual es 15 muestras para no hacer tediosa la demo.
- Hay miniaturas para orientar la variedad de poses.
- No se implemento borrar muestra puntual desde thumbnail; queda como posible mejora.

## Pendientes recomendados

Prioridad alta:

1. Iniciar camara y verificar que OpenCV cargue automaticamente.
2. Verificar `capability-check.html` con la build custom si OpenCV falla.
3. Comprobar que la UI no se congele durante la carga del worker.
4. Probar deteccion real con `assets/patterns/chessboard-9x6.svg`.
5. Capturar 15 muestras variadas.
6. Calibrar y verificar que se rendericen K, coeficientes y RMS.
7. Activar/desactivar antidistorsion.

Prioridad media:

1. Agregar modo presentacion que oculte logs o agrande video.
2. Permitir borrar una muestra puntual desde miniatura.
3. Agregar mapa de cobertura por regiones del frame.
5. Hacer una prueba en GitHub Pages o server HTTPS.

Prioridad baja:

1. Limpiar archivos heredados no usados.
2. Agregar screenshots al README.
3. Crear script simple de build/validacion.

## Riesgos conocidos

- La deteccion depende de luz, contraste y tablero completo.
- Mostrar el patron en un celular puede generar reflejos.
- La build custom depende de Emscripten/Docker; si se recompila, conservar el workaround de `--memory-init-file`.
- El archivo `.wasm` debe estar junto a `opencv.js` en `lib/` y los workers deben mantener `locateFile`.
- Si se sube a GitHub Pages, verificar que `.wasm` se sirva correctamente.

## Como retomar despues de compactar

1. Leer este archivo.
2. Levantar `npx --yes http-server . -p 8080 -c-1`.
3. Abrir `http://localhost:8080/capability-check.html`.
4. Confirmar funciones OpenCV.
5. Abrir `http://localhost:8080/`.
6. Probar flujo de camara y calibracion.

Si falla OpenCV en browser pero el smoke test Node funciona, revisar primero:

- Consola del navegador.
- Network tab para `lib/opencv.js` y `lib/opencv_js.wasm`.
- `locateFile` en `js/opencv-worker.js` y `js/opencv-capability-worker.js`.