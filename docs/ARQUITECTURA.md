# Arquitectura y conceptos

## Objetivo

Construir un calibrador de camara online, puro frontend y hosteable en GitHub Pages, basado conceptualmente en el `calibrate.py` del profesor.

El flujo esperado es:

```text
camara -> deteccion de chessboard -> capturas -> calibracion -> antidistorsion -> switch ON/OFF
```

## Concepto de calibracion

Una camara real no proyecta la imagen como una camara pinhole ideal. La lente introduce distorsiones, especialmente cerca de los bordes. La calibracion estima dos grupos de parametros:

- Matriz intrinseca `K`, con `fx`, `fy`, `cx`, `cy`.
- Coeficientes de distorsion, por ejemplo `k1`, `k2`, `p1`, `p2`, `k3`.

La matriz intrinseca tiene la forma:

```text
[ fx   0  cx ]
[  0  fy  cy ]
[  0   0   1 ]
```

Con esos datos, OpenCV puede corregir cada frame usando `undistort` o mapas de remapeo.

## Patron usado

El proyecto usa un chessboard de `9x6` esquinas internas, igual que el script Python original.

Importante: `9x6` indica esquinas internas detectables, no cantidad de cuadrados.

## Modulos de la app

- `index.html`: estructura de la interfaz.
- `styles.css`: layout visual responsive.
- `js/main.js`: camara, UI, render de video y comunicacion con el worker.
- `js/opencv-worker.js`: carga OpenCV.js, detecta tablero, captura muestras, calibra y antidistorsiona.
- `js/camera.js`: acceso a `getUserMedia`.
- `lib/opencv.js`: build custom de OpenCV.js.
- `lib/opencv_js.wasm`: binario WASM generado por la build custom.

## Por que Web Worker

OpenCV.js es pesado. Si se carga y procesa en el hilo principal, Chrome puede congelar la pagina. Por eso la app mantiene la camara y la UI en `main.js`, pero manda las operaciones de vision artificial a `opencv-worker.js`.

## Funciones requeridas de OpenCV.js

La build debe exponer estas funciones en runtime:

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

Las builds publicas probadas no exponen todo lo necesario, por eso se compila una build custom con `calib3d` habilitado.

## Datos de calibracion mostrados

Al terminar la calibracion, la app muestra:

- `boardSize`
- `imageSize`
- `rms`
- `cameraMatrix`
- `distCoeffs`
- `sampleCount`
- `createdAt`

En la UI principal se renderizan la matriz intrinseca, los coeficientes de distorsion y el RMS.