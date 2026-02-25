class NativeScreenCapture {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.canvasStream = null;
        this.frameListener = null;
        this.stopListener = null;
        this.isCapturing = false;
        this.frameCount = 0;
        this.img = new Image();
    }

    static isAvailable() {
        return !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ScreenCapture);
    }

    static async checkPlatformSupport() {
        if (!this.isAvailable()) {
            return { available: false, platform: 'web' };
        }
        try {
            const result = await window.Capacitor.Plugins.ScreenCapture.isAvailable();
            return result;
        } catch (e) {
            return { available: false, platform: 'unknown' };
        }
    }

    async start(options = {}) {
        if (!NativeScreenCapture.isAvailable()) {
            throw new Error('Native screen capture is not available');
        }

        const plugin = window.Capacitor.Plugins.ScreenCapture;
        const fps = options.fps || 10;
        const quality = options.quality || 40;
        const scale = options.scale || 0.5;

        const result = await plugin.startCapture({ fps, quality, scale });

        const width = result.width || 720;
        const height = result.height || 1280;

        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');

        this.canvasStream = this.canvas.captureStream(fps);
        this.isCapturing = true;
        this.frameCount = 0;

        this.frameListener = await plugin.addListener('frame', (data) => {
            if (!this.isCapturing) return;
            this.renderFrame(data.frame, data.width, data.height);
        });

        this.stopListener = await plugin.addListener('captureStopped', () => {
            this.cleanup();
        });

        return this.canvasStream;
    }

    renderFrame(frameDataUrl, width, height) {
        if (!this.ctx || !this.isCapturing) return;

        if (width !== this.canvas.width || height !== this.canvas.height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        this.img.onload = () => {
            if (!this.isCapturing) return;
            this.ctx.drawImage(this.img, 0, 0, this.canvas.width, this.canvas.height);
            this.frameCount++;
        };
        this.img.src = frameDataUrl;
    }

    async stop() {
        if (!NativeScreenCapture.isAvailable()) return;

        this.isCapturing = false;

        try {
            await window.Capacitor.Plugins.ScreenCapture.stopCapture();
        } catch (e) {
            console.warn('Error stopping native capture:', e);
        }

        this.cleanup();
    }

    cleanup() {
        this.isCapturing = false;

        if (this.frameListener) {
            this.frameListener.remove();
            this.frameListener = null;
        }
        if (this.stopListener) {
            this.stopListener.remove();
            this.stopListener = null;
        }

        if (this.canvasStream) {
            this.canvasStream.getTracks().forEach(t => t.stop());
            this.canvasStream = null;
        }

        this.canvas = null;
        this.ctx = null;
        this.frameCount = 0;
    }

    getStream() {
        return this.canvasStream;
    }

    isActive() {
        return this.isCapturing;
    }
}

window.NativeScreenCapture = NativeScreenCapture;
