# Build custom de OpenCV.js

## Motivo

Las builds publicas de OpenCV.js probadas no exponen todas las funciones necesarias para calibracion con chessboard. La app requiere una build que exponga funciones de `calib3d` y `imgproc`.

## Funciones requeridas

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

## Source

El source de OpenCV 4.9.0 esta en:

```text
/Users/kevin.niedfeld/Documents/Personal/Universidad/Vision Artificial/TP Final/opencv-js-build/opencv
```

## Archivo editado

```text
opencv/platforms/js/opencv_js.config.py
```

Cambios esperados:

- En `imgproc`, agregar `cornerSubPix`.
- En `calib3d`, agregar:
  - `findChessboardCorners`
  - `findChessboardCornersSB`
  - `drawChessboardCorners`
  - `calibrateCamera`
  - `getOptimalNewCameraMatrix`

## Comando de build limitado

Desde:

```bash
cd "/Users/kevin.niedfeld/Documents/Personal/Universidad/Vision Artificial/TP Final/opencv-js-build"
```

Ejecutar:

```bash
docker run --rm --workdir /code -v "$PWD/opencv":/code emscripten/emsdk:3.1.64 \
  bash -lc 'python3 ./platforms/js/build_js.py build_wasm --build_wasm \
    --disable_single_file --clean_build_dir \
    --emscripten_dir /emsdk/upstream/emscripten \
    --cmake_option="-DBUILD_TESTS=OFF" \
    --cmake_option="-DBUILD_PERF_TESTS=OFF" \
    --cmake_option="-DBUILD_EXAMPLES=OFF" \
    --cmake_option="-DBUILD_LIST=core,imgproc,calib3d,features2d,flann,js"'
```

El modulo `js` es necesario para que CMake genere el target `opencv.js`.

Si Emscripten falla en el link con `--memory-init-file is no longer supported`, quitar `--memory-init-file 0` de:

```text
opencv/modules/js/CMakeLists.txt
```

Luego continuar desde el build ya configurado:

```bash
set -o pipefail
docker run --rm --workdir /code/build_wasm -v "$PWD/opencv":/code emscripten/emsdk:3.1.64 \
  bash -lc 'source /emsdk/emsdk_env.sh >/dev/null && emmake make -j2 opencv.js' \
  2>&1 | tee build_make_opencvjs.log
```

## Artefactos esperados

```text
opencv/build_wasm/bin/opencv.js
opencv/build_wasm/bin/opencv_js.wasm
```

Copiar ambos a:

```text
camera-calibrator-online/lib/
```

Build validada localmente:

```text
opencv.js: 139 KB
opencv_js.wasm: 4.0 MB
```

## Gotcha del Web Worker

Como la build genera `opencv.js` + `opencv_js.wasm`, el worker tiene que indicar donde esta el `.wasm` antes de hacer `importScripts`:

```js
self.Module = {
    locateFile: (path) => path.endsWith('.wasm') ? `../lib/${path}` : path,
    onRuntimeInitialized: finish,
};
```

## Verificacion

Abrir:

```text
http://localhost:8080/capability-check.html
```

Debe reportar `function` para:

```text
findChessboardCorners
cornerSubPix
calibrateCamera
undistort
```

Despues probar la app completa iniciando la camara; OpenCV debe cargarse automaticamente en el worker.