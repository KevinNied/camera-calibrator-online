self.onmessage = () => {
    try {
        self.Module = {
            locateFile: (path) => (path.endsWith('.wasm') ? `../lib/${path}` : path),
            onRuntimeInitialized: () => {
                self.cv = getOpenCvRuntime();
                report();
            },
            onAbort: (error) => self.postMessage({ error: `OpenCV WASM abort: ${error}` }),
        };
        importScripts('../lib/opencv.js');
        if (self.cv && typeof self.cv.then === 'function') {
            self.cv.then(() => report());
        } else {
            setTimeout(report, 500);
        }
    } catch (error) {
        self.postMessage({ error: error.message });
    }
};

let reported = false;

function report() {
    const cv = getOpenCvRuntime();
    if (reported || !cv) return;
    self.cv = cv;
    reported = true;
    self.postMessage({
        findChessboardCorners: typeof cv.findChessboardCorners,
        findChessboardCornersSB: typeof cv.findChessboardCornersSB,
        cornerSubPix: typeof cv.cornerSubPix,
        calibrateCamera: typeof cv.calibrateCamera,
        undistort: typeof cv.undistort,
        version: cv.getBuildInformation ? cv.getBuildInformation().slice(0, 300) : 'no build info',
    });
}

function getOpenCvRuntime() {
    const candidates = [self.cv, self.Module];
    return candidates.find((candidate) => candidate && typeof candidate.then !== 'function' && candidate.Mat) || null;
}
