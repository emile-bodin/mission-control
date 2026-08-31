package nl.connect2home.missioncontrol.companion

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

internal class SharedPreferencesHealthSyncStore(context: Context) : HealthSyncStore {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    override fun readQueue(): List<QueuedHealthRecord> = try {
        val values = JSONArray(preferences.getString(QUEUE_KEY, "[]"))
        buildList {
            for (index in 0 until values.length()) add(parseEntry(values.getJSONObject(index)))
        }
    } catch (_: Exception) {
        emptyList()
    }

    override fun writeQueue(records: List<QueuedHealthRecord>) {
        val values = JSONArray()
        records.forEach { entry ->
            val value = JSONObject()
                .put("state", entry.state.name)
                .put("error", entry.error ?: JSONObject.NULL)
                .put("record", serializeRecord(entry.record))
            values.put(value)
        }
        preferences.edit().putString(QUEUE_KEY, values.toString()).commit()
    }

    override fun readConfirmed(): Map<String, String> = try {
        val values = JSONObject(preferences.getString(CONFIRMED_KEY, "{}") ?: "{}")
        values.keys().asSequence().associateWith { values.getString(it) }
    } catch (_: Exception) {
        emptyMap()
    }

    override fun writeConfirmed(records: Map<String, String>) {
        preferences.edit().putString(CONFIRMED_KEY, JSONObject(records).toString()).commit()
    }

    override fun readWindowStart(): Instant? = preferences.getString(WINDOW_START_KEY, null)?.let {
        runCatching { Instant.parse(it) }.getOrNull()
    }

    override fun writeWindowStart(value: Instant?) {
        preferences.edit().apply {
            if (value == null) remove(WINDOW_START_KEY) else putString(WINDOW_START_KEY, value.toString())
        }.commit()
    }

    override fun lastSuccessfulSync(): Instant? = preferences.getString(LAST_SUCCESS_KEY, null)?.let {
        runCatching { Instant.parse(it) }.getOrNull()
    }

    override fun writeLastSuccessfulSync(value: Instant) {
        preferences.edit().putString(LAST_SUCCESS_KEY, value.toString()).commit()
    }

    override fun lastError(): String? = preferences.getString(LAST_ERROR_KEY, null)

    override fun writeLastError(value: String?) {
        preferences.edit().apply {
            if (value == null) remove(LAST_ERROR_KEY) else putString(LAST_ERROR_KEY, value)
        }.commit()
    }

    private fun parseEntry(value: JSONObject): QueuedHealthRecord = QueuedHealthRecord(
        record = parseRecord(value.getJSONObject("record")),
        state = QueueState.valueOf(value.optString("state", QueueState.PENDING.name)),
        error = value.optString("error").takeIf { it.isNotBlank() },
    )

    private fun parseRecord(value: JSONObject): HealthSyncRecord = when (value.getString("type")) {
        "weight" -> WeightSyncRecord(
            measuredAt = Instant.parse(value.getString("measuredAt")),
            kilograms = value.getDouble("kilograms"),
            source = value.getString("source"),
            externalRecordId = value.getString("externalRecordId"),
        )
        "activity" -> ActivitySyncRecord(
            activityType = value.getString("activityType"),
            startedAt = Instant.parse(value.getString("startedAt")),
            endedAt = Instant.parse(value.getString("endedAt")),
            source = value.getString("source"),
            externalRecordId = value.getString("externalRecordId"),
            sourceMetadata = value.getJSONObject("sourceMetadata").keys().asSequence().associateWith {
                value.getJSONObject("sourceMetadata").getString(it)
            },
        )
        else -> throw IllegalArgumentException("Unsupported queued health record")
    }

    private fun serializeRecord(record: HealthSyncRecord): JSONObject = when (record) {
        is WeightSyncRecord -> JSONObject()
            .put("type", "weight")
            .put("measuredAt", record.measuredAt.toString())
            .put("kilograms", record.kilograms)
            .put("source", record.source)
            .put("externalRecordId", record.externalRecordId)
        is ActivitySyncRecord -> JSONObject()
            .put("type", "activity")
            .put("activityType", record.activityType)
            .put("startedAt", record.startedAt.toString())
            .put("endedAt", record.endedAt.toString())
            .put("source", record.source)
            .put("externalRecordId", record.externalRecordId)
            .put("sourceMetadata", JSONObject(record.sourceMetadata))
    }

    private companion object {
        const val PREFERENCES_NAME = "health_sync_queue"
        const val QUEUE_KEY = "queue"
        const val CONFIRMED_KEY = "confirmed"
        const val WINDOW_START_KEY = "read_window_start"
        const val LAST_SUCCESS_KEY = "last_success"
        const val LAST_ERROR_KEY = "last_error"
    }
}
