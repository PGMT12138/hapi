package run.hapi.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import run.hapi.app.sse.SseService

class MainActivity : AppCompatActivity() {

    companion object {
        private const val REQUEST_POST_NOTIFICATIONS = 1001
    }

    private lateinit var webView: WebView
    private var cachedServerUrl: String? = null
    private var cachedApiToken: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        setupWebView()

        requestNotificationPermission()
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

    private fun ensureSseServiceRunning() {
        val intent = Intent(this, SseService::class.java).apply {
            action = SseService.ACTION_START
        }
        startForegroundService(intent)
    }

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

        webView.webViewClient = object : WebViewClient() {
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

                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                return true
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                callback.invoke(origin, false, false)
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { request.deny() }
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
    }
}
