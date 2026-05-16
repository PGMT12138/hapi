package run.hapi.app.sse

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import org.json.JSONObject
import run.hapi.app.HapiApp
import run.hapi.app.notify.NotificationHelper
import java.util.concurrent.TimeUnit

class SseService : LifecycleService() {

    companion object {
        const val ACTION_START = "run.hapi.app.action.START_SSE"
        const val ACTION_STOP = "run.hapi.app.action.STOP_SSE"

        private const val TAG = "SseService"
        private const val BASE_BACKOFF_MS = 1000L
        private const val MAX_BACKOFF_MS = 30_000L
        private const val JITTER_MS = 500L
        private const val JWT_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000L
    }

    private lateinit var notificationHelper: NotificationHelper
    private lateinit var client: OkHttpClient
    private lateinit var authClient: OkHttpClient
    private var eventSource: EventSource? = null
    private var connectJob: Job? = null
    private var refreshJob: Job? = null
    private var backoffMs = BASE_BACKOFF_MS
    private var notificationId = 2

    override fun onCreate() {
        super.onCreate()
        notificationHelper = NotificationHelper(this)
        notificationHelper.createChannels()
        client = OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .connectTimeout(10, TimeUnit.SECONDS)
            .build()
        authClient = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .build()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)

        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        startForeground(
            NotificationHelper.SSE_NOTIFICATION_ID,
            notificationHelper.buildForegroundNotification()
        )

        logNotificationPermission()
        connect()
        startJwtRefresh()
        return START_STICKY
    }

    private fun logNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            Log.d(TAG, "POST_NOTIFICATIONS permission: $granted")
        } else {
            Log.d(TAG, "POST_NOTIFICATIONS permission: not required (API ${Build.VERSION.SDK_INT})")
        }
    }

    override fun onDestroy() {
        connectJob?.cancel()
        refreshJob?.cancel()
        eventSource?.cancel()
        super.onDestroy()
    }

    private fun connect() {
        connectJob?.cancel()
        connectJob = lifecycleScope.launch {
            val app = application as HapiApp
            val serverUrl = app.preferences.getServerUrl()
            val apiToken = app.preferences.getApiToken()

            if (serverUrl == null) {
                Log.e(TAG, "No server URL configured")
                return@launch
            }
            if (apiToken == null) {
                Log.e(TAG, "No API token configured")
                return@launch
            }

            Log.d(TAG, "Connecting to ${serverUrl}/api/events ...")

            val jwt = refreshToken(serverUrl, apiToken)
            if (jwt == null) {
                Log.e(TAG, "Failed to authenticate, scheduling reconnect")
                scheduleReconnect()
                return@launch
            }

            Log.d(TAG, "Auth successful, JWT length=${jwt.length}")

            val url = "${serverUrl}/api/events?token=${jwt}&toast=all&visibility=visible"
            val request = Request.Builder().url(url).build()

            val oldSource = eventSource
            eventSource = null
            oldSource?.cancel()

            eventSource = EventSources.createFactory(client)
                .newEventSource(request, object : EventSourceListener() {

                    override fun onOpen(eventSource: EventSource, response: Response) {
                        Log.d(TAG, "SSE connected (HTTP ${response.code})")
                        backoffMs = BASE_BACKOFF_MS
                    }

                    override fun onEvent(
                        eventSource: EventSource,
                        id: String?,
                        type: String?,
                        data: String
                    ) {
                        Log.d(TAG, "SSE event: type=$type, data_len=${data.length}")
                        handleEvent(data)
                    }

                    override fun onFailure(
                        eventSource: EventSource,
                        t: Throwable?,
                        response: Response?
                    ) {
                        val code = response?.code
                        val body = try { response?.body?.string()?.take(200) } catch (_: Exception) { null }
                        Log.w(TAG, "SSE failure: code=$code, error=${t?.message}, body=$body")
                        if (code == 401) {
                            Log.d(TAG, "Auth expired, forcing immediate reconnect with fresh JWT")
                            this@SseService.eventSource?.cancel()
                            this@SseService.eventSource = null
                            backoffMs = BASE_BACKOFF_MS
                            connect()
                        } else {
                            scheduleReconnect()
                        }
                    }

                    override fun onClosed(eventSource: EventSource) {
                        Log.d(TAG, "SSE closed, reconnecting")
                        connect()
                    }
                })
        }
    }

    private suspend fun refreshToken(serverUrl: String, apiToken: String): String? {
        return withContext(Dispatchers.IO) {
            try {
                val body = JSONObject().apply { put("accessToken", apiToken) }
                val request = Request.Builder()
                    .url("${serverUrl.trimEnd('/')}/api/auth")
                    .post(body.toString().toRequestBody("application/json".toMediaType()))
                    .build()

                val response = authClient.newCall(request).execute()
                if (!response.isSuccessful) {
                    Log.e(TAG, "Auth failed: ${response.code}")
                    return@withContext null
                }

                val responseBody = response.body?.string() ?: return@withContext null
                JSONObject(responseBody).getString("token")
            } catch (e: Exception) {
                Log.e(TAG, "Auth error: ${e.message}")
                null
            }
        }
    }

    private fun startJwtRefresh() {
        refreshJob?.cancel()
        refreshJob = lifecycleScope.launch {
            while (isActive) {
                delay(JWT_REFRESH_INTERVAL_MS)
                Log.d(TAG, "Proactive JWT refresh")
                connect()
            }
        }
    }

    private val titleTranslations = mapOf(
        "Permission Request" to "权限请求",
        "Ready for input" to "等待输入",
        "Task completed" to "任务完成",
        "Task failed" to "任务失败",
        "Session completed" to "会话完成"
    )

    private fun handleEvent(data: String) {
        try {
            val json = JSONObject(data)
            val type = json.optString("type")

            if (type == "toast") {
                val toastData = json.getJSONObject("data")
                val rawTitle = toastData.getString("title")
                val title = titleTranslations[rawTitle] ?: rawTitle
                val body = toastData.optString("body").ifBlank { "" }
                val sessionId = toastData.optString("sessionId").ifBlank { null }

                Log.d(TAG, "Showing notification: title=$title, sessionId=$sessionId")
                notificationHelper.showNotification(
                    notificationId++,
                    title,
                    body,
                    sessionId
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to handle event: ${e.message}, data=${data.take(100)}")
        }
    }

    private fun scheduleReconnect() {
        if (!lifecycleScope.isActive) return

        lifecycleScope.launch {
            val jitter = (Math.random() * JITTER_MS * 2 - JITTER_MS).toLong()
            delay(backoffMs + jitter)
            backoffMs = (backoffMs * 2).coerceAtMost(MAX_BACKOFF_MS)
            connect()
        }
    }
}
