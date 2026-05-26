-keepattributes *Annotation*
-keep class run.hapi.app.** { *; }

# OkHttp SSE - no consumer ProGuard rules in okhttp-sse jar
-keep class okhttp3.sse.** { *; }
-keep class okhttp3.internal.sse.** { *; }
