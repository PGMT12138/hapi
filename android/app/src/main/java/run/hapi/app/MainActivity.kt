package run.hapi.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import run.hapi.app.sse.SseService
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

class MainActivity : AppCompatActivity() {

    companion object {
        private const val REQUEST_POST_NOTIFICATIONS = 1001
        private const val REQUEST_AUDIO_PERMISSION = 1002
    }

    private lateinit var webView: WebView
    private var pendingPermissionRequest: PermissionRequest? = null
    private var cachedServerUrl: String? = null
    private var cachedApiToken: String? = null
    private var filePathCallback: android.webkit.ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments()
    ) { uris: List<Uri> ->
        filePathCallback?.onReceiveValue(uris.toTypedArray())
        filePathCallback = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        setupWebView()

        requestNotificationPermission()
        requestAudioPermission()
        ensureSseServiceRunning()

        lifecycleScope.launch {
            val prefs = (application as HapiApp).preferences
            val url = prefs.getServerUrl()
            val apiToken = prefs.getApiToken()
            cachedServerUrl = url
            cachedApiToken = apiToken

            if (url != null && apiToken != null) {
                loadWithToken(url, apiToken, intent?.getStringExtra("sessionId"))
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val sessionId = intent.getStringExtra("sessionId") ?: return
        val url = cachedServerUrl ?: return

        val currentUrl = webView.url
        if (currentUrl != null && currentUrl.startsWith(url)) {
            // WebView already loaded — navigate within SPA without full reload
            webView.evaluateJavascript(
                "window.history.pushState(null,'','$url/sessions/$sessionId');window.dispatchEvent(new PopStateEvent('popstate'))",
                null
            )
        } else {
            // WebView not loaded yet — full load with token
            val token = cachedApiToken ?: return
            loadWithToken(url, token, sessionId)
        }
    }

    override fun onDestroy() {
        nativeAudioBridge.stop()
        webView.destroy()
        super.onDestroy()
    }

    private fun loadWithToken(baseUrl: String, apiToken: String, sessionId: String?) {
        val path = if (sessionId != null) "/sessions/$sessionId" else ""
        webView.loadUrl("${baseUrl}${path}?token=${apiToken}")
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    REQUEST_POST_NOTIFICATIONS
                )
            }
        }
    }

    private fun requestAudioPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.RECORD_AUDIO),
                REQUEST_AUDIO_PERMISSION
            )
        }
    }

    private fun ensureSseServiceRunning() {
        val intent = Intent(this, SseService::class.java).apply {
            action = SseService.ACTION_START
        }
        startForegroundService(intent)
    }

    private val nativeAudioBridge = SttAudioBridge()

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            allowFileAccess = false
            allowContentAccess = false
        }

        webView.addJavascriptInterface(HapiThemeBridge(), "HapiBridge")
        webView.addJavascriptInterface(nativeAudioBridge, "SttAudioBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedSslError(
                view: WebView?,
                handler: android.webkit.SslErrorHandler,
                error: android.net.http.SslError?
            ) {
                handler.proceed()
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val host = request.url.host
                val serverUrl = cachedServerUrl

                if (serverUrl != null && host != null) {
                    val serverHost = java.net.URL(serverUrl).host
                    if (host == serverHost) {
                        return false
                    }
                }

                // Open external links in system browser
                if (request.url.scheme == "https" || request.url.scheme == "http") {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, request.url)
                        startActivity(intent)
                    } catch (_: Exception) {
                        Toast.makeText(this@MainActivity, "无法打开链接", Toast.LENGTH_SHORT).show()
                    }
                }
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                val level = consoleMessage.messageLevel()
                val tag = "HapiWebView"
                val msg = "${consoleMessage.sourceId()}:${consoleMessage.lineNumber()} - ${consoleMessage.message()}"
                when (level) {
                    ConsoleMessage.MessageLevel.ERROR -> Log.e(tag, msg)
                    ConsoleMessage.MessageLevel.WARNING -> Log.w(tag, msg)
                    else -> {}
                }
                return true
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                callback.invoke(origin, false, false)
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val resources = request.resources.toList()
                    Log.d("HapiWebView", "onPermissionRequest: resources=$resources")
                    if (resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        if (ContextCompat.checkSelfPermission(
                                this@MainActivity, Manifest.permission.RECORD_AUDIO
                            ) == PackageManager.PERMISSION_GRANTED
                        ) {
                            Log.d("HapiWebView", "Audio permission already granted, granting request")
                            request.grant(request.resources)
                        } else {
                            Log.d("HapiWebView", "Audio permission not granted, requesting...")
                            pendingPermissionRequest = request
                            ActivityCompat.requestPermissions(
                                this@MainActivity,
                                arrayOf(Manifest.permission.RECORD_AUDIO),
                                REQUEST_AUDIO_PERMISSION
                            )
                        }
                    } else {
                        Log.d("HapiWebView", "No audio capture resource, denying")
                        request.deny()
                    }
                }
            }

            override fun onShowFileChooser(
                webView: WebView,
                callback: android.webkit.ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                try {
                    fileChooserLauncher.launch(arrayOf("*/*"))
                } catch (e: Exception) {
                    filePathCallback = null
                    callback.onReceiveValue(null)
                    Toast.makeText(this@MainActivity, "无法打开文件选择器", Toast.LENGTH_SHORT).show()
                }
                return true
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            REQUEST_AUDIO_PERMISSION -> {
                val request = pendingPermissionRequest
                pendingPermissionRequest = null
                if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    request?.grant(request.resources)
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new Event('__hapiAudioPermissionGranted'))",
                        null
                    )
                } else {
                    request?.deny()
                }
            }
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val nightMode = newConfig.uiMode and Configuration.UI_MODE_NIGHT_MASK
        val theme = if (nightMode == Configuration.UI_MODE_NIGHT_YES) "dark" else "light"
        webView.evaluateJavascript(
            "if(window.__hapiOnSystemThemeChange)__hapiOnSystemThemeChange('$theme')",
            null
        )
    }

    @Deprecated("Use OnBackPressedCallback instead")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    inner class HapiThemeBridge {
        @JavascriptInterface
        fun getSystemTheme(): String {
            val nightMode = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
            return if (nightMode == Configuration.UI_MODE_NIGHT_YES) "dark" else "light"
        }

        @JavascriptInterface
        fun isNativeApp(): String = "true"

        @JavascriptInterface
        fun openSettings() {
            runOnUiThread {
                val intent = Intent(this@MainActivity, SetupActivity::class.java)
                intent.putExtra("reconfigure", true)
                startActivity(intent)
                finish()
            }
        }

        @JavascriptInterface
        fun downloadFile(url: String, filename: String) {
            lifecycleScope.launch {
                val result = downloadWithOkHttp(url, filename)
                withContext(Dispatchers.Main) {
                    if (result) {
                        Toast.makeText(this@MainActivity, "已下载 $filename", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@MainActivity, "下载失败", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    private val trustAllClient: OkHttpClient by lazy {
        val trustManager = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        }
        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, arrayOf(trustManager), SecureRandom())
        OkHttpClient.Builder()
            .sslSocketFactory(sslContext.socketFactory, trustManager)
            .hostnameVerifier { _, _ -> true }
            .build()
    }

    private suspend fun downloadWithOkHttp(url: String, filename: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder().url(url).build()
            val response = trustAllClient.newCall(request).execute()
            if (!response.isSuccessful) {
                Log.e("HapiBridge", "Download failed: HTTP ${response.code}")
                return@withContext false
            }
            val body = response.body ?: return@withContext false

            val contentValues = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, filename)
                put(MediaStore.Downloads.MIME_TYPE, "application/octet-stream")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val contentUri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                ?: return@withContext false

            contentResolver.openOutputStream(contentUri)?.use { out ->
                body.byteStream().use { input -> input.copyTo(out) }
            } ?: return@withContext false

            contentValues.clear()
            contentValues.put(MediaStore.Downloads.IS_PENDING, 0)
            contentResolver.update(contentUri, contentValues, null, null)

            Log.d("HapiBridge", "Downloaded: $filename")
            true
        } catch (e: Exception) {
            Log.e("HapiBridge", "Download failed", e)
            false
        }
    }

    /**
     * Native audio recording bridge for STT.
     * Bypasses WebView's broken getUserMedia implementation on some devices.
     * Records PCM 16-bit mono 16kHz and delivers base64-encoded chunks to JavaScript.
     */
    inner class SttAudioBridge {
        private var audioRecord: AudioRecord? = null
        @Volatile
        private var isRecording = false
        private var recordingThread: Thread? = null

        @JavascriptInterface
        fun isAvailable(): Boolean {
            return ContextCompat.checkSelfPermission(
                this@MainActivity, Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
        }

        @JavascriptInterface
        fun start(): Boolean {
            if (isRecording) return true

            val sampleRate = 16000
            val channelConfig = AudioFormat.CHANNEL_IN_MONO
            val audioFormat = AudioFormat.ENCODING_PCM_16BIT
            val minBufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
            if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
                Log.e("SttAudioBridge", "getMinBufferSize failed: $minBufferSize")
                return false
            }

            // Use larger buffer to reduce evaluateJavascript frequency (~100ms chunks)
            val bufferSize = minBufferSize * 4
            try {
                audioRecord = AudioRecord(
                    MediaRecorder.AudioSource.VOICE_RECOGNITION,
                    sampleRate,
                    channelConfig,
                    audioFormat,
                    bufferSize
                )
            } catch (e: Exception) {
                Log.e("SttAudioBridge", "AudioRecord creation failed", e)
                return false
            }

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e("SttAudioBridge", "AudioRecord not initialized")
                audioRecord?.release()
                audioRecord = null
                return false
            }

            try {
                audioRecord?.startRecording()
            } catch (e: Exception) {
                Log.e("SttAudioBridge", "startRecording failed", e)
                audioRecord?.release()
                audioRecord = null
                return false
            }

            isRecording = true
            Log.d("SttAudioBridge", "Recording started")

            recordingThread = Thread({
                val readSize = minBufferSize * 2  // ~100ms of audio per read
                val buffer = ShortArray(readSize)
                while (isRecording) {
                    val read = audioRecord?.read(buffer, 0, readSize) ?: -1
                    if (read <= 0 || !isRecording) break

                    // Convert shorts to bytes
                    val bytes = ByteArray(read * 2)
                    for (i in 0 until read) {
                        bytes[i * 2] = (buffer[i].toInt() and 0xFF).toByte()
                        bytes[i * 2 + 1] = (buffer[i].toInt() shr 8).toByte()
                    }

                    val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    runOnUiThread {
                        webView.evaluateJavascript(
                            "if(window.__onSttAudioData)window.__onSttAudioData('$b64')",
                            null
                        )
                    }
                }
            }, "SttAudioRecorder")
            recordingThread?.start()
            return true
        }

        @JavascriptInterface
        fun stop() {
            if (!isRecording) return
            isRecording = false
            try {
                recordingThread?.join(2000)
            } catch (_: InterruptedException) {}
            recordingThread = null
            try {
                audioRecord?.stop()
            } catch (_: Exception) {}
            audioRecord?.release()
            audioRecord = null
            Log.d("SttAudioBridge", "Recording stopped")
        }

        @JavascriptInterface
        fun requestPermission() {
            if (ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.RECORD_AUDIO
                ) == PackageManager.PERMISSION_GRANTED
            ) return

            runOnUiThread {
                ActivityCompat.requestPermissions(
                    this@MainActivity,
                    arrayOf(Manifest.permission.RECORD_AUDIO),
                    REQUEST_AUDIO_PERMISSION
                )
            }
        }
    }
}
