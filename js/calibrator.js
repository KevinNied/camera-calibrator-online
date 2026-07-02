const DEFAULT_BOARD = { cols: 9, rows: 6, squareSize: 1 };
const MIN_SAMPLES = 15;

export class CameraCalibrator {
    constructor(cv, board = DEFAULT_BOARD) {
        this.cv = cv;
        this.board = { ...board };
        this.boardSize = new cv.Size(this.board.cols, this.board.rows);
        this.imagePoints = [];
        this.objectPoints = [];
        this.cameraMatrix = null;
        this.distCoeffs = null;
        this.rms = null;
        this.imageSize = null;
        this.objectPointTemplate = this.createObjectPointTemplate();
    }

    get minSamples() {
        return MIN_SAMPLES;
    }

    get sampleCount() {
        return this.imagePoints.length;
    }

    get hasCalibration() {
        return Boolean(this.cameraMatrix && this.distCoeffs);
    }

    findCorners(frameRgba, { refine = false, fast = true } = {}) {
        const cv = this.cv;
        const gray = new cv.Mat();
        const corners = new cv.Mat();
        let found = false;

        try {
            cv.cvtColor(frameRgba, gray, cv.COLOR_RGBA2GRAY);
            const flags = getChessboardFlags(cv, fast);

            found = cv.findChessboardCorners(gray, this.boardSize, corners, flags);

            if (found && refine) {
                const criteria = new cv.TermCriteria(
                    cv.TermCriteria_EPS + cv.TermCriteria_MAX_ITER,
                    30,
                    0.001,
                );
                cv.cornerSubPix(gray, corners, new cv.Size(11, 11), new cv.Size(-1, -1), criteria);
            }

            if (!found) {
                corners.delete();
                return { found: false, corners: null };
            }

            return { found: true, corners };
        } finally {
            gray.delete();
        }
    }

    capture(frameRgba) {
        const result = this.findCorners(frameRgba, { refine: true, fast: false });
        if (!result.found) {
            return { ok: false, count: this.sampleCount };
        }

        const objectMat = this.cv.matFromArray(
            this.board.cols * this.board.rows,
            1,
            this.cv.CV_32FC3,
            this.objectPointTemplate,
        );

        this.imagePoints.push(result.corners);
        this.objectPoints.push(objectMat);
        this.clearCalibration();
        return { ok: true, count: this.sampleCount };
    }

    undoLastSample() {
        const imagePoint = this.imagePoints.pop();
        const objectPoint = this.objectPoints.pop();
        if (imagePoint) imagePoint.delete();
        if (objectPoint) objectPoint.delete();
        this.clearCalibration();
        return this.sampleCount;
    }

    resetSamples() {
        this.imagePoints.forEach((mat) => mat.delete());
        this.objectPoints.forEach((mat) => mat.delete());
        this.imagePoints = [];
        this.objectPoints = [];
        this.clearCalibration();
    }

    clearCalibration() {
        if (this.cameraMatrix) this.cameraMatrix.delete();
        if (this.distCoeffs) this.distCoeffs.delete();
        this.cameraMatrix = null;
        this.distCoeffs = null;
        this.rms = null;
        this.imageSize = null;
    }

    calibrate(width, height) {
        if (this.sampleCount < MIN_SAMPLES) {
            throw new Error(`Se necesitan al menos ${MIN_SAMPLES} muestras válidas`);
        }

        const cv = this.cv;
        const objectVector = new cv.MatVector();
        const imageVector = new cv.MatVector();
        const cameraMatrix = cv.Mat.eye(3, 3, cv.CV_64F);
        const distCoeffs = new cv.Mat();
        const rvecs = new cv.MatVector();
        const tvecs = new cv.MatVector();

        try {
            this.objectPoints.forEach((mat) => objectVector.push_back(mat));
            this.imagePoints.forEach((mat) => imageVector.push_back(mat));

            const imageSize = new cv.Size(width, height);
            const rms = cv.calibrateCamera(
                objectVector,
                imageVector,
                imageSize,
                cameraMatrix,
                distCoeffs,
                rvecs,
                tvecs,
            );

            this.clearCalibration();
            this.cameraMatrix = cameraMatrix.clone();
            this.distCoeffs = distCoeffs.clone();
            this.rms = rms;
            this.imageSize = { width, height };

            return this.getCalibrationData();
        } finally {
            cameraMatrix.delete();
            distCoeffs.delete();
            rvecs.delete();
            tvecs.delete();
            objectVector.delete();
            imageVector.delete();
        }
    }

    importCalibration(data) {
        if (!data || !Array.isArray(data.cameraMatrix) || !Array.isArray(data.distCoeffs)) {
            throw new Error('JSON de calibración inválido');
        }

        const flatK = data.cameraMatrix.flat();
        if (flatK.length !== 9 || data.distCoeffs.length < 4) {
            throw new Error('La matriz K o los coeficientes no tienen el formato esperado');
        }

        this.clearCalibration();
        this.cameraMatrix = this.cv.matFromArray(3, 3, this.cv.CV_64F, flatK);
        this.distCoeffs = this.cv.matFromArray(data.distCoeffs.length, 1, this.cv.CV_64F, data.distCoeffs);
        this.rms = Number.isFinite(data.rms) ? data.rms : null;
        this.imageSize = data.imageSize || null;
        return this.getCalibrationData();
    }

    getCalibrationData() {
        if (!this.hasCalibration) return null;

        return {
            boardSize: { cols: this.board.cols, rows: this.board.rows },
            imageSize: this.imageSize,
            rms: this.rms,
            cameraMatrix: readMatAsRows(this.cameraMatrix),
            distCoeffs: readMatAsArray(this.distCoeffs),
            sampleCount: this.sampleCount,
            createdAt: new Date().toISOString(),
        };
    }

    createObjectPointTemplate() {
        const points = [];
        for (let row = 0; row < this.board.rows; row += 1) {
            for (let col = 0; col < this.board.cols; col += 1) {
                points.push(col * this.board.squareSize, row * this.board.squareSize, 0);
            }
        }
        return points;
    }
}

export function readMatAsRows(mat) {
    const values = readMatAsArray(mat);
    const rows = [];
    for (let row = 0; row < mat.rows; row += 1) {
        rows.push(values.slice(row * mat.cols, row * mat.cols + mat.cols));
    }
    return rows;
}

export function readMatAsArray(mat) {
    const source = mat.data64F || mat.data32F || mat.data;
    return Array.from(source).slice(0, mat.rows * mat.cols);
}

function getChessboardFlags(cv, fast) {
    return safeFlag(cv.CALIB_CB_ADAPTIVE_THRESH)
        + safeFlag(cv.CALIB_CB_NORMALIZE_IMAGE)
        + (fast ? safeFlag(cv.CALIB_CB_FAST_CHECK) : 0);
}

function safeFlag(value) {
    return Number.isFinite(value) ? value : 0;
}