package com.wordeth.app.screencapture

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean

@CapacitorPlugin(name = "ScreenCapture")
class ScreenCapturePlugin : Plugin() {

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null
    private val isCapturing = AtomicBoolean(false)
    private var captureWidth = 720
    private var captureHeight = 1280
    private var captureDpi = 1
    private var targetFps = 10
    private var quality = 40

    @PluginMethod
    fun startCapture(call: PluginCall) {
        if (isCapturing.get()) {
            call.reject("Screen capture is already running")
            return
        }

        targetFps = call.getInt("fps", 10) ?: 10
        quality = call.getInt("quality", 40) ?: 40
        val scale = call.getDouble("scale") ?: 0.5

        val activity = activity ?: run {
            call.reject("Activity not available")
            return
        }

        val wm = activity.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)
        captureWidth = (metrics.widthPixels * scale).toInt()
        captureHeight = (metrics.heightPixels * scale).toInt()
        captureDpi = metrics.densityDpi

        if (captureWidth % 2 != 0) captureWidth++
        if (captureHeight % 2 != 0) captureHeight++

        val projectionManager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val intent = projectionManager.createScreenCaptureIntent()

        startActivityForResult(call, intent, "handleProjectionResult")
    }

    @ActivityCallback
    fun handleProjectionResult(call: PluginCall, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            call.reject("Screen capture permission denied")
            return
        }

        val activity = activity ?: run {
            call.reject("Activity not available")
            return
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val serviceIntent = Intent(activity, ScreenCaptureService::class.java)
                activity.startForegroundService(serviceIntent)
            }

            val projectionManager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            mediaProjection = projectionManager.getMediaProjection(result.resultCode, result.data!!)

            mediaProjection?.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    stopCaptureInternal()
                    val obj = JSObject()
                    obj.put("stopped", true)
                    notifyListeners("captureStopped", obj)
                }
            }, null)

            handlerThread = HandlerThread("ScreenCapture").also { it.start() }
            handler = Handler(handlerThread!!.looper)

            imageReader = ImageReader.newInstance(captureWidth, captureHeight, PixelFormat.RGBA_8888, 2)

            virtualDisplay = mediaProjection?.createVirtualDisplay(
                "WordethScreenCapture",
                captureWidth,
                captureHeight,
                captureDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader!!.surface,
                null,
                handler
            )

            isCapturing.set(true)
            startFrameCapture()

            val ret = JSObject()
            ret.put("started", true)
            ret.put("width", captureWidth)
            ret.put("height", captureHeight)
            call.resolve(ret)

        } catch (e: Exception) {
            call.reject("Failed to start screen capture: ${e.message}")
        }
    }

    private fun startFrameCapture() {
        val intervalMs = (1000L / targetFps)
        handler?.post(object : Runnable {
            override fun run() {
                if (!isCapturing.get()) return

                try {
                    val image: Image? = imageReader?.acquireLatestImage()
                    if (image != null) {
                        val plane = image.planes[0]
                        val buffer = plane.buffer
                        val pixelStride = plane.pixelStride
                        val rowStride = plane.rowStride
                        val rowPadding = rowStride - pixelStride * captureWidth

                        val bitmap = Bitmap.createBitmap(
                            captureWidth + rowPadding / pixelStride,
                            captureHeight,
                            Bitmap.Config.ARGB_8888
                        )
                        bitmap.copyPixelsFromBuffer(buffer)
                        image.close()

                        val cropped = if (rowPadding > 0) {
                            Bitmap.createBitmap(bitmap, 0, 0, captureWidth, captureHeight).also {
                                if (it !== bitmap) bitmap.recycle()
                            }
                        } else {
                            bitmap
                        }

                        val stream = ByteArrayOutputStream()
                        cropped.compress(Bitmap.CompressFormat.JPEG, quality, stream)
                        cropped.recycle()

                        val base64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
                        stream.close()

                        val obj = JSObject()
                        obj.put("frame", "data:image/jpeg;base64,$base64")
                        obj.put("width", captureWidth)
                        obj.put("height", captureHeight)
                        notifyListeners("frame", obj)
                    }
                } catch (e: Exception) {
                    // Skip frame on error
                }

                if (isCapturing.get()) {
                    handler?.postDelayed(this, intervalMs)
                }
            }
        })
    }

    @PluginMethod
    fun stopCapture(call: PluginCall) {
        stopCaptureInternal()
        val ret = JSObject()
        ret.put("stopped", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", true)
        ret.put("platform", "android")
        call.resolve(ret)
    }

    private fun stopCaptureInternal() {
        isCapturing.set(false)
        virtualDisplay?.release()
        virtualDisplay = null
        imageReader?.close()
        imageReader = null
        mediaProjection?.stop()
        mediaProjection = null
        handlerThread?.quitSafely()
        handlerThread = null
        handler = null

        try {
            val activity = activity
            if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val serviceIntent = Intent(activity, ScreenCaptureService::class.java)
                activity.stopService(serviceIntent)
            }
        } catch (_: Exception) {}
    }

    override fun handleOnDestroy() {
        stopCaptureInternal()
        super.handleOnDestroy()
    }
}
