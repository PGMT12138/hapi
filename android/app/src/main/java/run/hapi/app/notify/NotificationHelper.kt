package run.hapi.app.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import run.hapi.app.MainActivity
import run.hapi.app.R

class NotificationHelper(private val context: Context) {

    companion object {
        const val CHANNEL_SSE = "hapi_sse_v2"
        const val CHANNEL_NOTIFICATIONS = "hapi_notif_v2"
        const val SSE_NOTIFICATION_ID = 1
    }

    private val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    fun createChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Delete old channels to reset settings
            notificationManager.deleteNotificationChannel("hapi_sse")
            notificationManager.deleteNotificationChannel("hapi_notifications")

            val sseChannel = NotificationChannel(
                CHANNEL_SSE,
                context.getString(R.string.sse_notification_channel),
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                setShowBadge(false)
                description = "Persistent connection indicator"
            }

            val notifChannel = NotificationChannel(
                CHANNEL_NOTIFICATIONS,
                context.getString(R.string.notification_channel),
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "HAPI notifications"
                enableVibration(true)
            }

            notificationManager.createNotificationChannels(listOf(sseChannel, notifChannel))
        }
    }

    fun buildForegroundNotification(): android.app.Notification {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(context, CHANNEL_SSE)
            .setContentTitle(context.getString(R.string.sse_notification_title))
            .setContentText(context.getString(R.string.sse_notification_text))
            .setSmallIcon(R.drawable.ic_foreground_notification)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
    }

    fun showNotification(id: Int, title: String, body: String, subText: String?, sessionId: String?) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("sessionId", sessionId)
        }
        val pendingIntent = PendingIntent.getActivity(
            context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val collapsedText = body.substringBefore('\n')

        val notification = NotificationCompat.Builder(context, CHANNEL_NOTIFICATIONS)
            .setContentTitle(title)
            .setSubText(subText)
            .setContentText(collapsedText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        notificationManager.notify(id, notification)
    }
}
