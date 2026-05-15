# Android WebView App Design

## Overview

Create a native Android app (`android/`) that wraps the HAPI web app in a WebView, with system-level push notifications via SSE and automatic theme switching when the system dark/light mode changes.

## Architecture

```
┌─── android/ (Kotlin + Gradle) ────────────────────┐
│                                                     │
│  SetupActivity                                      │
│  └─ First launch: input server URL + CLI_API_TOKEN  │
│                                                     │
│  MainActivity                                       │
│  ├─ WebView → http://<ip>:<port>                    │
│  ├─ HapiBridge JS interface (theme query)           │
│  └─ onConfigurationChanged → JS theme callback      │
│                                                     │
│  SseService (Foreground Service)                    │
│  ├─ OkHttp SSE → /api/events?token=<jwt>&toast=all  │
│  ├─ Parses toast events                             │
│  └─ Delegates to NotificationHelper                 │
│                                                     │
│  NotificationHelper                                 │
│  └─ Android system notifications with click action  │
│                                                     │
│  DataStore (preferences)                            │
│  └─ serverUrl, authToken, setupCompleted            │
└─────────────────────────────────────────────────────┘

┌─── Hub changes (minimal) ─────────────────────────┐
│  sseManager.ts  — toastAll flag on connections      │
│  events.ts      — parse toast=all query param       │
└─────────────────────────────────────────────────────┘
```

## Part 1: Hub Side Changes (~20 lines total)

### 1.1 SSESubscription & SSEConnection

Add `toastAll: boolean` field to both types in `hub/src/sse/sseManager.ts`.

### 1.2 SSEManager.subscribe()

Accept and store `toastAll` option. Default `false`.

### 1.3 SSEManager.sendToast()

Current logic only sends to **visible** connections. Change to also send to connections with `toastAll: true`:

```kotlin
// Before:
if (!this.visibilityTracker.isVisibleConnection(connection.id)) continue

// After:
const isVisible = this.visibilityTracker.isVisibleConnection(connection.id)
if (!isVisible && !connection.toastAll) continue
```

This single change makes all 4 notification types (permission, ready, task, completion) automatically reach Android clients — no changes needed in `pushNotificationChannel.ts`.

### 1.4 events.ts Route

Parse `toast` query parameter in `hub/src/web/routes/events.ts`:

```
GET /api/events?token=<jwt>&toast=all
```

Pass `toastAll: true` to `manager.subscribe()` when `toast=all`.

## Part 2: Android App

### 2.1 Project Structure

```
android/
├── app/
│   ├── src/main/
│   │   ├── java/run/hapi/app/
│   │   │   ├── HapiApp.kt              — Application class
│   │   │   ├── MainActivity.kt         — WebView host
│   │   │   ├── SetupActivity.kt        — Server URL + token input
│   │   │   ├── sse/
│   │   │   │   ├── SseService.kt       — Foreground SSE service
│   │   │   │   └── SseParser.kt        — Parse SSE events
│   │   │   └── notify/
│   │   │       └── NotificationHelper.kt — Create system notifications
│   │   ├── res/
│   │   │   ├── layout/
│   │   │   │   ├── activity_main.xml
│   │   │   │   └── activity_setup.xml
│   │   │   └── values/
│   │   │       ├── strings.xml
│   │   │       └── themes.xml
│   │   └── AndroidManifest.xml
│   └── build.gradle.kts
├── build.gradle.kts
├── settings.gradle.kts
└── gradle.properties
```

### 2.2 SetupActivity (first launch)

- Two input fields: server URL (`http://192.168.1.x:3006`) and API token (`CLI_API_TOKEN`)
- "Connect" button
- On submit:
  1. Call `POST /api/auth` with the token to get JWT
  2. Save URL + JWT to DataStore
  3. Start SseService
  4. Navigate to MainActivity
- Subsequent launches skip setup if credentials exist

### 2.3 MainActivity (WebView)

**WebView configuration:**
- JavaScript enabled
- DOM storage enabled
- Mixed content allowed (HTTP from IP)
- WebViewClient handles URL loading within WebView
- WebChromeClient for permission requests

**Theme bridge — HapiBridge:**
```kotlin
class HapiBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun getSystemTheme(): String {
        val nightMode = activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        return if (nightMode == Configuration.UI_MODE_NIGHT_YES) "dark" else "light"
    }
}
```

Added to WebView as `addJavascriptInterface(bridge, "HapiBridge")`.

**Theme change listener:**
```kotlin
override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    val theme = if ((newConfig.uiMode and UI_MODE_NIGHT_MASK) == UI_MODE_NIGHT_YES) "dark" else "light"
    webView.evaluateJavascript(
        "if(window.__hapiOnSystemThemeChange)__hapiOnSystemThemeChange('$theme')", null
    )
}
```

Requires `android:configChanges="uiMode"` in manifest.

### 2.4 SseService (Foreground Service)

**Lifecycle:**
- Started on app launch (after setup)
- Runs as foreground service with persistent notification
- Reconnects with exponential backoff (1s → 30s)

**SSE connection:**
- Uses OkHttp with `EventSource`
- URL: `http://<ip>:<port>/api/events?token=<jwt>&toast=all`
- Parses each SSE `data:` field as JSON
- Filters for `type: "toast"` events
- Delegates to NotificationHelper

**Reconnection:**
- On connection loss, retry with exponential backoff
- Reset backoff on successful connection (via `connection-changed` event)

**Foreground notification:**
- Small persistent notification: "HAPI connected"
- Uses NotificationChannel with low importance

### 2.5 NotificationHelper

**Toast event → Android notification mapping:**

| Toast title | Android notification |
|---|---|
| Permission Request | High priority, sound |
| Ready for input | High priority, sound |
| Task completed / Task failed | Default priority |
| Session completed | Default priority |

Each notification:
- Title: `toast.data.title`
- Body: `toast.data.body`
- Tap action: Open MainActivity, navigate to session
- Grouped by session to avoid flooding

### 2.6 Data Persistence

Use Android Jetpack DataStore (Preferences):
- `server_url: String`
- `auth_token: String` (JWT)
- `api_token: String` (CLI_API_TOKEN for re-auth)

## Data Flow

### Notification Flow

```
Hub NotificationHub
  → PushNotificationChannel.sendReady()
    → pushService.sendToNamespace()  (Web Push - ignored by Android)
    → sseManager.sendToast()
      → SSE connection with toastAll=true
        → Android SseService receives toast event
          → NotificationHelper.showNotification()
            → Android system notification bar
```

### Theme Flow

```
User toggles system dark mode
  → Android onConfigurationChanged()
    → webView.evaluateJavascript("__hapiOnSystemThemeChange('dark')")
      → Web useTheme.ts updates
        → data-theme="dark" applied to <html>
```

## Error Handling

- **Auth failure**: Show error in SetupActivity, let user re-enter credentials
- **SSE disconnect**: Automatic reconnect with backoff; show "Reconnecting..." in foreground notification
- **Server unreachable**: Periodic retry; notify user after 3 consecutive failures
- **JWT expiry**: Re-authenticate using stored CLI_API_TOKEN

## Constraints

- Min SDK: 26 (Android 8.0) — required for NotificationChannels
- Target SDK: 35 (Android 15)
- No Google Play Services dependency
- No Firebase dependency
- Pure HTTP support (no HTTPS required)
- Supports Chinese and other locales via WebView's built-in rendering

## Out of Scope

- FCM integration (can add later as supplementary channel)
- Biometric auth
- File upload from Android to HAPI
- Multiple server profiles
