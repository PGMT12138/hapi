# Android WebView App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an Android WebView app that wraps the HAPI web app with system-level notifications via SSE and automatic theme switching.

**Architecture:** Hub gains a `toast=all` SSE parameter so native clients always receive toast events. Android app uses a Foreground Service with OkHttp SSE to maintain a persistent connection. WebView loads the web app directly; theme changes are bridged via JavaScript interfaces.

**Tech Stack:** Kotlin, Gradle, OkHttp, Jetpack DataStore, AndroidX WebKit, Foreground Service

**Spec:** `docs/superpowers/specs/2026-05-15-android-webview-design.md`

---

## File Map

### Hub (modify)
| File | Change |
|------|--------|
| `hub/src/sse/sseManager.ts` | Add `toastAll` to types, update `subscribe()` and `sendToast()` |
| `hub/src/web/routes/events.ts` | Parse `toast=all` query param, pass to `subscribe()` |

### Android (create)
| File | Responsibility |
|------|----------------|
| `android/settings.gradle.kts` | Gradle project settings |
| `android/build.gradle.kts` | Root build config |
| `android/gradle.properties` | Gradle properties |
| `android/gradle/wrapper/gradle-wrapper.properties` | Gradle wrapper version |
| `android/app/build.gradle.kts` | App module dependencies |
| `android/app/src/main/AndroidManifest.xml` | Permissions, activities, service |
| `android/app/src/main/res/values/strings.xml` | String resources |
| `android/app/src/main/res/values/colors.xml` | Color resources |
| `android/app/src/main/res/values/themes.xml` | App theme |
| `android/app/src/main/res/xml/network_security_config.xml` | Allow HTTP for IP addresses |
| `android/app/src/main/res/layout/activity_setup.xml` | Setup screen layout |
| `android/app/src/main/res/layout/activity_main.xml` | Main WebView layout |
| `android/app/src/main/java/run/hapi/app/HapiApp.kt` | Application class |
| `android/app/src/main/java/run/hapi/app/data/AppPreferences.kt` | DataStore for URL + tokens |
| `android/app/src/main/java/run/hapi/app/notify/NotificationHelper.kt` | Create Android notifications |
| `android/app/src/main/java/run/hapi/app/sse/SseService.kt` | Foreground SSE service |
| `android/app/src/main/java/run/hapi/app/SetupActivity.kt` | First-launch setup screen |
| `android/app/src/main/java/run/hapi/app/MainActivity.kt` | WebView host + theme bridge |

---

## Phase 1: Hub Side — SSE `toast=all`

### Task 1: Add `toastAll` to SSEManager types and logic

**Files:**
- Modify: `hub/src/sse/sseManager.ts`

- [ ] **Step 1: Add `toastAll` field to `SSESubscription` type (line 5-11)**

Replace the type definition:

```typescript
export type SSESubscription = {
    id: string
    namespace: string
    all: boolean
    toastAll: boolean
    sessionId: string | null
    machineId: string | null
}
```

- [ ] **Step 2: Update `subscribe()` method (line 29-63) to accept and store `toastAll`**

In the `subscribe()` method, add `toastAll` to the subscription object and return value. The method signature gets `toastAll?: boolean` added to the options:

```typescript
subscribe(options: {
    id: string
    namespace: string
    all?: boolean
    toastAll?: boolean
    sessionId?: string | null
    machineId?: string | null
    visibility?: VisibilityState
    send: (event: SyncEvent) => void | Promise<void>
    sendHeartbeat: () => void | Promise<void>
}): SSESubscription {
    const subscription: SSEConnection = {
        id: options.id,
        namespace: options.namespace,
        all: Boolean(options.all),
        toastAll: Boolean(options.toastAll),
        sessionId: options.sessionId ?? null,
        machineId: options.machineId ?? null,
        send: options.send,
        sendHeartbeat: options.sendHeartbeat
    }

    this.connections.set(subscription.id, subscription)
    this.visibilityTracker.registerConnection(
        subscription.id,
        subscription.namespace,
        options.visibility ?? 'hidden'
    )
    this.ensureHeartbeat()
    return {
        id: subscription.id,
        namespace: subscription.namespace,
        all: subscription.all,
        toastAll: subscription.toastAll,
        sessionId: subscription.sessionId,
        machineId: subscription.machineId
    }
}
```

- [ ] **Step 3: Update `sendToast()` method (line 73-105) to include `toastAll` connections**

Replace the visibility check at line 79:

```typescript
async sendToast(namespace: string, event: Extract<SyncEvent, { type: 'toast' }>): Promise<number> {
    const deliveries: Array<Promise<{ id: string; ok: boolean }>> = []
    for (const connection of this.connections.values()) {
        if (connection.namespace !== namespace) {
            continue
        }
        const isVisible = this.visibilityTracker.isVisibleConnection(connection.id)
        if (!isVisible && !connection.toastAll) {
            continue
        }

        deliveries.push(
            Promise.resolve(connection.send(event))
                .then(() => ({ id: connection.id, ok: true }))
                .catch(() => ({ id: connection.id, ok: false }))
        )
    }

    if (deliveries.length === 0) {
        return 0
    }

    const results = await Promise.all(deliveries)
    let successCount = 0
    for (const result of results) {
        if (result.ok) {
            successCount += 1
            continue
        }
        this.unsubscribe(result.id)
    }

    return successCount
}
```

- [ ] **Step 4: Run typecheck**

Run: `cd /home/projects/hapi && bun run typecheck:hub`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(hub): add toastAll flag to SSE subscriptions for native clients
```

---

### Task 2: Parse `toast=all` in events route

**Files:**
- Modify: `hub/src/web/routes/events.ts`

- [ ] **Step 1: Add `toastAll` parsing after line 49**

After `const all = parseBoolean(query.all)` add:

```typescript
const toastAll = query.toast === 'all'
```

- [ ] **Step 2: Pass `toastAll` to `manager.subscribe()` call (line 81-100)**

Add `toastAll` to the subscribe options:

```typescript
manager.subscribe({
    id: subscriptionId,
    namespace,
    all,
    toastAll,
    sessionId: resolvedSessionId,
    machineId,
    visibility,
    send: (event) => stream.writeSSE({ data: JSON.stringify(event) }),
    sendHeartbeat: async () => {
        await stream.writeSSE({
            data: JSON.stringify({
                type: 'heartbeat',
                namespace,
                data: {
                    timestamp: Date.now()
                }
            })
        })
    }
})
```

- [ ] **Step 3: Run typecheck**

Run: `cd /home/projects/hapi && bun run typecheck:hub`
Expected: PASS

- [ ] **Step 4: Run hub tests**

Run: `cd /home/projects/hapi && bun run test:hub`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(hub): parse toast=all query param in SSE events endpoint
```

---

## Phase 2: Android Project Scaffold

### Task 3: Create Gradle project structure

**Files:**
- Create: `android/settings.gradle.kts`
- Create: `android/build.gradle.kts`
- Create: `android/gradle.properties`
- Create: `android/gradle/wrapper/gradle-wrapper.properties`
- Create: `android/app/build.gradle.kts`

- [ ] **Step 1: Create `android/settings.gradle.kts`**

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolution {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "hapi-android"
include(":app")
```

- [ ] **Step 2: Create `android/build.gradle.kts`**

```kotlin
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
}
```

- [ ] **Step 3: Create `android/gradle.properties`**

```properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
```

- [ ] **Step 4: Create `android/gradle/wrapper/gradle-wrapper.properties`**

```properties
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.11.1-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
```

- [ ] **Step 5: Create `android/app/build.gradle.kts`**

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "run.hapi.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "run.hapi.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:okhttp-sse:4.12.0")
    implementation("com.google.android.material:material:1.12.0")
}
```

- [ ] **Step 6: Create `android/app/proguard-rules.pro`**

```
-keepattributes *Annotation*
-keep class run.hapi.app.** { *; }
```

- [ ] **Step 7: Commit**

```
chore(android): scaffold Gradle project structure
```

---

### Task 4: Create Android resources and manifest

**Files:**
- Create: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/res/values/strings.xml`
- Create: `android/app/src/main/res/values/colors.xml`
- Create: `android/app/src/main/res/values/themes.xml`
- Create: `android/app/src/main/res/xml/network_security_config.xml`
- Create: `android/app/src/main/res/layout/activity_setup.xml`
- Create: `android/app/src/main/res/layout/activity_main.xml`

- [ ] **Step 1: Create `AndroidManifest.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />

    <application
        android:name=".HapiApp"
        android:allowBackup="false"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:networkSecurityConfig="@xml/network_security_config"
        android:theme="@style/Theme.Hapi">

        <activity
            android:name=".SetupActivity"
            android:exported="true"
            android:label="@string/title_setup">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <activity
            android:name=".MainActivity"
            android:configChanges="uiMode|orientation|screenSize"
            android:exported="false" />

        <service
            android:name=".sse.SseService"
            android:foregroundServiceType="dataSync"
            android:exported="false" />

    </application>

</manifest>
```

- [ ] **Step 2: Create `res/values/strings.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">HAPI</string>
    <string name="title_setup">Setup</string>
    <string name="hint_server_url">Server URL (e.g. http://192.168.1.100:3006)</string>
    <string name="hint_api_token">API Token (CLI_API_TOKEN)</string>
    <string name="btn_connect">Connect</string>
    <string name="error_empty_url">Please enter server URL</string>
    <string name="error_empty_token">Please enter API token</string>
    <string name="error_connection_failed">Connection failed. Check URL and token.</string>
    <string name="sse_notification_channel">HAPI Connection</string>
    <string name="sse_notification_title">HAPI Connected</string>
    <string name="sse_notification_text">Listening for notifications…</string>
    <string name="notification_channel">HAPI Notifications</string>
</resources>
```

- [ ] **Step 3: Create `res/values/colors.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="black">#FF000000</color>
    <color name="white">#FFFFFFFF</color>
    <color name="primary">#FF1A1A2E</color>
    <color name="primary_dark">#FF16213E</color>
    <color name="accent">#FF0F3460</color>
</resources>
```

- [ ] **Step 4: Create `res/values/themes.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.Hapi" parent="Theme.MaterialComponents.DayNight.NoActionBar">
        <item name="colorPrimary">@color/primary</item>
        <item name="colorPrimaryDark">@color/primary_dark</item>
        <item name="colorAccent">@color/accent</item>
    </style>
</resources>
```

- [ ] **Step 5: Create `res/xml/network_security_config.xml`**

This allows HTTP connections to IP addresses (required since HAPI runs without HTTPS):

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

- [ ] **Step 6: Create `res/layout/activity_setup.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<ScrollView xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:fillViewport="true"
    android:padding="24dp">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="vertical"
        android:gravity="center_vertical">

        <TextView
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:text="HAPI"
            android:textSize="32sp"
            android:textStyle="bold"
            android:layout_marginBottom="8dp" />

        <TextView
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:text="Connect to your HAPI server"
            android:textSize="16sp"
            android:layout_marginBottom="32dp"
            android:alpha="0.7" />

        <com.google.android.material.textfield.TextInputLayout
            android:id="@+id/serverUrlLayout"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginBottom="16dp"
            android:hint="@string/hint_server_url">

            <com.google.android.material.textfield.TextInputEditText
                android:id="@+id/serverUrl"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:inputType="textUri"
                android:singleLine="true" />

        </com.google.android.material.textfield.TextInputLayout>

        <com.google.android.material.textfield.TextInputLayout
            android:id="@+id/apiTokenLayout"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginBottom="24dp"
            android:hint="@string/hint_api_token">

            <com.google.android.material.textfield.TextInputEditText
                android:id="@+id/apiToken"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:inputType="textPassword"
                android:singleLine="true" />

        </com.google.android.material.textfield.TextInputLayout>

        <com.google.android.material.button.MaterialButton
            android:id="@+id/btnConnect"
            android:layout_width="match_parent"
            android:layout_height="48dp"
            android:text="@string/btn_connect" />

        <TextView
            android:id="@+id/errorText"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textColor="?attr/colorError"
            android:visibility="gone"
            android:layout_marginTop="16dp" />

    </LinearLayout>
</ScrollView>
```

- [ ] **Step 7: Create `res/layout/activity_main.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <WebView
        android:id="@+id/webView"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

    <ProgressBar
        android:id="@+id/progressBar"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_gravity="center"
        android:visibility="gone" />

</FrameLayout>
```

- [ ] **Step 8: Commit**

```
chore(android): add manifest, resources, and layouts
```

---

## Phase 3: Android Core Logic

### Task 5: Application class and DataStore preferences

**Files:**
- Create: `android/app/src/main/java/run/hapi/app/HapiApp.kt`
- Create: `android/app/src/main/java/run/hapi/app/data/AppPreferences.kt`

- [ ] **Step 1: Create `HapiApp.kt`**

```kotlin
package run.hapi.app

import android.app.Application
import run.hapi.app.data.AppPreferences

class HapiApp : Application() {
    val preferences by lazy { AppPreferences(this) }
}
```

- [ ] **Step 2: Create `AppPreferences.kt`**

```kotlin
package run.hapi.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "hapi_prefs")

class AppPreferences(private val context: Context) {

    companion object {
        private val KEY_SERVER_URL = stringPreferencesKey("server_url")
        private val KEY_AUTH_TOKEN = stringPreferencesKey("auth_token")
        private val KEY_API_TOKEN = stringPreferencesKey("api_token")
    }

    val serverUrl: Flow<String?> = context.dataStore.data.map { it[KEY_SERVER_URL] }
    val authToken: Flow<String?> = context.dataStore.data.map { it[KEY_AUTH_TOKEN] }
    val apiToken: Flow<String?> = context.dataStore.data.map { it[KEY_API_TOKEN] }

    val isConfigured: Flow<Boolean> = context.dataStore.data.map { prefs ->
        !prefs[KEY_SERVER_URL].isNullOrBlank() && !prefs[KEY_AUTH_TOKEN].isNullOrBlank()
    }

    suspend fun saveConfig(serverUrl: String, authToken: String, apiToken: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_SERVER_URL] = serverUrl.trimEnd('/')
            prefs[KEY_AUTH_TOKEN] = authToken
            prefs[KEY_API_TOKEN] = apiToken
        }
    }

    suspend fun getServerUrl(): String? = serverUrl.first()
    suspend fun getAuthToken(): String? = authToken.first()
    suspend fun getApiToken(): String? = apiToken.first()

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
```

- [ ] **Step 3: Commit**

```
feat(android): add Application class and DataStore preferences
```

---

### Task 6: NotificationHelper

**Files:**
- Create: `android/app/src/main/java/run/hapi/app/notify/NotificationHelper.kt`

- [ ] **Step 1: Create `NotificationHelper.kt`**

```kotlin
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
        const val CHANNEL_SSE = "hapi_sse"
        const val CHANNEL_NOTIFICATIONS = "hapi_notifications"
        const val SSE_NOTIFICATION_ID = 1
        const val GROUP_KEY = "run.hapi.app.NOTIFICATIONS"
    }

    private val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    fun createChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val sseChannel = NotificationChannel(
                CHANNEL_SSE,
                context.getString(R.string.sse_notification_channel),
                NotificationManager.IMPORTANCE_LOW
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
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setSilent(true)
            .build()
    }

    fun showNotification(id: Int, title: String, body: String, sessionId: String?) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("sessionId", sessionId)
        }
        val pendingIntent = PendingIntent.getActivity(
            context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_NOTIFICATIONS)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setGroup(GROUP_KEY)
            .build()

        notificationManager.notify(id, notification)
    }
}
```

- [ ] **Step 2: Commit**

```
feat(android): add NotificationHelper with channel setup and toast display
```

---

### Task 7: SseService — Foreground SSE service

**Files:**
- Create: `android/app/src/main/java/run/hapi/app/sse/SseService.kt`

- [ ] **Step 1: Create `SseService.kt`**

```kotlin
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
import run.hapi.app.MainActivity
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
```

- [ ] **Step 2: Commit**

```
feat(android): add SseService with foreground notification and reconnect
```

---

### Task 8: SetupActivity — Server URL and token input

**Files:**
- Create: `android/app/src/main/java/run/hapi/app/SetupActivity.kt`

- [ ] **Step 1: Create `SetupActivity.kt`**

```kotlin
package run.hapi.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import run.hapi.app.data.AppPreferences
import run.hapi.app.sse.SseService

class SetupActivity : AppCompatActivity() {

    private lateinit var preferences: AppPreferences
    private lateinit var serverUrlInput: TextInputEditText
    private lateinit var apiTokenInput: TextInputEditText
    private lateinit var btnConnect: MaterialButton
    private lateinit var errorText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        preferences = (application as HapiApp).preferences

        lifecycleScope.launch {
            if (preferences.isConfigured.first()) {
                startMain()
                return@launch
            }

            setContentView(R.layout.activity_setup)
            bindViews()
        }
    }

    private fun bindViews() {
        serverUrlInput = findViewById(R.id.serverUrl)
        apiTokenInput = findViewById(R.id.apiToken)
        btnConnect = findViewById(R.id.btnConnect)
        errorText = findViewById(R.id.errorText)

        btnConnect.setOnClickListener { connect() }
    }

    private fun connect() {
        val url = serverUrlInput.text?.toString()?.trim()
        val token = apiTokenInput.text?.toString()?.trim()

        if (url.isNullOrBlank()) {
            showError(getString(R.string.error_empty_url))
            return
        }
        if (token.isNullOrBlank()) {
            showError(getString(R.string.error_empty_token))
            return
        }

        btnConnect.isEnabled = false
        errorText.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val jwt = authenticate(url, token)
                preferences.saveConfig(url, jwt, token)
                startSseService()
                startMain()
            } catch (_: Exception) {
                showError(getString(R.string.error_connection_failed))
            } finally {
                btnConnect.isEnabled = true
            }
        }
    }

    private suspend fun authenticate(serverUrl: String, apiToken: String): String {
        return withContext(Dispatchers.IO) {
            val client = OkHttpClient()
            val body = JSONObject().apply {
                put("token", apiToken)
            }
            val request = Request.Builder()
                .url("${serverUrl.trimEnd('/')}/api/auth")
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            if (!response.isSuccessful) {
                throw Exception("Auth failed: ${response.code}")
            }

            val responseBody = response.body?.string()
                ?: throw Exception("Empty response")
            JSONObject(responseBody).getString("token")
        }
    }

    private fun startSseService() {
        val intent = Intent(this, SseService::class.java).apply {
            action = SseService.ACTION_START
        }
        startForegroundService(intent)
    }

    private fun startMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    private fun showError(message: String) {
        errorText.text = message
        errorText.visibility = View.VISIBLE
    }
}
```

- [ ] **Step 2: Commit**

```
feat(android): add SetupActivity with server URL and token auth
```

---

### Task 9: MainActivity — WebView with theme bridge

**Files:**
- Create: `android/app/src/main/java/run/hapi/app/MainActivity.kt`

- [ ] **Step 1: Create `MainActivity.kt`**

```kotlin
package run.hapi.app

import android.annotation.SuppressLint
import android.content.res.Configuration
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
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        setupWebView()

        lifecycleScope.launch {
            val url = (application as HapiApp).preferences.getServerUrl()
            if (url != null) {
                webView.loadUrl(url)
            }
        }

        handleNotificationIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleNotificationIntent(intent)
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
                val serverUrl = (application as HapiApp).preferences.getServerUrl()

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
                callback.invoke(origin, false)
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

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    private fun handleNotificationIntent(intent: Intent?) {
        val sessionId = intent?.getStringExtra("sessionId") ?: return
        val serverUrl = (application as HapiApp).preferences.getServerUrl() ?: return
        webView.loadUrl("$serverUrl/sessions/$sessionId")
    }

    inner class HapiThemeBridge {
        @JavascriptInterface
        fun getSystemTheme(): String {
            val nightMode = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
            return if (nightMode == Configuration.UI_MODE_NIGHT_YES) "dark" else "light"
        }
    }
}
```

- [ ] **Step 2: Commit**

```
feat(android): add MainActivity with WebView and theme bridge
```

---

## Phase 4: Verification

### Task 10: Type check and manual verification

- [ ] **Step 1: Run Hub typecheck**

Run: `cd /home/projects/hapi && bun run typecheck:hub`
Expected: PASS

- [ ] **Step 2: Run Hub tests**

Run: `cd /home/projects/hapi && bun run test:hub`
Expected: PASS

- [ ] **Step 3: Verify Android project builds**

Run: `cd /home/projects/hapi/android && ./gradlew assembleDebug`
Expected: BUILD SUCCESSFUL (requires Android SDK)

- [ ] **Step 4: Update `.gitignore` with Android exclusions**

Add to project `.gitignore`:

```
# Android
android/.gradle/
android/build/
android/app/build/
android/local.properties
```

- [ ] **Step 5: Final commit**

```
feat(android): complete Android WebView app with SSE notifications and theme bridge
```
