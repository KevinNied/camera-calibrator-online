export class Undistorter {
    constructor(cv) {
        this.cv = cv;
        this.cameraMatrix = null;
        this.distCoeffs = null;
    }

    setCalibration(cameraMatrix, distCoeffs) {
        this.clear();
        this.cameraMatrix = cameraMatrix.clone();
        this.distCoeffs = distCoeffs.clone();
    }

    get ready() {
        return Boolean(this.cameraMatrix && this.distCoeffs);
    }

    apply(frameRgba) {
        if (!this.ready) return null;
        const dst = new this.cv.Mat();
        this.cv.undistort(frameRgba, dst, this.cameraMatrix, this.distCoeffs);
        return dst;
    }

    clear() {
        if (this.cameraMatrix) this.cameraMatrix.delete();
        if (this.distCoeffs) this.distCoeffs.delete();
        this.cameraMatrix = null;
        this.distCoeffs = null;
    }
}