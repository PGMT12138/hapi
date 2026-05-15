package run.hapi.app.sse

import android.content.Intent
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
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

        private const val BASE_BACKOFF_MS = 1000L
        private const val MAX_BACKOFF_MS = 30_000L
        private const val JITTER_MS = 500L
    }

    private lateinit var notificationHelper: NotificationHelper
    private lateinit var client: OkHttpClient
    private var eventSource: EventSource? = null
    private var connectJob: Job? = null
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

        connect()
        return START_STICKY
    }

    override fun onDestroy() {
        connectJob?.cancel()
        eventSource?.cancel()
        super.onDestroy()
    }

    private fun connect() {
        connectJob?.cancel()
        connectJob = lifecycleScope.launch {
            val app = application as HapiApp
            val serverUrl = app.preferences.getServerUrl() ?: return@launch
            val token = app.preferences.getAuthToken() ?: return@launch

            val url = "${serverUrl}/api/events?token=${token}&toast=all"
            val request = Request.Builder().url(url).build()

            eventSource?.cancel()
            eventSource = EventSources.createFactory(client)
                .newEventSource(request, object : EventSourceListener() {

                    override fun onOpen(eventSource: EventSource, response: Response) {
                        backoffMs = BASE_BACKOFF_MS
                    }

                    override fun onEvent(
                        eventSource: EventSource,
                        id: String?,
                        type: String?,
                        data: String
                    ) {
                        handleEvent(data)
                    }

                    override fun onFailure(
                        eventSource: EventSource,
                        t: Throwable?,
                        response: Response?
                    ) {
                        scheduleReconnect()
                    }

                    override fun onClosed(eventSource: EventSource) {
                        scheduleReconnect()
                    }
                })
        }
    }

    private fun handleEvent(data: String) {
        try {
            val json = JSONObject(data)
            val type = json.optString("type")

            if (type == "toast") {
                val toastData = json.getJSONObject("data")
                val title = toastData.getString("title")
                val body = toastData.getString("body")
                val sessionId = toastData.optString("sessionId")

                notificationHelper.showNotification(
                    notificationId++,
                    title,
                    body,
                    sessionId.ifBlank { null }
                )
            }
        } catch (_: Exception) {
            // Ignore malformed events
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
