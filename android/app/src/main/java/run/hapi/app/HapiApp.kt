package run.hapi.app

import android.app.Application
import run.hapi.app.data.AppPreferences

class HapiApp : Application() {
    val preferences by lazy { AppPreferences(this) }
}
