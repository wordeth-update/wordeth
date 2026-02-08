import Foundation
import Capacitor
import ReplayKit
import UIKit

@objc(ScreenCapturePlugin)
public class ScreenCapturePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScreenCapturePlugin"
    public let jsName = "ScreenCapture"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startCapture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopCapture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise)
    ]

    private let recorder = RPScreenRecorder.shared()
    private var isCapturing = false
    private var targetFps: Int = 10
    private var quality: Int = 40
    private var captureScale: CGFloat = 0.5
    private var frameTimer: DispatchSourceTimer?
    private var lastFrameTime: CFTimeInterval = 0

    @objc func isAvailable(_ call: CAPPluginCall) {
        let available = recorder.isAvailable
        call.resolve([
            "available": available,
            "platform": "ios"
        ])
    }

    @objc func startCapture(_ call: CAPPluginCall) {
        if isCapturing {
            call.reject("Screen capture is already running")
            return
        }

        targetFps = call.getInt("fps") ?? 10
        quality = call.getInt("quality") ?? 40
        captureScale = CGFloat(call.getDouble("scale") ?? 0.5)

        guard recorder.isAvailable else {
            call.reject("Screen recording is not available on this device")
            return
        }

        if #available(iOS 11.0, *) {
            recorder.startCapture(handler: { [weak self] sampleBuffer, sampleBufferType, error in
                guard let self = self else { return }
                if let error = error {
                    self.notifyListeners("captureError", data: ["error": error.localizedDescription])
                    self.isCapturing = false
                    self.notifyListeners("captureStopped", data: ["stopped": true])
                    return
                }

                guard sampleBufferType == .video else { return }

                let now = CACurrentMediaTime()
                let minInterval = 1.0 / Double(self.targetFps)
                if now - self.lastFrameTime < minInterval { return }
                self.lastFrameTime = now

                self.processVideoFrame(sampleBuffer)

            }, completionHandler: { [weak self] error in
                if let error = error {
                    call.reject("Failed to start capture: \(error.localizedDescription)")
                    return
                }
                self?.isCapturing = true
                let screenBounds = UIScreen.main.bounds
                let w = Int(screenBounds.width * (self?.captureScale ?? 0.5))
                let h = Int(screenBounds.height * (self?.captureScale ?? 0.5))
                call.resolve([
                    "started": true,
                    "width": w,
                    "height": h
                ])
            })
        } else {
            call.reject("Screen capture requires iOS 11 or later")
        }
    }

    private func processVideoFrame(_ sampleBuffer: CMSampleBuffer) {
        guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        CVPixelBufferLockBaseAddress(imageBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(imageBuffer, .readOnly) }

        let ciImage = CIImage(cvPixelBuffer: imageBuffer)
        let context = CIContext()

        let fullWidth = CVPixelBufferGetWidth(imageBuffer)
        let fullHeight = CVPixelBufferGetHeight(imageBuffer)
        let targetWidth = Int(CGFloat(fullWidth) * captureScale)
        let targetHeight = Int(CGFloat(fullHeight) * captureScale)

        let scaleX = CGFloat(targetWidth) / CGFloat(fullWidth)
        let scaleY = CGFloat(targetHeight) / CGFloat(fullHeight)
        let scaledImage = ciImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

        guard let cgImage = context.createCGImage(scaledImage, from: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight)) else { return }

        let uiImage = UIImage(cgImage: cgImage)
        guard let jpegData = uiImage.jpegData(compressionQuality: CGFloat(quality) / 100.0) else { return }

        let base64 = jpegData.base64EncodedString()

        notifyListeners("frame", data: [
            "frame": "data:image/jpeg;base64,\(base64)",
            "width": targetWidth,
            "height": targetHeight
        ])
    }

    @objc func stopCapture(_ call: CAPPluginCall) {
        guard isCapturing else {
            call.resolve(["stopped": true])
            return
        }

        if #available(iOS 11.0, *) {
            recorder.stopCapture { [weak self] error in
                self?.isCapturing = false
                self?.notifyListeners("captureStopped", data: ["stopped": true])
                if let error = error {
                    call.reject("Failed to stop: \(error.localizedDescription)")
                    return
                }
                call.resolve(["stopped": true])
            }
        }
    }

    deinit {
        if isCapturing {
            if #available(iOS 11.0, *) {
                recorder.stopCapture(handler: nil)
            }
        }
    }
}
