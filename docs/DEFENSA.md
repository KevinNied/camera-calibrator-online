# Guion corto para defensa

## Problema

Una camara real introduce distorsiones por la lente. El objetivo del proyecto es calibrarla desde el navegador y corregir el video en vivo.

## Enfoque

Usamos un patron chessboard de 9x6 esquinas internas. La app detecta las esquinas del tablero en varias poses y arma correspondencias entre puntos 3D conocidos del tablero y puntos 2D observados en la imagen.

Con esas correspondencias, OpenCV calcula:

- Matriz intrinseca `K`.
- Coeficientes de distorsion.
- Error RMS de calibracion.

## Pipeline

```text
webcam -> chessboard -> capturas -> calibrateCamera -> K/distCoeffs -> undistort
```

## Por que varias capturas

Una sola vista del tablero no alcanza para estimar bien la camara. Se necesitan poses variadas para cubrir distintas zonas de la imagen: centro, bordes, esquinas, diferentes distancias e inclinaciones.

## Resultado visible

Despues de calibrar, el switch `Antidistorsion` permite comparar:

- OFF: feed original.
- ON: feed corregido con los parametros calculados.

## Decisiones tecnicas

- App 100% frontend, compatible con GitHub Pages.
- OpenCV.js se ejecuta en Web Worker para no congelar la interfaz.
- OpenCV se carga automaticamente al iniciar la camara, sin paso manual extra.
- Se requiere una build custom de OpenCV.js con `calib3d`, porque las builds publicas no exponen todas las funciones necesarias.

## Limitaciones

- La deteccion depende de buena luz y contraste.
- El tablero debe verse completo y plano.
- La build custom de OpenCV.js es necesaria para exponer `findChessboardCorners` y `calibrateCamera`.

## Frase de cierre

El aporte principal fue llevar el calibrador del profesor, originalmente Python de escritorio, a una aplicacion web estatica que calibra la camara y aplica la correccion visual en vivo desde el navegador.