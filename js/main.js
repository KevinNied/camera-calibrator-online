import { startCamera, stopCamera } from './camera.js';

const BOARD = { cols: 9, rows: 6 };
const OVERLAY_COLORS = ['#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444'];

const refs = {
    video: document.getElementById('cameraVideo'),
    canvasShell: document.querySelector('.canvas-shell'),
    detectionBadge: document.getElementById('detectionBadge'),
    flowSteps: Array.from(document.querySelectorAll('.flow-step')),
    workCanvas: document.getElementById('workCanvas'),
    outputCanvas: document.getElementById('outputCanvas'),
    opencvStatus: document.getElementById('opencvStatus'),
    cameraStatus: document.getElementById('cameraStatus'),
    boardStatus: document.getElementById('boardStatus'),
    viewerHint: document.getElementById('viewerHint'),
    startCameraBtn: document.getElementById('startCameraBtn'),
    stopCameraBtn: document.getElementById('stopCameraBtn'),
    captureBtn: document.getElementById('captureBtn'),
    calibrateBtn: document.getElementById('calibrateBtn'),
    undoBtn: document.getElementById('undoBtn'),
    resetBtn: document.getElementById('resetBtn'),
    undistortToggle: document.getElementById('undistortToggle'),
    sampleCount: document.getElementById('sampleCount'),
    minSamples: document.getElementById('minSamples'),
    rmsCard: document.getElementById('rmsCard'),
    rmsValue: document.getElementById('rmsValue'),
    rmsQuality: document.getElementById('rmsQuality'),
    cameraMatrix: document.getElementById('cameraMatrix'),
    distCoeffs: document.getElementById('distCoeffs'),
    poseHint: document.getElementById('poseHint'),
    sampleStrip: document.getElementById('sampleStrip'),
    logOutput: document.getElementById('logOutput'),
};

const POSE_HINTS = [
    'Proxima pose: centro del cuadro.',
    'Proxima pose: tablero cerca de un borde.',
    'Proxima pose: tablero en una esquina.',
    'Proxima pose: tablero inclinado.',
    'Proxima pose: tablero mas cerca de la camara.',
    'Proxima pose: tablero mas lejos y completo.',
];

const state = {
    worker: null,
    workerReady: false,
    workerLoading: false,
    running: false,
    busy: false,
    animationId: null,
    lastDetectionTime: 0,
    detectionIntervalMs: 450,
    lastUndistortTime: 0,
    undistortIntervalMs: 90,
    pendingDetect: false,
    pendingUndistort: false,
    lastCorners: null,
    sampleCount: 0,
    minSamples: 15,
    calibrationData: null,
    pendingCapturePreview: null,
    sampleThumbnails: [],
};

const workCtx = refs.workCanvas.getContext('2d', { willReadFrequently: true });
const outputCtx = refs.outputCanvas.getContext('2d', { willReadFrequently: true });

boot();

function boot() {
    bindEvents();
    refs.startCameraBtn.disabled = false;
    refs.minSamples.textContent = String(state.minSamples);
    setStatus(refs.opencvStatus, 'OpenCV: pendiente', 'muted');
    setRmsQuality(null);
    updateDetectionFeedback('idle');
    updateCoverageUi();
    log('Aplicacion lista. Inicia la camara; OpenCV se carga automaticamente en un worker.');
    updateButtons();
}

function bindEvents() {
    refs.startCameraBtn.addEventListener('click', handleStartCamera);
    refs.stopCameraBtn.addEventListener('click', handleStopCamera);
    refs.captureBtn.addEventListener('click', handleCapture);
    refs.calibrateBtn.addEventListener('click', handleCalibrate);
    refs.undoBtn.addEventListener('click', handleUndo);
    refs.resetBtn.addEventListener('click', handleReset);
    refs.undistortToggle.addEventListener('change', () => {
        const label = refs.undistortToggle.checked ? 'Antidistorsion activada' : 'Antidistorsion desactivada';
        refs.viewerHint.textContent = label;
        log(label);
        updateFlow();
    });

    window.addEventListener('keydown', (event) => {
        if (event.code === 'Space' && !refs.captureBtn.disabled) {
            event.preventDefault();
            handleCapture();
        }
    });
}

async function handleStartCamera() {
    if (state.running) return;
    setBusy(true);
    log('Iniciando camara...');
    let cameraStarted = false;

    try {
        await startCamera(refs.video);
        configureCanvas(refs.video.videoWidth || 640, refs.video.videoHeight || 480);
        state.running = true;
        cameraStarted = true;
        refs.canvasShell.classList.add('is-live');
        updateDetectionFeedback(state.workerReady ? 'searching' : 'idle');
        setStatus(refs.cameraStatus, `Camara: ${refs.outputCanvas.width}x${refs.outputCanvas.height}`, 'ok');
        refs.viewerHint.textContent = state.workerReady
            ? 'Mostra el chessboard y captura varias posiciones.'
            : 'Camara activa. Cargando OpenCV para detectar el tablero.';
        log(`Camara iniciada: ${refs.outputCanvas.width} x ${refs.outputCanvas.height}`);
        state.animationId = requestAnimationFrame(renderLoop);
    } catch (error) {
        setStatus(refs.cameraStatus, 'Camara: error', 'danger');
        log(error.message);
    } finally {
        setBusy(false);
        updateButtons();
        if (cameraStarted) startOpenCvWorker();
    }
}

function handleStopCamera() {
    state.running = false;
    if (state.animationId) cancelAnimationFrame(state.animationId);
    state.animationId = null;
    stopCamera(refs.video);
    state.pendingDetect = false;
    state.pendingUndistort = false;
    state.lastCorners = null;
    refs.canvasShell.classList.remove('is-live');
    updateDetectionFeedback('idle');
    setStatus(refs.cameraStatus, 'Camara: detenida', 'muted');
    setStatus(refs.boardStatus, 'Tablero: sin detectar', 'muted');
    refs.viewerHint.textContent = 'Inicia la camara y mostra el chessboard 9x6.';
    clearCanvas();
    log('Camara detenida.');
    updateButtons();
}

function startOpenCvWorker() {
    if (state.workerReady || state.workerLoading) return;
    state.workerLoading = true;
    setStatus(refs.opencvStatus, 'OpenCV: cargando worker', 'warn');
    updateDetectionFeedback(state.running ? 'searching' : 'idle');
    log('Cargando OpenCV.js automaticamente en Web Worker... La interfaz deberia seguir respondiendo.');
    updateButtons();

    state.worker = new Worker('js/opencv-worker.js');
    state.worker.onmessage = handleWorkerMessage;
    state.worker.onerror = (event) => {
        state.workerLoading = false;
        state.worker = null;
        setStatus(refs.opencvStatus, 'OpenCV: error', 'danger');
        log(event.message || 'Error en el worker de OpenCV');
        updateButtons();
    };
    state.worker.postMessage({ type: 'init' });
}

function renderLoop(timestamp) {
    if (!state.running) return;

    if (refs.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        workCtx.drawImage(refs.video, 0, 0, refs.workCanvas.width, refs.workCanvas.height);

        if (refs.undistortToggle.checked && state.workerReady && state.calibrationData) {
            requestUndistortedFrame(timestamp);
        } else {
            outputCtx.drawImage(refs.workCanvas, 0, 0);
            if (state.lastCorners) drawCorners(state.lastCorners);
            requestDetection(timestamp);
        }
    }

    state.animationId = requestAnimationFrame(renderLoop);
}

function requestDetection(timestamp) {
    if (!state.workerReady || state.pendingDetect || timestamp - state.lastDetectionTime < state.detectionIntervalMs) return;
    state.lastDetectionTime = timestamp;
    state.pendingDetect = true;
    const imageData = workCtx.getImageData(0, 0, refs.workCanvas.width, refs.workCanvas.height);
    state.worker.postMessage({ type: 'detect', imageData }, [imageData.data.buffer]);
}

function requestUndistortedFrame(timestamp) {
    if (state.pendingUndistort || timestamp - state.lastUndistortTime < state.undistortIntervalMs) return;
    state.lastUndistortTime = timestamp;
    state.pendingUndistort = true;
    const imageData = workCtx.getImageData(0, 0, refs.workCanvas.width, refs.workCanvas.height);
    state.worker.postMessage({ type: 'undistort', imageData }, [imageData.data.buffer]);
}

function handleCapture() {
    if (!state.running || !state.workerReady || state.busy) return;
    setBusy(true);
    log('Capturando muestra...');
    state.pendingCapturePreview = createSampleThumbnail();
    const imageData = workCtx.getImageData(0, 0, refs.workCanvas.width, refs.workCanvas.height);
    state.worker.postMessage({ type: 'capture', imageData }, [imageData.data.buffer]);
}

function handleCalibrate() {
    if (!state.workerReady || state.sampleCount < state.minSamples || state.busy) return;
    setBusy(true);
    log('Calibrando camara en worker...');
    state.worker.postMessage({ type: 'calibrate', width: refs.outputCanvas.width, height: refs.outputCanvas.height });
}

function handleUndo() {
    if (!state.workerReady || state.busy) return;
    state.worker.postMessage({ type: 'undo' });
}

function handleReset() {
    if (!state.workerReady || state.busy) return;
    state.worker.postMessage({ type: 'reset' });
}

function handleWorkerMessage(event) {
    const message = event.data;

    switch (message.type) {
        case 'ready':
            state.workerReady = true;
            state.workerLoading = false;
            state.minSamples = message.minSamples;
            refs.minSamples.textContent = String(state.minSamples);
            setStatus(refs.opencvStatus, 'OpenCV: listo', 'ok');
            updateDetectionFeedback(state.running ? 'searching' : 'idle');
            refs.viewerHint.textContent = state.running
                ? 'Mostra el chessboard y captura varias posiciones.'
                : 'OpenCV listo. Inicia la camara para comenzar.';
            log('OpenCV.js listo en worker.');
            updateButtons();
            break;
        case 'detectResult':
            state.pendingDetect = false;
            state.lastCorners = message.found ? message.corners : null;
            setStatus(refs.boardStatus, message.found ? 'Tablero: detectado' : 'Tablero: buscando', message.found ? 'ok' : 'warn');
            updateDetectionFeedback(message.found ? 'detected' : 'searching');
            break;
        case 'captureResult':
            setBusy(false);
            state.sampleCount = message.count;
            clearResults(false);
            updateSampleUi();
            if (message.ok) {
                addSampleThumbnail(state.pendingCapturePreview, message.count);
                setStatus(refs.boardStatus, 'Tablero: muestra guardada', 'ok');
                log(`Muestra ${message.count} capturada.`);
            } else {
                state.pendingCapturePreview = null;
                setStatus(refs.boardStatus, 'Tablero: no valido', 'warn');
                log('No se detecto el tablero. Reintenta con mejor luz y todo el patron visible.');
            }
            updateButtons();
            break;
        case 'calibrationResult':
            setBusy(false);
            state.calibrationData = message.data;
            renderCalibration(message.data);
            refs.undistortToggle.disabled = false;
            refs.viewerHint.textContent = 'Activa el switch para ver el feed antidistorsionado.';
            setStatus(refs.boardStatus, 'Calibracion lista', 'ok');
            log(`Calibracion terminada. RMS: ${formatNumber(message.data.rms)}`);
            updateButtons();
            break;
        case 'undistorted':
            state.pendingUndistort = false;
            outputCtx.putImageData(message.imageData, 0, 0);
            break;
        case 'sampleCount':
            state.sampleCount = message.count;
            clearResults(false);
            syncSampleThumbnails(message.count);
            updateSampleUi();
            updateButtons();
            log(`Muestras actuales: ${message.count}.`);
            break;
        case 'imported':
            state.calibrationData = message.data;
            renderCalibration(message.data);
            refs.undistortToggle.disabled = false;
            setStatus(refs.boardStatus, 'Calibracion importada', 'ok');
            log('Calibracion importada. Ya podes activar antidistorsion.');
            updateButtons();
            break;
        case 'error':
            state.pendingDetect = false;
            state.pendingUndistort = false;
            state.workerLoading = false;
            setBusy(false);
            setStatus(refs.opencvStatus, 'OpenCV: error', 'danger');
            updateDetectionFeedback('error');
            log(message.message);
            updateButtons();
            break;
        default:
            break;
    }
}

function configureCanvas(width, height) {
    refs.workCanvas.width = width;
    refs.workCanvas.height = height;
    refs.outputCanvas.width = width;
    refs.outputCanvas.height = height;
}

function clearCanvas() {
    outputCtx.clearRect(0, 0, refs.outputCanvas.width, refs.outputCanvas.height);
}

function drawCorners(corners) {
    const isFullBoard = corners.length === BOARD.cols * BOARD.rows;

    outputCtx.save();
    outputCtx.lineCap = 'round';
    outputCtx.lineJoin = 'round';
    outputCtx.shadowColor = 'rgba(0, 0, 0, 0.38)';
    outputCtx.shadowBlur = 5;

    if (isFullBoard) {
        for (let row = 0; row < BOARD.rows; row += 1) {
            drawCornerPath(getBoardRow(corners, row), OVERLAY_COLORS[row] || OVERLAY_COLORS.at(-1));
        }

        for (let col = 0; col < BOARD.cols; col += 1) {
            const columnColor = OVERLAY_COLORS[Math.min(Math.floor((col / (BOARD.cols - 1)) * (OVERLAY_COLORS.length - 1)), OVERLAY_COLORS.length - 1)];
            drawCornerPath(getBoardColumn(corners, col), columnColor, 2.25);
        }
    } else {
        drawCornerPath(corners, '#f59e0b');
    }

    corners.forEach((point, index) => {
        const row = isFullBoard ? Math.floor(index / BOARD.cols) : 0;
        const fillColor = OVERLAY_COLORS[row] || '#f59e0b';
        outputCtx.beginPath();
        outputCtx.fillStyle = fillColor;
        outputCtx.strokeStyle = '#1f2937';
        outputCtx.lineWidth = 1.4;
        outputCtx.arc(point.x, point.y, 4.2, 0, Math.PI * 2);
        outputCtx.fill();
        outputCtx.stroke();
    });
    outputCtx.restore();
}

function drawCornerPath(points, color, lineWidth = 3) {
    if (points.length < 2) return;

    outputCtx.beginPath();
    outputCtx.strokeStyle = color;
    outputCtx.lineWidth = lineWidth;
    outputCtx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => outputCtx.lineTo(point.x, point.y));
    outputCtx.stroke();
}

function getBoardRow(corners, row) {
    const start = row * BOARD.cols;
    return corners.slice(start, start + BOARD.cols);
}

function getBoardColumn(corners, col) {
    const column = [];
    for (let row = 0; row < BOARD.rows; row += 1) {
        column.push(corners[row * BOARD.cols + col]);
    }
    return column;
}

function updateButtons() {
    const hasSamples = state.sampleCount > 0;
    const enoughSamples = state.sampleCount >= state.minSamples;
    refs.startCameraBtn.disabled = state.running || state.busy;
    refs.stopCameraBtn.disabled = !state.running || state.busy;
    refs.captureBtn.disabled = !state.running || !state.workerReady || state.busy;
    refs.calibrateBtn.disabled = !state.workerReady || !enoughSamples || state.busy;
    refs.calibrateBtn.classList.toggle('is-ready', state.workerReady && enoughSamples && !state.calibrationData && !state.busy);
    refs.undoBtn.disabled = !state.workerReady || !hasSamples || state.busy;
    refs.resetBtn.disabled = !state.workerReady || !hasSamples || state.busy;
    updateFlow();
}

function updateSampleUi() {
    refs.sampleCount.textContent = String(state.sampleCount);
    updateCoverageUi();
}

function clearResults(clearWorkerCalibration = true) {
    refs.rmsValue.textContent = '-';
    refs.cameraMatrix.className = 'matrix-box empty';
    refs.cameraMatrix.textContent = 'Sin calibracion';
    refs.distCoeffs.className = 'coeff-grid empty';
    refs.distCoeffs.textContent = 'Sin calibracion';
    setRmsQuality(null);
    refs.undistortToggle.checked = false;
    refs.undistortToggle.disabled = true;
    state.calibrationData = null;
    if (clearWorkerCalibration && state.workerReady) state.worker.postMessage({ type: 'clearCalibration' });
    updateFlow();
}

function renderCalibration(data) {
    refs.rmsValue.textContent = formatNumber(data.rms);
    setRmsQuality(data.rms);
    renderCameraMatrix(data.cameraMatrix);
    renderDistCoeffs(data.distCoeffs);
}

function setBusy(value) {
    state.busy = value;
    updateButtons();
}

function setStatus(element, text, tone) {
    element.textContent = text;
    element.className = 'status-pill';
    if (tone && tone !== 'ok') element.classList.add(tone);
}

function updateFlow() {
    const enoughSamples = state.sampleCount >= state.minSamples;
    refs.flowSteps.forEach((step) => {
        const status = getFlowStepStatus(step.dataset.step, enoughSamples);
        step.className = `flow-step ${status.tone}`;
        step.querySelector('small').textContent = status.detail;
        if (status.tone === 'active') {
            step.setAttribute('aria-current', 'step');
        } else {
            step.removeAttribute('aria-current');
        }
    });
}

function getFlowStepStatus(stepName, enoughSamples) {
    if (stepName === 'camera') {
        return {
            tone: state.running ? 'active' : 'unlocked',
            detail: state.running ? 'Camara activa' : 'Esperando inicio',
        };
    }

    if (stepName === 'board') {
        const detail = `${state.sampleCount}/${state.minSamples} muestras`;
        if (state.calibrationData || enoughSamples) return { tone: 'completed', detail };
        if (state.running && state.workerReady) return { tone: 'active', detail };
        if (state.workerReady) return { tone: 'unlocked', detail };
        return { tone: 'locked', detail };
    }

    if (stepName === 'calibration') {
        if (state.calibrationData) return { tone: 'completed', detail: `RMS ${formatNumber(state.calibrationData.rms)}` };
        if (enoughSamples) return { tone: 'active', detail: 'Lista para calibrar' };
        return { tone: 'locked', detail: 'Esperando muestras' };
    }

    if (state.calibrationData) {
        return {
            tone: refs.undistortToggle.checked ? 'active' : 'unlocked',
            detail: refs.undistortToggle.checked ? 'Aplicando correccion' : 'Switch disponible',
        };
    }
    return { tone: 'locked', detail: 'Bloqueada' };
}

function updateDetectionFeedback(status) {
    const labels = {
        idle: state.running ? 'Tablero: sin OpenCV' : 'Tablero: esperando',
        searching: 'Tablero: buscando',
        detected: 'Tablero: detectado',
        error: 'Tablero: sin lectura',
    };
    refs.canvasShell.classList.remove('detect-idle', 'detect-searching', 'detect-detected', 'detect-error');
    refs.canvasShell.classList.add(`detect-${status}`);
    refs.detectionBadge.textContent = labels[status] || labels.idle;
}

function createSampleThumbnail() {
    if (!refs.workCanvas.width || !refs.workCanvas.height) return null;
    const thumbnail = document.createElement('canvas');
    thumbnail.width = 120;
    thumbnail.height = 80;
    const thumbnailContext = thumbnail.getContext('2d');
    thumbnailContext.drawImage(refs.workCanvas, 0, 0, thumbnail.width, thumbnail.height);
    return thumbnail.toDataURL('image/jpeg', 0.72);
}

function addSampleThumbnail(dataUrl, count) {
    state.pendingCapturePreview = null;
    if (!dataUrl) return;
    state.sampleThumbnails.push({ count, dataUrl });
    renderSampleThumbnails();
}

function syncSampleThumbnails(count) {
    state.sampleThumbnails = state.sampleThumbnails.slice(0, count);
    renderSampleThumbnails();
}

function renderSampleThumbnails() {
    refs.sampleStrip.textContent = '';
    if (state.sampleThumbnails.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'empty-strip';
        empty.textContent = 'Las miniaturas apareceran al capturar muestras validas.';
        refs.sampleStrip.append(empty);
        return;
    }

    state.sampleThumbnails.forEach((sample, index) => {
        const item = document.createElement('div');
        item.className = 'sample-thumb';
        const image = document.createElement('img');
        image.src = sample.dataUrl;
        image.alt = `Muestra ${index + 1}`;
        const label = document.createElement('span');
        label.textContent = String(index + 1);
        item.append(image, label);
        refs.sampleStrip.append(item);
    });
}

function updateCoverageUi() {
    if (state.sampleCount >= state.minSamples) {
        refs.poseHint.textContent = 'Cobertura minima lista. Calibra o suma poses en zonas nuevas para mejorar el resultado.';
        return;
    }
    const nextHint = POSE_HINTS[state.sampleCount % POSE_HINTS.length];
    const missing = state.minSamples - state.sampleCount;
    refs.poseHint.textContent = `${nextHint} Faltan ${missing} muestras para calibrar.`;
}

function renderCameraMatrix(matrix) {
    const labels = [
        ['fx', '', 'cx'],
        ['', 'fy', 'cy'],
        ['', '', '1'],
    ];
    refs.cameraMatrix.className = 'matrix-box';
    refs.cameraMatrix.textContent = '';
    const grid = document.createElement('div');
    grid.className = 'matrix-grid';
    matrix.forEach((row, rowIndex) => {
        row.forEach((value, colIndex) => {
            const cell = document.createElement('div');
            cell.className = labels[rowIndex][colIndex] ? 'matrix-cell labeled' : 'matrix-cell';
            const label = document.createElement('span');
            label.textContent = labels[rowIndex][colIndex] || '0';
            const number = document.createElement('strong');
            number.textContent = formatNumber(value);
            cell.append(label, number);
            grid.append(cell);
        });
    });
    refs.cameraMatrix.append(grid);
}

function renderDistCoeffs(coeffs) {
    const labels = ['k1', 'k2', 'p1', 'p2', 'k3'];
    refs.distCoeffs.className = 'coeff-grid';
    refs.distCoeffs.textContent = '';
    coeffs.forEach((value, index) => {
        const item = document.createElement('div');
        item.className = 'coeff-item';
        const label = document.createElement('span');
        label.textContent = labels[index] || `c${index + 1}`;
        const number = document.createElement('strong');
        number.textContent = formatNumber(value);
        item.append(label, number);
        refs.distCoeffs.append(item);
    });
}

function setRmsQuality(value) {
    refs.rmsCard.classList.remove('rms-good', 'rms-warn', 'rms-bad');
    if (!Number.isFinite(value)) {
        refs.rmsQuality.textContent = 'Sin calibrar';
        return;
    }
    if (value < 1) {
        refs.rmsCard.classList.add('rms-good');
        refs.rmsQuality.textContent = 'Bueno: < 1 px';
        return;
    }
    if (value < 2) {
        refs.rmsCard.classList.add('rms-warn');
        refs.rmsQuality.textContent = 'Aceptable: revisar cobertura';
        return;
    }
    refs.rmsCard.classList.add('rms-bad');
    refs.rmsQuality.textContent = 'Alto: repetir muestras';
}

function log(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    refs.logOutput.textContent = `${refs.logOutput.textContent}\n${line}`.trim();
    refs.logOutput.scrollTop = refs.logOutput.scrollHeight;
}

function formatNumber(value) {
    if (!Number.isFinite(value)) return '-';
    return Number(value).toFixed(4);
}
