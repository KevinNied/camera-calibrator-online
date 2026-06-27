# Checklist de pruebas

## Prueba 1 - Carga basica

- Abrir `http://localhost:8080/`.
- Verificar que la pagina renderice sin errores visibles.
- Verificar que el estado inicial sea `OpenCV: pendiente`.
- Verificar que `Iniciar camara` este habilitado.

Resultado esperado: la UI abre rapido y no congela el navegador.

## Prueba 2 - Camara

- Presionar `Iniciar camara`.
- Aceptar permisos del navegador.
- Verificar que el video se vea fluido.
- Verificar que OpenCV empiece a cargar automaticamente.
- Presionar `Detener` y volver a iniciar.

Resultado esperado: la camara se puede iniciar y detener sin recargar la pagina, y OpenCV carga sin boton manual.

## Prueba 3 - OpenCV custom

- Iniciar la camara.
- Verificar que el estado pase automaticamente a `OpenCV: listo`.
- Abrir `http://localhost:8080/capability-check.html` si falla.

Resultado esperado: la build expone las funciones requeridas y no reporta `findChessboardCorners` como faltante.

## Prueba 4 - Patron chessboard

- Abrir `assets/patterns/chessboard-9x6.svg` en celular o imprimirlo.
- Usar brillo alto si se muestra en pantalla.
- Evitar reflejos fuertes.
- Mostrar todo el patron completo a la camara.

Resultado esperado: el estado cambia a `Tablero: detectado` y aparecen puntos sobre la imagen.

## Prueba 5 - Captura de muestras

- Capturar al menos 15 muestras para prueba rapida.
- Para demo final, capturar entre 15 y 25.
- Variar posiciones: centro, bordes, esquinas, cerca, lejos e inclinado.

Resultado esperado: el contador de muestras aumenta solo cuando la deteccion es valida.

## Prueba 6 - Calibracion

- Presionar `Calibrar` cuando haya muestras suficientes.
- Verificar que aparezcan `RMS`, `Matriz K` y `Coeficientes`.
- Verificar que no haya valores `NaN`, `Infinity` o matrices vacias.

Resultado esperado: la app calcula parametros de calibracion visibles.

## Prueba 7 - Antidistorsion

- Activar el switch `Antidistorsion` despues de calibrar.
- Comparar contra objetos rectos: marco de puerta, borde de monitor, hoja cuadriculada.
- Alternar ON/OFF varias veces.

Resultado esperado: el feed cambia entre original y corregido sin recalibrar.

## Backup para defensa

- Tener el patron abierto en celular.
- Tener una version impresa si la pantalla genera reflejos.
- Tener abierta la pagina de capacidades para diagnostico rapido.