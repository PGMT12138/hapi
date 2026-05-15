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
import kotlinx.coroutines.flow.first
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
