const BOARD = { cols: 9, rows: 6, squareSize: 1 };
const MIN_SAMPLES = 15;
const DETECTION_SCALES = [1, 1.5, 2];

let cvReady = false;
let boardSize = null;
let imagePoints = [];
let objectPoints = [];
let cameraMatrix = null;
let distCoeffs = null;
let rms = null;
let imageSize = null;
let objectPointTemplate = [];

self.onmessage = async (event) => {
    const message = event.data;

    try {
        switch (message.type) {
            case 'init':
                await initOpenCv();
                self.postMessage({ type: 'ready', minSamples: MIN_SAMPLES });
                break;
            case 'detect':
                ensureReady();
                detect(message.imageData);
                break;
            case 'capture':
                ensureReady();
                capture(message.imageData);
                break;
            case 'calibrate':
                ensureReady();
                calibrate(message.width, message.height);
                break;
            case 'previewCalibration':
                ensureReady();
                previewCalibration(message.width, message.height);
                break;
            case 'undistort':
                ensureReady();
                undistort(message.imageData);
                break;
            case 'undo':
                undoLastSample();
                break;
            case 'reset':
                resetSamples();
                self.postMessage({ type: 'sampleCount', count: imagePoints.length });
                break;
            case 'clearCalibration':
                clearCalibration();
                break;
            case 'importCalibration':
                ensureReady();
                importCalibration(message.data);
                break;
            default:
                break;
        }
    } catch (error) {
        self.postMessage({ type: 'error', message: error.message || String(error) });
    }
};

function initOpenCv() {
    if (cvReady) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            const loaded = self.cv && self.cv.Mat;
            if (loaded) {
                const missing = getMissingRequiredFunctions();
                reject(new Error(`OpenCV.js cargó, pero esta build no sirve para calibración: faltan ${missing.join(', ')}`));
                return;
            }
            reject(new Error('No se pudo inicializar OpenCV.js en worker'));
        }, 25000);

        const finish = () => {
            const cv = getOpenCvRuntime();
            if (!cv) return;
            self.cv = cv;
            const missing = getMissingRequiredFunctions();
            if (missing.length > 0) {
                clearTimeout(timeoutId);
                reject(new Error(`La build de OpenCV.js no incluye: ${missing.join(', ')}`));
                return;
            }

            clearTimeout(timeoutId);
            cvReady = true;
            boardSize = new self.cv.Size(BOARD.cols, BOARD.rows);
            objectPointTemplate = createObjectPointTemplate();
            resolve();
        };

        self.Module = {
            locateFile: (path) => (path.endsWith('.wasm') ? `../lib/${path}` : path),
            onRuntimeInitialized: finish,
            onAbort: (error) => reject(new Error(`OpenCV WASM abort: ${error}`)),
        };
        importScripts('../lib/opencv.js');

        if (self.cv && typeof self.cv.then === 'function') {
            self.cv.then(() => finish());
        }

        const startedAt = performance.now();
        const wait = () => {
            finish();
            if (cvReady) return;
            if (performance.now() - startedAt > 24000) {
                reject(new Error('No se pudo inicializar OpenCV.js en worker'));
                return;
            }
            setTimeout(wait, 80);
        };
        wait();
    });
}

function detect(imageData) {
    const result = findCorners(imageData, { refine: false, fast: true });
    if (!result.found) {
        self.postMessage({ type: 'detectResult', found: false, corners: [] });
        return;
    }

    const corners = cornersToPoints(result.corners);
    result.corners.delete();
    self.postMessage({ type: 'detectResult', found: true, corners });
}

function capture(imageData) {
    const result = findCorners(imageData, { refine: true, fast: false });
    if (!result.found) {
        self.postMessage({ type: 'captureResult', ok: false, count: imagePoints.length });
        return;
    }

    const objectMat = arrayToMat(
        BOARD.cols * BOARD.rows,
        1,
        self.cv.CV_32FC3,
        objectPointTemplate,
    );

    imagePoints.push(result.corners);
    objectPoints.push(objectMat);
    clearCalibration();
    self.postMessage({ type: 'captureResult', ok: true, count: imagePoints.length });
}

function calibrate(width, height) {
    if (imagePoints.length < MIN_SAMPLES) {
        throw new Error(`Se necesitan al menos ${MIN_SAMPLES} muestras válidas`);
    }

    const objectVector = new self.cv.MatVector();
    const imageVector = new self.cv.MatVector();
    const nextCameraMatrix = self.cv.Mat.eye(3, 3, self.cv.CV_64F);
    const nextDistCoeffs = new self.cv.Mat();
    const rvecs = new self.cv.MatVector();
    const tvecs = new self.cv.MatVector();

    try {
        objectPoints.forEach((mat) => objectVector.push_back(mat));
        imagePoints.forEach((mat) => imageVector.push_back(mat));

        const size = new self.cv.Size(width, height);
        const nextRms = self.cv.calibrateCamera(
            objectVector,
            imageVector,
            size,
            nextCameraMatrix,
            nextDistCoeffs,
            rvecs,
            tvecs,
            self.cv.CALIB_ZERO_TANGENT_DIST,
        );

        clearCalibration();
        cameraMatrix = nextCameraMatrix.clone();
        distCoeffs = nextDistCoeffs.clone();
        rms = nextRms;
        imageSize = { width, height };
        self.postMessage({ type: 'calibrationResult', data: getCalibrationData() });
    } finally {
        objectVector.delete();
        imageVector.delete();
        nextCameraMatrix.delete();
        nextDistCoeffs.delete();
        rvecs.delete();
        tvecs.delete();
    }
}

function previewCalibration(width, height) {
    if (imagePoints.length === 0) {
        self.postMessage({ type: 'rmsPreviewResult', ok: false, count: 0 });
        return;
    }

    const objectVector = new self.cv.MatVector();
    const imageVector = new self.cv.MatVector();
    const nextCameraMatrix = self.cv.Mat.eye(3, 3, self.cv.CV_64F);
    const nextDistCoeffs = new self.cv.Mat();
    const rvecs = new self.cv.MatVector();
    const tvecs = new self.cv.MatVector();

    try {
        objectPoints.forEach((mat) => objectVector.push_back(mat));
        imagePoints.forEach((mat) => imageVector.push_back(mat));

        const size = new self.cv.Size(width, height);
        const previewRms = self.cv.calibrateCamera(
            objectVector,
            imageVector,
            size,
            nextCameraMatrix,
            nextDistCoeffs,
            rvecs,
            tvecs,
            self.cv.CALIB_ZERO_TANGENT_DIST,
        );

        self.postMessage({ type: 'rmsPreviewResult', ok: true, rms: previewRms, count: imagePoints.length });
    } catch (error) {
        self.postMessage({ type: 'rmsPreviewResult', ok: false, count: imagePoints.length, message: error.message || String(error) });
    } finally {
        objectVector.delete();
        imageVector.delete();
        nextCameraMatrix.delete();
        nextDistCoeffs.delete();
        rvecs.delete();
        tvecs.delete();
    }
}

function undistort(imageData) {
    if (!cameraMatrix || !distCoeffs) return;

    const src = imageDataToMat(imageData);
    const dst = new self.cv.Mat();

    try {
        self.cv.undistort(src, dst, cameraMatrix, distCoeffs);
        const output = new ImageData(new Uint8ClampedArray(dst.data), dst.cols, dst.rows);
        self.postMessage({ type: 'undistorted', imageData: output }, [output.data.buffer]);
    } finally {
        src.delete();
        dst.delete();
    }
}

function findCorners(imageData, { refine, fast }) {
    const src = imageDataToMat(imageData);
    const gray = new self.cv.Mat();

    try {
        self.cv.cvtColor(src, gray, self.cv.COLOR_RGBA2GRAY);
        const result = findCornersMultiScale(gray, { fast });

        if (result.found && refine) {
            const criteria = new self.cv.TermCriteria(
                self.cv.TermCriteria_EPS + self.cv.TermCriteria_MAX_ITER,
                30,
                0.001,
            );
            self.cv.cornerSubPix(gray, result.corners, new self.cv.Size(11, 11), new self.cv.Size(-1, -1), criteria);
        }

        if (!result.found) {
            return { found: false, corners: null };
        }

        return { found: true, corners: result.corners };
    } finally {
        src.delete();
        gray.delete();
    }
}

function findCornersMultiScale(gray, { fast }) {
    const scales = fast ? DETECTION_SCALES.slice(0, 2) : DETECTION_SCALES;

    for (const scale of scales) {
        const scaledGray = scale === 1 ? gray : resizeGray(gray, scale);
        const corners = new self.cv.Mat();

        try {
            const found = findCornersInGray(scaledGray, corners, { fast });
            if (found) {
                if (scale !== 1) scaleCornerCoordinates(corners, 1 / scale);
                return { found: true, corners };
            }
        } finally {
            if (scaledGray !== gray) scaledGray.delete();
        }

        corners.delete();
    }

    return { found: false, corners: null };
}

function findCornersInGray(gray, corners, { fast }) {
    const flags = safeFlag(self.cv.CALIB_CB_ADAPTIVE_THRESH)
        + safeFlag(self.cv.CALIB_CB_NORMALIZE_IMAGE)
        + (fast ? safeFlag(self.cv.CALIB_CB_FAST_CHECK) : 0);

    if (self.cv.findChessboardCorners(gray, boardSize, corners, flags)) return true;

    if (typeof self.cv.findChessboardCornersSB !== 'function') return false;

    const sbFlags = safeFlag(self.cv.CALIB_CB_EXHAUSTIVE) + safeFlag(self.cv.CALIB_CB_ACCURACY);
    try {
        return self.cv.findChessboardCornersSB(gray, boardSize, corners, sbFlags);
    } catch (error) {
        return false;
    }
}

function resizeGray(gray, scale) {
    const scaledGray = new self.cv.Mat();
    const size = new self.cv.Size(Math.round(gray.cols * scale), Math.round(gray.rows * scale));

    try {
        self.cv.resize(gray, scaledGray, size, 0, 0, self.cv.INTER_LINEAR);
    } finally {
        if (typeof size.delete === 'function') size.delete();
    }

    return scaledGray;
}

function scaleCornerCoordinates(corners, factor) {
    const values = corners.data32F;
    for (let index = 0; index < values.length; index += 1) {
        values[index] *= factor;
    }
}

function undoLastSample() {
    const imagePoint = imagePoints.pop();
    const objectPoint = objectPoints.pop();
    if (imagePoint) imagePoint.delete();
    if (objectPoint) objectPoint.delete();
    clearCalibration();
    self.postMessage({ type: 'sampleCount', count: imagePoints.length });
}

function resetSamples() {
    imagePoints.forEach((mat) => mat.delete());
    objectPoints.forEach((mat) => mat.delete());
    imagePoints = [];
    objectPoints = [];
    clearCalibration();
}

function clearCalibration() {
    if (cameraMatrix) cameraMatrix.delete();
    if (distCoeffs) distCoeffs.delete();
    cameraMatrix = null;
    distCoeffs = null;
    rms = null;
    imageSize = null;
}

function importCalibration(data) {
    if (!data || !Array.isArray(data.cameraMatrix) || !Array.isArray(data.distCoeffs)) {
        throw new Error('JSON de calibración inválido');
    }

    const flatK = data.cameraMatrix.flat();
    if (flatK.length !== 9 || data.distCoeffs.length < 4) {
        throw new Error('La matriz K o los coeficientes no tienen el formato esperado');
    }

    clearCalibration();
    cameraMatrix = arrayToMat(3, 3, self.cv.CV_64F, flatK);
    distCoeffs = arrayToMat(data.distCoeffs.length, 1, self.cv.CV_64F, data.distCoeffs);
    rms = Number.isFinite(data.rms) ? data.rms : null;
    imageSize = data.imageSize || null;
    self.postMessage({ type: 'imported', data: getCalibrationData() });
}

function getCalibrationData() {
    return {
        boardSize: { cols: BOARD.cols, rows: BOARD.rows },
        imageSize,
        rms,
        cameraMatrix: readMatAsRows(cameraMatrix),
        distCoeffs: readMatAsArray(distCoeffs),
        sampleCount: imagePoints.length,
        createdAt: new Date().toISOString(),
    };
}

function createObjectPointTemplate() {
    const points = [];
    for (let row = 0; row < BOARD.rows; row += 1) {
        for (let col = 0; col < BOARD.cols; col += 1) {
            points.push(col * BOARD.squareSize, row * BOARD.squareSize, 0);
        }
    }
    return points;
}

function cornersToPoints(corners) {
    const values = corners.data32F;
    const points = [];
    for (let index = 0; index < values.length; index += 2) {
        points.push({ x: values[index], y: values[index + 1] });
    }
    return points;
}

function readMatAsRows(mat) {
    const values = readMatAsArray(mat);
    const rows = [];
    for (let row = 0; row < mat.rows; row += 1) {
        rows.push(values.slice(row * mat.cols, row * mat.cols + mat.cols));
    }
    return rows;
}

function readMatAsArray(mat) {
    const source = mat.data64F || mat.data32F || mat.data;
    return Array.from(source).slice(0, mat.rows * mat.cols);
}

function ensureReady() {
    if (!cvReady) throw new Error('OpenCV.js todavía no está listo');
}

function getMissingRequiredFunctions() {
    return [
        'findChessboardCorners',
        'cornerSubPix',
        'calibrateCamera',
        'undistort',
    ].filter((name) => typeof self.cv[name] !== 'function');
}

function getOpenCvRuntime() {
    const candidates = [self.cv, self.Module];
    return candidates.find((candidate) => candidate && typeof candidate.then !== 'function' && candidate.Mat) || null;
}

function imageDataToMat(imageData) {
    const mat = new self.cv.Mat(imageData.height, imageData.width, self.cv.CV_8UC4);
    mat.data.set(imageData.data);
    return mat;
}

function arrayToMat(rows, cols, type, values) {
    const mat = new self.cv.Mat(rows, cols, type);
    const target = type === self.cv.CV_64F ? mat.data64F : mat.data32F || mat.data;
    target.set(values);
    return mat;
}

function safeFlag(value) {
    return Number.isFinite(value) ? value : 0;
}