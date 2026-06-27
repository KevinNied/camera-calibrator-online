export async function startCamera(videoElement, constraints = {}) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('El navegador no soporta getUserMedia');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
            ...constraints,
        },
        audio: false,
    });

    videoElement.srcObject = stream;
    await waitForVideo(videoElement);
    await videoElement.play();
    return stream;
}

export function stopCamera(videoElement) {
    const stream = videoElement.srcObject;
    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
    }
    videoElement.srcObject = null;
}

function waitForVideo(videoElement) {
    if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA && videoElement.videoWidth > 0) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        videoElement.onloadedmetadata = () => resolve();
    });
}