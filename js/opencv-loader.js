const OPENCV_SOURCES = [
    'lib/opencv.js',
    'https://docs.opencv.org/4.9.0/opencv.js',
];

export async function loadOpenCv(scriptUrls = OPENCV_SOURCES) {
    if (window.cv && window.cv.Mat) {
        return Promise.resolve(window.cv);
    }

    const sources = Array.isArray(scriptUrls) ? scriptUrls : [scriptUrls];
    let lastError = null;

    for (const source of sources) {
        try {
            return await loadOpenCvFromSource(source);
        } catch (error) {
            lastError = error;
            removeExistingScript();
            window.cv = undefined;
        }
    }

    throw lastError || new Error('No se pudo cargar OpenCV.js');
}

function loadOpenCvFromSource(scriptUrl) {
    return new Promise((resolve, reject) => {
        let resolved = false;
        const script = document.createElement('script');
        const timeoutId = window.setTimeout(() => {
            fail(new Error(`Timeout cargando OpenCV.js desde ${scriptUrl}`));
        }, 20000);

        const finish = () => {
            if (resolved) return;
            if (!window.cv || !window.cv.Mat) return;
            resolved = true;
            window.clearTimeout(timeoutId);
            resolve(window.cv);
        };

        const fail = (error = new Error(`No se pudo cargar OpenCV.js desde ${scriptUrl}`)) => {
            if (resolved) return;
            resolved = true;
            window.clearTimeout(timeoutId);
            reject(error);
        };

        window.Module = {
            ...(window.Module || {}),
            onRuntimeInitialized: finish,
        };

        script.src = scriptUrl;
        script.async = true;
        script.dataset.opencvLoader = 'true';
        script.onerror = () => fail();
        document.body.appendChild(script);

        script.addEventListener('load', () => {
            if (window.cv && typeof window.cv.then === 'function') {
                window.cv.then(finish).catch(fail);
                return;
            }

            const startedAt = performance.now();
            const waitForRuntime = () => {
                finish();
                if (resolved) return;
                if (performance.now() - startedAt > 12000) {
                    fail();
                    return;
                }
                window.setTimeout(waitForRuntime, 80);
            };

            waitForRuntime();
        });
    });
}

function removeExistingScript() {
    document.querySelectorAll('script[data-opencv-loader]').forEach((script) => script.remove());
}