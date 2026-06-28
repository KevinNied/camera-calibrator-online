import { startCamera, stopCamera } from './camera.js';

const BOARD = { cols: 9, rows: 6 };
const OVERLAY_COLORS = ['#1f35ff', '#00c9d7', '#00d957', '#d4d300', '#ff8a00', '#ff2020'];

const refs = {
    video: document.getElementById('cameraVideo'),
    canvasShell: document.querySelector('.canvas-shell'),
    detectionBadge: document.getElementById('detectionBadge'),
    flowPhases: Array.from(document.querySelectorAll('.flow-phase')),
    workCanvas: document.getElementById('workCanvas'),
    outputCanvas: document.getElementById('outputCanvas'),
    opencvStatus: document.getElementById('opencvStatus'),
    cameraStatus: document.getElementById('cameraStatus'),
    viewerHint: document.getElementById('viewerHint'),
    startCameraBtn: document.getElementById('startCameraBtn'),
    stopCameraBtn: document.getElementById('stopCameraBtn'),
    calibrateBtn: document.getElementById('calibrateBtn'),
    resetBtn: document.getElementById('resetBtn'),
    correctionPanel: document.getElementById('correctionPanel'),
    originalViewBtn: document.getElementById('originalViewBtn'),
    correctedViewBtn: document.getElementById('correctedViewBtn'),
    undistortToggle: document.getElementById('undistortToggle'),
    sampleCount: document.getElementById('sampleCount'),
    minSamples: document.getElementById('minSamples'),
    rmsCard: document.getElementById('rmsCard'),
    rmsValue: document.getElementById('rmsValue'),
    rmsQuality: document.getElementById('rmsQuality'),
    cameraMatrix: document.getElementById('cameraMatrix'),
    distCoeffs: document.getElementById('distCoeffs'),
    resultsCard: document.getElementById('resultsCard'),
    poseHint: document.getElementById('poseHint'),
    sampleStrip: document.getElementById('sampleStrip'),
    logOutput: document.getElementById('logOutput'),
};

const POSE_HINTS = [
    'Próxima pose: centro del cuadro.',
    'Próxima pose: tablero cerca de un borde.',
    'Próxima pose: tablero en una esquina.',
    'Próxima pose: tablero inclinado.',
    'Próxima pose: tablero más cerca de la cámara.',
    'Próxima pose: tablero más lejos y completo.',
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
    autoCalibrating: false,
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
    log('Aplicación lista. Inicia la cámara; OpenCV se carga automáticamente en un worker.');
    updateButtons();
}

function bindEvents() {
    refs.startCameraBtn.addEventListener('click', handleStartCamera);
    refs.stopCameraBtn.addEventListener('click', handleStopCamera);
    refs.calibrateBtn.addEventListener('click', handleCalibrate);
    refs.resetBtn.addEventListener('click', handleReset);
    refs.originalViewBtn.addEventListener('click', () => setCorrectionMode(false));
    refs.correctedViewBtn.addEventListener('click', () => setCorrectionMode(true));

    window.addEventListener('keydown', (event) => {
        if (event.code === 'Space' && canCapture()) {
            event.preventDefault();
            handleCapture();
        }
    });
}

async function handleStartCamera() {
    if (state.running) return;
    setBusy(true);
    log('Iniciando cámara...');
    let cameraStarted = false;

    try {
        await startCamera(refs.video);
        configureCanvas(refs.video.videoWidth || 640, refs.video.videoHeight || 480);
        state.running = true;
        cameraStarted = true;
        refs.canvasShell.classList.add('is-live');
        updateDetectionFeedback(state.workerReady ? 'searching' : 'idle');
        setStatus(refs.cameraStatus, `Cámara: ${refs.outputCanvas.width}x${refs.outputCanvas.height}`, 'ok');
        refs.viewerHint.textContent = state.workerReady
            ? 'Mostrá el chessboard y capturá varias posiciones.'
            : 'Cámara activa. Cargando OpenCV para detectar el tablero.';
        log(`Cámara iniciada: ${refs.outputCanvas.width} x ${refs.outputCanvas.height}`);
        state.animationId = requestAnimationFrame(renderLoop);
    } catch (error) {
        setStatus(refs.cameraStatus, 'Cámara: error', 'danger');
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
    setStatus(refs.cameraStatus, 'Cámara: detenida', 'muted');
    refs.viewerHint.textContent = 'Inicia la cámara y mostrá el chessboard 9x6.';
    clearCanvas();
    log('Cámara detenida.');
    updateButtons();
}

function startOpenCvWorker() {
    if (state.workerReady || state.workerLoading) return;
    state.workerLoading = true;
    setStatus(refs.opencvStatus, 'OpenCV: cargando worker', 'warn');
    updateDetectionFeedback(state.running ? 'searching' : 'idle');
    log('Cargando OpenCV.js automáticamente en Web Worker... La interfaz debería seguir respondiendo.');
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
    state.autoCalibrating = false;
    setBusy(true);
    log('Calibrando cámara en worker...');
    state.worker.postMessage({ type: 'calibrate', width: refs.outputCanvas.width, height: refs.outputCanvas.height });
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
                : 'OpenCV listo. Inicia la cámara para comenzar.';
            log('OpenCV.js listo en worker.');
            updateButtons();
            break;
        case 'detectResult':
            state.pendingDetect = false;
            state.lastCorners = message.found ? message.corners : null;
            updateDetectionFeedback(message.found ? 'detected' : 'searching');
            break;
        case 'captureResult':
            setBusy(false);
            state.sampleCount = message.count;
            clearResults(false);
            updateSampleUi();
            if (message.ok) {
                addSampleThumbnail(state.pendingCapturePreview, message.count);
                log(`Muestra ${message.count} capturada.`);
                requestAutoCalibration();
            } else {
                state.pendingCapturePreview = null;
                log('No se detecto el tablero. Reintenta con mejor luz y todo el patron visible.');
            }
            updateButtons();
            break;
        case 'calibrationResult':
            setBusy(false);
            state.calibrationData = message.data;
            renderCalibration(message.data);
            refs.viewerHint.textContent = 'Compará la vista original contra la corregida.';
            log(`${state.autoCalibrating ? 'RMS actualizado' : 'Calibración terminada'}. RMS: ${formatRms(message.data.rms)}`);
            state.autoCalibrating = false;
            updateButtons();
            break;
        case 'rmsPreviewResult':
            setBusy(false);
            state.autoCalibrating = false;
            renderRmsPreview(message);
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
            log('Calibración importada. Ya podés activar antidistorsión.');
            updateButtons();
            break;
        case 'error':
            state.pendingDetect = false;
            state.pendingUndistort = false;
            state.workerLoading = false;
            setBusy(false);
            state.autoCalibrating = false;
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
    outputCtx.shadowColor = 'rgba(0, 0, 0, 0.42)';
    outputCtx.shadowBlur = 4;

    if (isFullBoard) {
        for (let row = 0; row < BOARD.rows; row += 1) {
            drawCornerPath(getBoardRow(corners, row), OVERLAY_COLORS[row] || OVERLAY_COLORS.at(-1), 3.4);
        }

        for (let row = 0; row < BOARD.rows - 1; row += 1) {
            const lastInRow = corners[(row * BOARD.cols) + BOARD.cols - 1];
            const firstInNextRow = corners[(row + 1) * BOARD.cols];
            drawCornerPath([lastInRow, firstInNextRow], OVERLAY_COLORS[row] || OVERLAY_COLORS.at(-1), 2.4);
        }
    } else {
        drawCornerPath(corners, '#ff8a00', 3.4);
    }

    corners.forEach((point, index) => {
        const row = isFullBoard ? Math.floor(index / BOARD.cols) : 0;
        const fillColor = OVERLAY_COLORS[row] || '#ff8a00';
        outputCtx.beginPath();
        outputCtx.fillStyle = fillColor;
        outputCtx.strokeStyle = colorWithAlpha(fillColor, 0.72);
        outputCtx.lineWidth = 1.8;
        outputCtx.arc(point.x, point.y, 3.4, 0, Math.PI * 2);
        outputCtx.fill();
        outputCtx.stroke();
    });
    outputCtx.restore();
}

function drawCornerPath(points, color, lineWidth = 3) {
    if (points.length < 2) return;

    outputCtx.beginPath();
    outputCtx.strokeStyle = colorWithAlpha(color, 0.72);
    outputCtx.lineWidth = lineWidth;
    outputCtx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => outputCtx.lineTo(point.x, point.y));
    outputCtx.stroke();
}

function getBoardRow(corners, row) {
    const start = row * BOARD.cols;
    return corners.slice(start, start + BOARD.cols);
}

function colorWithAlpha(hex, alpha) {
    const normalized = hex.replace('#', '');
    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function updateButtons() {
    const hasSamples = state.sampleCount > 0;
    const enoughSamples = state.sampleCount >= state.minSamples;
    refs.startCameraBtn.disabled = state.running || state.busy;
    refs.stopCameraBtn.disabled = !state.running || state.busy;
    refs.calibrateBtn.disabled = !state.workerReady || !enoughSamples || state.busy;
    refs.calibrateBtn.classList.toggle('button-primary', !state.calibrationData);
    refs.calibrateBtn.classList.toggle('button-secondary', Boolean(state.calibrationData));
    refs.calibrateBtn.classList.toggle('is-ready', state.workerReady && enoughSamples && !state.calibrationData && !state.busy);
    refs.resetBtn.disabled = !state.workerReady || !hasSamples || state.busy;
    updateFlow();
}

function canCapture() {
    return state.running && state.workerReady && !state.busy;
}

function requestAutoCalibration() {
    if (!state.workerReady || state.sampleCount === 0) return;
    state.autoCalibrating = true;
    setBusy(true);
    refs.rmsCard.hidden = false;
    refs.rmsValue.textContent = '...';
    refs.rmsQuality.textContent = 'Calculando RMS preliminar.';
    state.worker.postMessage({ type: 'previewCalibration', width: refs.outputCanvas.width, height: refs.outputCanvas.height });
}

function updateSampleUi() {
    refs.sampleCount.textContent = state.sampleCount >= state.minSamples
        ? `${state.sampleCount} muestras ✓`
        : String(state.sampleCount);
    if (!state.calibrationData && !state.autoCalibrating) updateRmsPlaceholder();
    updateCoverageUi();
}

function updateRmsPlaceholder() {
    refs.rmsCard.hidden = false;
    refs.rmsValue.textContent = '-';
    if (state.sampleCount > 0) {
        refs.rmsQuality.textContent = 'RMS preliminar se actualiza con cada muestra.';
        return;
    }
    refs.rmsQuality.textContent = 'Capturá una muestra para calcular RMS preliminar.';
}

function renderRmsPreview(message) {
    refs.rmsCard.hidden = false;
    refs.rmsCard.classList.remove('rms-good', 'rms-warn', 'rms-bad');
    if (!message.ok || !Number.isFinite(message.rms)) {
        refs.rmsValue.textContent = '-';
        refs.rmsQuality.textContent = 'RMS preliminar no disponible todavía.';
        return;
    }
    refs.rmsValue.textContent = formatRms(message.rms);
    setRmsQuality(message.rms);
}

function clearResults(clearWorkerCalibration = true) {
    refs.rmsValue.textContent = '-';
    refs.cameraMatrix.className = 'matrix-box empty';
    refs.cameraMatrix.textContent = 'Sin calibración';
    refs.distCoeffs.className = 'coeff-grid empty';
    refs.distCoeffs.textContent = 'Sin calibración';
    setRmsQuality(null);
    refs.undistortToggle.checked = false;
    refs.undistortToggle.disabled = true;
    refs.correctionPanel.hidden = true;
    refs.resultsCard.hidden = true;
    refs.rmsCard.hidden = false;
    state.calibrationData = null;
    updateCorrectionMode();
    updateRmsPlaceholder();
    if (clearWorkerCalibration && state.workerReady) state.worker.postMessage({ type: 'clearCalibration' });
    updateFlow();
}

function renderCalibration(data) {
    refs.rmsValue.textContent = formatRms(data.rms);
    refs.rmsCard.hidden = false;
    refs.resultsCard.hidden = false;
    refs.correctionPanel.hidden = false;
    refs.undistortToggle.disabled = false;
    setCorrectionMode(true, { silent: true });
    setRmsQuality(data.rms);
    renderCameraMatrix(data.cameraMatrix);
    renderDistCoeffs(data.distCoeffs);
}

function setBusy(value) {
    state.busy = value;
    updateButtons();
}

function setStatus(element, text, tone) {
    if (!element) return;
    element.textContent = text;
    element.className = 'status-pill';
    if (tone && tone !== 'ok') element.classList.add(tone);
}

function updateFlow() {
    const activePhase = state.calibrationData ? 'calibrate' : 'capture';
    document.body.classList.toggle('phase-capture', activePhase === 'capture');
    document.body.classList.toggle('phase-calibrated', activePhase === 'calibrate');
    refs.flowPhases.forEach((phase) => {
        const isActive = phase.dataset.phase === activePhase;
        phase.classList.toggle('active', isActive);
        if (isActive) {
            phase.setAttribute('aria-current', 'step');
        } else {
            phase.removeAttribute('aria-current');
        }
    });
}

function setCorrectionMode(corrected, options = {}) {
    refs.undistortToggle.checked = Boolean(corrected);
    updateCorrectionMode();
    if (!options.silent) {
        const label = corrected ? 'Antidistorsión activada' : 'Antidistorsión desactivada';
        refs.viewerHint.textContent = label;
        log(label);
    }
    updateFlow();
}

function updateCorrectionMode() {
    const corrected = refs.undistortToggle.checked;
    refs.originalViewBtn.classList.toggle('active', !corrected);
    refs.correctedViewBtn.classList.toggle('active', corrected);
    refs.originalViewBtn.setAttribute('aria-pressed', String(!corrected));
    refs.correctedViewBtn.setAttribute('aria-pressed', String(corrected));
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
        empty.textContent = 'Las miniaturas aparecerán al capturar muestras válidas.';
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
        refs.poseHint.textContent = 'Cobertura mínima lista. Calibrá o sumá poses en zonas nuevas para mejorar el resultado.';
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
        number.textContent = formatCoefficient(value);
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
        refs.rmsQuality.textContent = 'Excelente para demo: error menor a 1 px.';
        return;
    }
    if (value < 2) {
        refs.rmsCard.classList.add('rms-warn');
        refs.rmsQuality.textContent = 'Aceptable: conviene sumar poses variadas.';
        return;
    }
    refs.rmsCard.classList.add('rms-bad');
    refs.rmsQuality.textContent = 'Alto: repetir muestras con mejor cobertura.';
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

function formatCoefficient(value) {
    if (!Number.isFinite(value)) return '-';
    return Number(value).toFixed(4);
}

function formatRms(value) {
    if (!Number.isFinite(value)) return '-';
    return Number(value).toFixed(1);
}
