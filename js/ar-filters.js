class ARFilterEngine {
    constructor() {
        this.faceLandmarker = null;
        this.loading = false;
        this.ready = false;
        this.activeFilter = null;
        this.lastVideoTime = -1;
        this.landmarks = null;
        this._initPromise = null;
        this._overlayImages = {};
        this._overlaysLoaded = false;
    }

    async init() {
        if (this.ready) return true;
        if (this._initPromise) return this._initPromise;

        this._initPromise = this._doInit();
        const result = await this._initPromise;
        this._initPromise = null;
        return result;
    }

    async _doInit() {
        this.loading = true;

        try {
            const [vision] = await Promise.all([
                this._loadVisionModule(),
                this._loadOverlayImages()
            ]);
            const { FaceLandmarker, FilesetResolver } = vision;

            const filesetResolver = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
            );

            let faceLandmarker;
            try {
                faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                        delegate: 'GPU'
                    },
                    runningMode: 'VIDEO',
                    numFaces: 1,
                    minFaceDetectionConfidence: 0.5,
                    minFacePresenceConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
            } catch (gpuErr) {
                console.warn('GPU delegate failed, falling back to CPU:', gpuErr.message);
                faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                        delegate: 'CPU'
                    },
                    runningMode: 'VIDEO',
                    numFaces: 1,
                    minFaceDetectionConfidence: 0.5,
                    minFacePresenceConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
            }
            this.faceLandmarker = faceLandmarker;

            this.ready = true;
            this.loading = false;
            return true;
        } catch (e) {
            console.error('AR Filter init failed:', e);
            this.loading = false;
            return false;
        }
    }

    async _loadOverlayImages() {
        if (this._overlaysLoaded) return;

        const overlays = {
            'ar-hiphop': 'images/ar/hiphop-glasses.png',
            'ar-rock': 'images/ar/rock-facepaint.png',
            'ar-pop': 'images/ar/pop-mask.png',
            'ar-edm': 'images/ar/edm-visor.png',
            'ar-jazz': 'images/ar/jazz-mask.png',
            'ar-skimask': 'images/ar/skimask.png'
        };

        const loadImage = (key, src) => new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this._overlayImages[key] = img;
                console.log(`[AR] Loaded overlay: ${key}`);
                resolve();
            };
            img.onerror = () => {
                console.warn(`[AR] Failed to load overlay: ${key}`);
                resolve();
            };
            img.src = src;
        });

        await Promise.all(Object.entries(overlays).map(([key, src]) => loadImage(key, src)));
        this._overlaysLoaded = true;
        console.log('[AR] All overlay images loaded');
    }

    async _loadVisionModule() {
        if (window._mediapipeVision) {
            return window._mediapipeVision;
        }

        const timeout = (ms) => new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
        );

        try {
            console.log('[AR] Trying ESM dynamic import...');
            const vision = await Promise.race([
                import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'),
                timeout(15000)
            ]);
            console.log('[AR] ESM import succeeded');
            window._mediapipeVision = {
                FaceLandmarker: vision.FaceLandmarker,
                FilesetResolver: vision.FilesetResolver,
                DrawingUtils: vision.DrawingUtils
            };
            return window._mediapipeVision;
        } catch (esmErr) {
            console.warn('[AR] ESM import failed:', esmErr.message);
        }

        console.log('[AR] Trying UMD script tag fallback...');
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('MediaPipe script load timed out after 15s'));
            }, 15000);

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.js';
            script.crossOrigin = 'anonymous';
            script.onload = () => {
                let attempts = 0;
                const check = () => {
                    attempts++;
                    const fl = window.FaceLandmarker || (window.vision && window.vision.FaceLandmarker);
                    const fr = window.FilesetResolver || (window.vision && window.vision.FilesetResolver);
                    if (fl && fr) {
                        clearTimeout(timer);
                        window._mediapipeVision = {
                            FaceLandmarker: fl,
                            FilesetResolver: fr,
                            DrawingUtils: window.DrawingUtils || (window.vision && window.vision.DrawingUtils)
                        };
                        console.log('[AR] UMD script loaded successfully');
                        resolve(window._mediapipeVision);
                    } else if (attempts > 100) {
                        clearTimeout(timer);
                        reject(new Error('MediaPipe globals not found after script load'));
                    } else {
                        setTimeout(check, 50);
                    }
                };
                check();
            };
            script.onerror = () => {
                clearTimeout(timer);
                reject(new Error('Failed to load MediaPipe vision bundle'));
            };
            document.head.appendChild(script);
        });
    }

    setFilter(filterName) {
        if (filterName === 'none' || !filterName) {
            this.activeFilter = null;
        } else {
            this.activeFilter = filterName;
        }
    }

    detectLandmarks(videoEl, timestamp) {
        if (!this.faceLandmarker || !this.ready) return null;
        if (videoEl.readyState < 2) return this.landmarks;
        if (videoEl.currentTime === this.lastVideoTime) return this.landmarks;
        this.lastVideoTime = videoEl.currentTime;

        try {
            const results = this.faceLandmarker.detectForVideo(videoEl, timestamp);
            if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
                this.landmarks = results.faceLandmarks[0];
            } else {
                this.landmarks = null;
            }
        } catch (e) {
            console.warn('AR detectForVideo error:', e.message);
            this.landmarks = null;
        }
        return this.landmarks;
    }

    drawFilter(ctx, canvas, videoEl, timestamp) {
        if (!this.activeFilter || !this.ready) return false;

        const lm = this.detectLandmarks(videoEl, timestamp);
        if (!lm) return false;

        const w = canvas.width;
        const h = canvas.height;

        switch (this.activeFilter) {
            case 'ar-hiphop':
                this._drawOverlayOnEyes(ctx, lm, w, h, 'ar-hiphop', { scaleW: 2.4, scaleH: 1.0, offsetY: -0.05 });
                break;
            case 'ar-rock':
                this._drawOverlayOnFace(ctx, lm, w, h, 'ar-rock', { scaleW: 1.4, scaleH: 1.3, offsetY: 0 });
                break;
            case 'ar-pop':
                this._drawOverlayOnEyes(ctx, lm, w, h, 'ar-pop', { scaleW: 2.6, scaleH: 1.2, offsetY: -0.15 });
                break;
            case 'ar-edm':
                this._drawOverlayOnEyes(ctx, lm, w, h, 'ar-edm', { scaleW: 2.8, scaleH: 1.0, offsetY: 0 });
                break;
            case 'ar-jazz':
                this._drawOverlayOnFace(ctx, lm, w, h, 'ar-jazz', { scaleW: 1.3, scaleH: 1.1, offsetY: -0.1 });
                break;
            case 'ar-skimask':
                this._drawOverlayOnFace(ctx, lm, w, h, 'ar-skimask', { scaleW: 1.6, scaleH: 1.5, offsetY: 0, blendMode: 'multiply' });
                break;
            default:
                return false;
        }
        return true;
    }

    _lm(landmarks, idx, w, h) {
        const p = landmarks[idx];
        return { x: p.x * w, y: p.y * h };
    }

    _distance(p1, p2) {
        return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
    }

    _midpoint(p1, p2) {
        return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    }

    _drawOverlayOnEyes(ctx, landmarks, w, h, filterKey, opts) {
        const img = this._overlayImages[filterKey];
        if (!img) return;

        const leftEyeOuter = this._lm(landmarks, 33, w, h);
        const leftEyeInner = this._lm(landmarks, 133, w, h);
        const rightEyeOuter = this._lm(landmarks, 263, w, h);
        const rightEyeInner = this._lm(landmarks, 362, w, h);

        const leftCenter = this._midpoint(leftEyeOuter, leftEyeInner);
        const rightCenter = this._midpoint(rightEyeOuter, rightEyeInner);
        const eyesMidpoint = this._midpoint(leftCenter, rightCenter);
        const eyeSpan = this._distance(leftEyeOuter, rightEyeOuter);
        const angle = Math.atan2(rightCenter.y - leftCenter.y, rightCenter.x - leftCenter.x);

        const drawW = eyeSpan * (opts.scaleW || 2.5);
        const imgAspect = img.naturalHeight / img.naturalWidth;
        const drawH = drawW * imgAspect * (opts.scaleH || 1.0);

        const offsetYPx = eyeSpan * (opts.offsetY || 0);
        const blendMode = opts.blendMode || 'screen';

        ctx.save();
        ctx.translate(eyesMidpoint.x, eyesMidpoint.y + offsetYPx);
        ctx.rotate(angle);
        ctx.globalCompositeOperation = blendMode;
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }

    _drawOverlayOnFace(ctx, landmarks, w, h, filterKey, opts) {
        const img = this._overlayImages[filterKey];
        if (!img) return;

        const forehead = this._lm(landmarks, 10, w, h);
        const chin = this._lm(landmarks, 152, w, h);
        const leftCheek = this._lm(landmarks, 234, w, h);
        const rightCheek = this._lm(landmarks, 454, w, h);

        const leftEyeCenter = this._midpoint(this._lm(landmarks, 33, w, h), this._lm(landmarks, 133, w, h));
        const rightEyeCenter = this._midpoint(this._lm(landmarks, 362, w, h), this._lm(landmarks, 263, w, h));
        const angle = Math.atan2(rightEyeCenter.y - leftEyeCenter.y, rightEyeCenter.x - leftEyeCenter.x);

        const faceWidth = this._distance(leftCheek, rightCheek);
        const faceHeight = this._distance(forehead, chin);
        const faceCenter = this._midpoint(forehead, chin);

        const drawW = faceWidth * (opts.scaleW || 1.2);
        const drawH = faceHeight * (opts.scaleH || 1.3);
        const offsetYPx = faceHeight * (opts.offsetY || 0);
        const blendMode = opts.blendMode || 'screen';

        ctx.save();
        ctx.translate(faceCenter.x, faceCenter.y + offsetYPx);
        ctx.rotate(angle);
        ctx.globalCompositeOperation = blendMode;
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }

    isActive() {
        return this.activeFilter !== null && this.ready;
    }

    destroy() {
        if (this.faceLandmarker) {
            this.faceLandmarker.close();
            this.faceLandmarker = null;
        }
        this.ready = false;
        this.activeFilter = null;
        this.landmarks = null;
    }
}

window.ARFilterEngine = ARFilterEngine;
