# Camera Calibrator Online

Aplicacion web estatica para calibrar una camara desde el navegador con OpenCV.js. Esta pensada para el TP final de Vision Artificial y para poder publicarse tal cual en GitHub Pages: no usa backend, no usa Python en runtime y no requiere un proceso de build frontend.

La app toma como referencia conceptual el flujo del `calibrate.py` del profesor: detectar un tablero chessboard, acumular muestras desde distintas poses, calcular parametros intrinsecos y usar esos parametros para mostrar el video corregido.

## Estado actual

- Corre desde la raiz local: `http://localhost:8080/`.
- Usa una build custom de OpenCV.js incluida en `lib/opencv.js` y `lib/opencv_js.wasm`.
- Carga OpenCV.js dentro de `js/opencv-worker.js` para que la interfaz no se congele.
- Abre la camara con `getUserMedia`.
- Detecta un chessboard de `9x6` esquinas internas.
- Dibuja puntos y lineas de colores sobre el tablero detectado.
- Captura muestras validas y refina esquinas con `cornerSubPix`.
- Calibra con `calibrateCamera`.
- Muestra matriz intrinseca, coeficientes de distorsion y RMS.
- Permite activar/desactivar la antidistorsion en vivo con un switch.
- Requiere 15 muestras minimas para habilitar la calibracion.

## Uso local

Desde esta carpeta:

```bash
npx --yes http-server . -p 8080 -c-1
```

Abrir siempre la app desde:

```text
http://localhost:8080/
```

No se usan URLs versionadas con query strings para la app principal. La ultima version debe estar expuesta directamente en la raiz.

El flag `-c-1` deshabilita cache del servidor local para que el navegador reciba los cambios recientes durante el desarrollo.

El acceso a camara funciona en `localhost` o en sitios HTTPS, como GitHub Pages.

## Flujo recomendado de prueba

1. Abrir `http://localhost:8080/`.
2. Presionar `Iniciar camara`.
3. Aceptar permisos del navegador.
4. Esperar el estado `OpenCV: listo`; la carga ocurre automaticamente en el worker.
5. Mostrar el chessboard completo con buena luz.
6. Esperar a que el badge indique `Tablero: detectado` y se vean los puntos de colores.
7. Presionar `Capturar muestra` sin mover el tablero.
8. Repetir hasta llegar a 15 muestras con poses variadas.
9. Presionar `Calibrar`.
10. Activar el switch `Antidistorsion` para comparar feed original vs feed corregido.

## Tablero esperado

La configuracion actual espera `9x6` esquinas internas, no `9x6` cuadrados. El patron incluido esta en:

```text
assets/patterns/chessboard-9x6.svg
```

Para facilitar la deteccion:

- Usar buena luz y evitar reflejos.
- Mantener todo el tablero dentro del cuadro.
- Empezar con una pose frontal antes de inclinarlo.
- Hacer que el tablero ocupe aproximadamente entre un tercio y la mitad del video.
- Variar las capturas: centro, bordes, esquinas, cerca, lejos e inclinado.

## Pantallas y archivos principales

- `index.html`: estructura de la interfaz principal.
- `styles.css`: layout, sistema visual, paneles, estados y responsive.
- `js/main.js`: estado de UI, camara, render loop, overlay de deteccion, muestras, resultados y comunicacion con el worker.
- `js/camera.js`: helpers para iniciar y detener `getUserMedia`.
- `js/opencv-worker.js`: carga OpenCV.js y ejecuta deteccion, captura, calibracion y antidistorsion.
- `js/opencv-capability-worker.js`: worker usado por la pagina de diagnostico.
- `capability-check.html`: pagina para verificar que el runtime OpenCV exponga las funciones necesarias.
- `lib/opencv.js`: build custom de OpenCV.js.
- `lib/opencv_js.wasm`: modulo WASM de OpenCV.

## Diagnostico de OpenCV

Si OpenCV no pasa a `OpenCV: listo` despues de iniciar la camara, abrir:

```text
http://localhost:8080/capability-check.html
```

Las funciones importantes deben aparecer como `function`:

- `findChessboardCorners`
- `findChessboardCornersSB`
- `cornerSubPix`
- `calibrateCamera`
- `undistort`

`version: no build info` no bloquea la app si esas funciones aparecen como `function`.

## Build custom incluida

Las builds publicas probadas no exponian todas las APIs de `calib3d` necesarias para este TP. Por eso el proyecto incluye una build custom de OpenCV.js.

Artefactos instalados:

```text
lib/opencv.js
lib/opencv_js.wasm
```

Detalles del build y como reconstruirlo estan en:

```text
docs/BUILD_OPENCV.md
```

## Validacion rapida

Validar sintaxis de los scripts principales:

```bash
node --check js/main.js
node --check js/opencv-worker.js
node --check js/opencv-capability-worker.js
node --check js/calibrator.js
```

Verificar que los assets se sirvan localmente:

```bash
curl -I http://localhost:8080/
curl -I http://localhost:8080/lib/opencv.js
curl -I http://localhost:8080/lib/opencv_js.wasm
```

## Documentacion del proyecto

- [Arquitectura y conceptos](docs/ARQUITECTURA.md)
- [Checklist de pruebas](docs/PRUEBAS.md)
- [Build custom de OpenCV.js](docs/BUILD_OPENCV.md)
- [Guion corto para defensa](docs/DEFENSA.md)
- [Estado completo del proyecto](docs/ESTADO_PROYECTO.md)

## Limitaciones conocidas

- La deteccion depende mucho de luz, contraste, foco y tablero completo.
- La captura puede fallar si el tablero se mueve entre la deteccion visual y el click de captura.
- La antidistorsion en vivo trabaja mejor a resoluciones moderadas, por ejemplo `640x480`.
- GitHub Pages debe servir correctamente el archivo `.wasm` junto a `opencv.js`.