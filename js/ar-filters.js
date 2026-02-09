class ARFilterEngine {
    constructor() {
        this.faceLandmarker = null;
        this.loading = false;
        this.ready = false;
        this.activeFilter = null;
        this.lastVideoTime = -1;
        this.landmarks = null;
        this._initPromise = null;
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
            const vision = await this._loadVisionModule();
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
            console.log('[AR] ESM import succeeded, exports:', Object.keys(vision).filter(k => /Face|Fileset|Draw/.test(k)));
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
                this._drawHipHop(ctx, lm, w, h);
                break;
            case 'ar-rock':
                this._drawRock(ctx, lm, w, h);
                break;
            case 'ar-pop':
                this._drawPop(ctx, lm, w, h);
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

    _drawHipHop(ctx, landmarks, w, h) {
        const leftEyeOuter = this._lm(landmarks, 33, w, h);
        const leftEyeInner = this._lm(landmarks, 133, w, h);
        const rightEyeInner = this._lm(landmarks, 362, w, h);
        const rightEyeOuter = this._lm(landmarks, 263, w, h);
        const leftEyeTop = this._lm(landmarks, 159, w, h);
        const leftEyeBottom = this._lm(landmarks, 145, w, h);
        const rightEyeTop = this._lm(landmarks, 386, w, h);
        const rightEyeBottom = this._lm(landmarks, 374, w, h);
        const noseBridge = this._lm(landmarks, 6, w, h);

        const leftCenter = this._midpoint(leftEyeOuter, leftEyeInner);
        const rightCenter = this._midpoint(rightEyeOuter, rightEyeInner);
        const leftEyeWidth = this._distance(leftEyeOuter, leftEyeInner);
        const rightEyeWidth = this._distance(rightEyeOuter, rightEyeInner);

        const angle = Math.atan2(rightCenter.y - leftCenter.y, rightCenter.x - leftCenter.x);
        const lensW = leftEyeWidth * 1.7;
        const lensH = lensW * 0.5;

        ctx.save();

        const drawLens = (center, lWidth) => {
            const lW = lWidth * 1.7;
            const lH = lW * 0.5;

            ctx.save();
            ctx.translate(center.x, center.y);
            ctx.rotate(angle);

            const lensGrad = ctx.createLinearGradient(-lW / 2, -lH / 2, lW / 2, lH / 2);
            lensGrad.addColorStop(0, 'rgba(20, 20, 30, 0.92)');
            lensGrad.addColorStop(0.3, 'rgba(40, 40, 60, 0.88)');
            lensGrad.addColorStop(0.5, 'rgba(80, 80, 120, 0.35)');
            lensGrad.addColorStop(0.7, 'rgba(40, 40, 60, 0.88)');
            lensGrad.addColorStop(1, 'rgba(20, 20, 30, 0.92)');

            ctx.beginPath();
            const r = lH * 0.35;
            ctx.moveTo(-lW / 2 + r, -lH / 2);
            ctx.lineTo(lW / 2 - r, -lH / 2);
            ctx.quadraticCurveTo(lW / 2, -lH / 2, lW / 2, -lH / 2 + r);
            ctx.lineTo(lW / 2, lH / 2 - r);
            ctx.quadraticCurveTo(lW / 2, lH / 2, lW / 2 - r, lH / 2);
            ctx.lineTo(-lW / 2 + r, lH / 2);
            ctx.quadraticCurveTo(-lW / 2, lH / 2, -lW / 2, lH / 2 - r);
            ctx.lineTo(-lW / 2, -lH / 2 + r);
            ctx.quadraticCurveTo(-lW / 2, -lH / 2, -lW / 2 + r, -lH / 2);
            ctx.closePath();

            ctx.fillStyle = lensGrad;
            ctx.fill();
            ctx.strokeStyle = '#1a1a2e';
            ctx.lineWidth = Math.max(2, lW * 0.04);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-lW * 0.3, -lH * 0.3);
            ctx.lineTo(lW * 0.1, -lH * 0.35);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = Math.max(1, lW * 0.02);
            ctx.stroke();

            ctx.restore();
        };

        drawLens(leftCenter, leftEyeWidth);
        drawLens(rightCenter, rightEyeWidth);

        ctx.save();
        ctx.translate(noseBridge.x, noseBridge.y);
        ctx.rotate(angle);
        const bridgeW = this._distance(leftEyeInner, rightEyeInner) * 0.6;
        ctx.beginPath();
        ctx.moveTo(-bridgeW / 2, 0);
        ctx.quadraticCurveTo(0, -lensH * 0.4, bridgeW / 2, 0);
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = Math.max(2, lensW * 0.04);
        ctx.stroke();
        ctx.restore();

        const leftTemple = this._lm(landmarks, 234, w, h);
        const rightTemple = this._lm(landmarks, 454, w, h);

        ctx.beginPath();
        ctx.moveTo(leftCenter.x - lensW * 0.5 * Math.cos(angle), leftCenter.y - lensW * 0.5 * Math.sin(angle));
        ctx.lineTo(leftTemple.x, leftTemple.y);
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = Math.max(2, lensW * 0.035);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(rightCenter.x + lensW * 0.5 * Math.cos(angle), rightCenter.y + lensW * 0.5 * Math.sin(angle));
        ctx.lineTo(rightTemple.x, rightTemple.y);
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = Math.max(2, lensW * 0.035);
        ctx.stroke();

        ctx.restore();
    }

    _drawRock(ctx, landmarks, w, h) {
        const jawPoints = [];
        const jawIndices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
        for (const idx of jawIndices) {
            jawPoints.push(this._lm(landmarks, idx, w, h));
        }

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(jawPoints[0].x, jawPoints[0].y);
        for (let i = 1; i < jawPoints.length; i++) {
            ctx.lineTo(jawPoints[i].x, jawPoints[i].y);
        }
        ctx.closePath();
        ctx.clip();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();

        this._drawKissStarEye(ctx, landmarks, w, h, 'right');
        this._drawKissStarEye(ctx, landmarks, w, h, 'left');
        this._drawKissLips(ctx, landmarks, w, h);
        this._drawKissLightning(ctx, landmarks, w, h);

        ctx.restore();
    }

    _drawKissStarEye(ctx, landmarks, w, h, side) {
        let center, outerIdx, innerIdx;
        if (side === 'right') {
            center = this._midpoint(this._lm(landmarks, 362, w, h), this._lm(landmarks, 263, w, h));
            center = this._midpoint(center, this._lm(landmarks, 386, w, h));
            outerIdx = 263;
            innerIdx = 362;
        } else {
            center = this._midpoint(this._lm(landmarks, 33, w, h), this._lm(landmarks, 133, w, h));
            center = this._midpoint(center, this._lm(landmarks, 159, w, h));
            outerIdx = 33;
            innerIdx = 133;
        }

        const eyeWidth = this._distance(this._lm(landmarks, outerIdx, w, h), this._lm(landmarks, innerIdx, w, h));
        const starRadius = eyeWidth * 1.2;
        const points = 5;

        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? starRadius : starRadius * 0.4;
            const a = (Math.PI * i) / points - Math.PI / 2;
            if (i === 0) ctx.moveTo(r * Math.cos(a), r * Math.sin(a));
            else ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
        }
        ctx.closePath();
        ctx.fillStyle = '#000000';
        ctx.fill();
        ctx.restore();
    }

    _drawKissLips(ctx, landmarks, w, h) {
        const upperLip = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
        const lowerLip = [291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61];

        ctx.save();
        ctx.beginPath();
        let first = this._lm(landmarks, upperLip[0], w, h);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < upperLip.length; i++) {
            const p = this._lm(landmarks, upperLip[i], w, h);
            ctx.lineTo(p.x, p.y);
        }
        for (let i = 1; i < lowerLip.length; i++) {
            const p = this._lm(landmarks, lowerLip[i], w, h);
            ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fillStyle = '#cc0000';
        ctx.fill();
        ctx.strokeStyle = '#880000';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }

    _drawKissLightning(ctx, landmarks, w, h) {
        const leftCheek = this._lm(landmarks, 234, w, h);
        const leftJaw = this._lm(landmarks, 132, w, h);
        const leftEye = this._lm(landmarks, 33, w, h);

        const startX = leftCheek.x;
        const startY = leftEye.y;
        const boltH = this._distance(leftEye, leftJaw) * 0.8;
        const boltW = boltH * 0.35;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + boltW * 0.3, startY + boltH * 0.35);
        ctx.lineTo(startX - boltW * 0.1, startY + boltH * 0.4);
        ctx.lineTo(startX + boltW * 0.2, startY + boltH);
        ctx.lineTo(startX - boltW * 0.05, startY + boltH * 0.55);
        ctx.lineTo(startX + boltW * 0.15, startY + boltH * 0.5);
        ctx.closePath();
        ctx.fillStyle = '#cc0000';
        ctx.fill();
        ctx.strokeStyle = '#880000';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }

    _drawPop(ctx, landmarks, w, h) {
        this._drawPopEyelashes(ctx, landmarks, w, h, 'left');
        this._drawPopEyelashes(ctx, landmarks, w, h, 'right');
        this._drawPopEyeshadow(ctx, landmarks, w, h);
        this._drawPopBlush(ctx, landmarks, w, h);
        this._drawPopLips(ctx, landmarks, w, h);
    }

    _drawPopEyelashes(ctx, landmarks, w, h, side) {
        let topIndices, eyeWidth;
        if (side === 'left') {
            topIndices = [33, 246, 161, 160, 159, 158, 157, 173, 133];
            eyeWidth = this._distance(this._lm(landmarks, 33, w, h), this._lm(landmarks, 133, w, h));
        } else {
            topIndices = [362, 398, 384, 385, 386, 387, 388, 466, 263];
            eyeWidth = this._distance(this._lm(landmarks, 362, w, h), this._lm(landmarks, 263, w, h));
        }

        const lashLen = eyeWidth * 0.22;
        const eyeCenter = side === 'left'
            ? this._midpoint(this._lm(landmarks, 159, w, h), this._lm(landmarks, 145, w, h))
            : this._midpoint(this._lm(landmarks, 386, w, h), this._lm(landmarks, 374, w, h));

        ctx.save();
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = Math.max(1.5, eyeWidth * 0.03);
        ctx.lineCap = 'round';

        for (let i = 1; i < topIndices.length - 1; i++) {
            const p = this._lm(landmarks, topIndices[i], w, h);
            const angle = Math.atan2(p.y - eyeCenter.y, p.x - eyeCenter.x) - Math.PI * 0.15;
            const endX = p.x + Math.cos(angle - Math.PI / 2) * lashLen;
            const endY = p.y + Math.sin(angle - Math.PI / 2) * lashLen;

            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            const curlAngle = side === 'left' ? angle - Math.PI / 2 - 0.3 : angle - Math.PI / 2 + 0.3;
            const tipX = endX + Math.cos(curlAngle) * (lashLen * 0.3);
            const tipY = endY + Math.sin(curlAngle) * (lashLen * 0.3);
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
        }

        ctx.beginPath();
        let first = this._lm(landmarks, topIndices[0], w, h);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < topIndices.length; i++) {
            const p = this._lm(landmarks, topIndices[i], w, h);
            ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = Math.max(2, eyeWidth * 0.05);
        ctx.stroke();

        ctx.restore();
    }

    _drawPopEyeshadow(ctx, landmarks, w, h) {
        const drawShadow = (outerIdx, innerIdx, topIdx) => {
            const outer = this._lm(landmarks, outerIdx, w, h);
            const inner = this._lm(landmarks, innerIdx, w, h);
            const top = this._lm(landmarks, topIdx, w, h);
            const center = this._midpoint(outer, inner);
            const eyeW = this._distance(outer, inner);

            ctx.save();
            ctx.globalAlpha = 0.25;
            const grad = ctx.createRadialGradient(center.x, top.y - eyeW * 0.15, eyeW * 0.1, center.x, top.y - eyeW * 0.15, eyeW * 0.7);
            grad.addColorStop(0, 'rgba(180, 100, 220, 0.5)');
            grad.addColorStop(0.5, 'rgba(140, 60, 180, 0.3)');
            grad.addColorStop(1, 'rgba(100, 40, 140, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(center.x, top.y - eyeW * 0.1, eyeW * 0.65, eyeW * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };

        drawShadow(33, 133, 159);
        drawShadow(362, 263, 386);
    }

    _drawPopBlush(ctx, landmarks, w, h) {
        const drawBlush = (cheekIdx) => {
            const cheek = this._lm(landmarks, cheekIdx, w, h);
            const noseTip = this._lm(landmarks, 1, w, h);
            const cheekSize = this._distance(cheek, noseTip) * 0.35;

            ctx.save();
            ctx.globalAlpha = 0.2;
            const grad = ctx.createRadialGradient(cheek.x, cheek.y, cheekSize * 0.1, cheek.x, cheek.y, cheekSize);
            grad.addColorStop(0, 'rgba(255, 130, 150, 0.5)');
            grad.addColorStop(1, 'rgba(255, 130, 150, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(cheek.x, cheek.y, cheekSize, cheekSize * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };

        drawBlush(50);
        drawBlush(280);
    }

    _drawPopLips(ctx, landmarks, w, h) {
        const upperOuter = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
        const lowerOuter = [291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61];

        ctx.save();
        ctx.beginPath();
        let first = this._lm(landmarks, upperOuter[0], w, h);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < upperOuter.length; i++) {
            const p = this._lm(landmarks, upperOuter[i], w, h);
            ctx.lineTo(p.x, p.y);
        }
        for (let i = 1; i < lowerOuter.length; i++) {
            const p = this._lm(landmarks, lowerOuter[i], w, h);
            ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();

        const lipCenter = this._lm(landmarks, 0, w, h);
        const lipBottom = this._lm(landmarks, 17, w, h);
        const grad = ctx.createLinearGradient(lipCenter.x, lipCenter.y, lipCenter.x, lipBottom.y);
        grad.addColorStop(0, 'rgba(220, 80, 100, 0.45)');
        grad.addColorStop(0.5, 'rgba(200, 60, 80, 0.5)');
        grad.addColorStop(1, 'rgba(180, 50, 70, 0.4)');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.globalAlpha = 0.3;
        const shineGrad = ctx.createRadialGradient(
            lipCenter.x, lipCenter.y - 2, 1,
            lipCenter.x, lipCenter.y - 2, this._distance(this._lm(landmarks, 61, w, h), this._lm(landmarks, 291, w, h)) * 0.3
        );
        shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = shineGrad;
        ctx.fill();

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
