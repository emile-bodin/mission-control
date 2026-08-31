package nl.connect2home.missioncontrol.companion

import org.json.JSONException
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.URL
import javax.net.ssl.HttpsURLConnection

internal class MissionControlClient {
    fun pair(pairingCode: String): PairingResult = try {
        val connection = connection("/api/devices/pair", "POST")
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        connection.outputStream.bufferedWriter().use { writer ->
            writer.write(JSONObject().put("pairing_code", pairingCode).toString())
        }

        when (connection.responseCode) {
            201 -> {
                val response = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                val token = response.getString("device_token")
                val deviceName = response.getJSONObject("device").getString("device_name")
                connection.disconnect()
                PairingResult.Success(token, deviceName)
            }
            401, 429 -> {
                connection.disconnect()
                PairingResult.Rejected
            }
            else -> {
                connection.disconnect()
                PairingResult.BackendUnavailable
            }
        }
    } catch (_: IOException) {
        PairingResult.BackendUnavailable
    } catch (_: JSONException) {
        PairingResult.BackendUnavailable
    }

    fun status(token: String): StatusResult = try {
        val connection = connection("/api/devices/me", "GET")
        connection.setRequestProperty("Authorization", "Bearer $token")
        when (stateForStatus(tokenPresent = true, httpStatus = connection.responseCode)) {
            ConnectionState.PAIRED -> {
                val response = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                val deviceName = response.getString("device_name")
                connection.disconnect()
                StatusResult.Connected(deviceName)
            }
            ConnectionState.AUTH_INVALID -> {
                connection.disconnect()
                StatusResult.AuthInvalid
            }
            ConnectionState.BACKEND_UNREACHABLE -> {
                connection.disconnect()
                StatusResult.BackendUnavailable
            }
            ConnectionState.UNPAIRED -> {
                connection.disconnect()
                StatusResult.BackendUnavailable
            }
        }
    } catch (_: IOException) {
        StatusResult.BackendUnavailable
    } catch (_: JSONException) {
        StatusResult.BackendUnavailable
    }

    fun sync(token: String, records: List<HealthSyncRecord>): UploadResult = try {
        val connection = connection("/api/v1/health/sync", "POST")
        connection.doOutput = true
        connection.setRequestProperty("Authorization", "Bearer $token")
        connection.setRequestProperty("Content-Type", "application/json")
        connection.outputStream.bufferedWriter().use { writer ->
            writer.write(HealthSyncEngine.batchJson(records))
        }

        when (connection.responseCode) {
            200 -> {
                val response = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                val statuses = response.getJSONArray("results").statuses()
                connection.disconnect()
                UploadResult.Completed(statuses)
            }
            401 -> {
                connection.disconnect()
                UploadResult.AuthInvalid
            }
            else -> {
                connection.disconnect()
                UploadResult.Unavailable("Synchronisatiebackend niet bereikbaar.")
            }
        }
    } catch (_: IOException) {
        UploadResult.Unavailable("Synchronisatiebackend niet bereikbaar.")
    } catch (_: JSONException) {
        UploadResult.Unavailable("Synchronisatieantwoord is ongeldig.")
    }

    private fun connection(path: String, method: String): HttpsURLConnection =
        (URL("$BASE_URL$path").openConnection() as HttpsURLConnection).apply {
            requestMethod = method
            connectTimeout = TIMEOUT_MILLIS
            readTimeout = TIMEOUT_MILLIS
            setRequestProperty("Accept", "application/json")
        }

    private companion object {
        const val BASE_URL = "https://hera.connect2home.nl"
        const val TIMEOUT_MILLIS = 10_000
    }
}

private fun JSONArray.statuses(): List<String> = buildList {
    for (index in 0 until length()) add(getJSONObject(index).getString("status"))
}

internal sealed interface PairingResult {
    data class Success(val token: String, val deviceName: String) : PairingResult
    data object Rejected : PairingResult
    data object BackendUnavailable : PairingResult
}

internal sealed interface StatusResult {
    data class Connected(val deviceName: String) : StatusResult
    data object AuthInvalid : StatusResult
    data object BackendUnavailable : StatusResult
}
