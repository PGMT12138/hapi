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
