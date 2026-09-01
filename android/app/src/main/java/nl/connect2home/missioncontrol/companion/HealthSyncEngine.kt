package nl.connect2home.missioncontrol.companion

import java.nio.charset.StandardCharsets
import java.time.Instant
import java.time.temporal.ChronoUnit

internal const val HEALTH_SYNC_BATCH_LIMIT = 100
internal const val HEALTH_SYNC_PAYLOAD_LIMIT_BYTES = 1_048_576

internal sealed interface HealthSyncRecord {
    val source: String
    val externalRecordId: String
    fun toWireJson(): String
}

internal data class WeightSyncRecord(
    val measuredAt: Instant,
    val kilograms: Double,
    override val source: String,
    override val externalRecordId: String,
) : HealthSyncRecord {
    override fun toWireJson(): String = """{"type":"weight","measured_at":"$measuredAt","value":$kilograms,"unit":"kg","source":${jsonString(source)},"external_record_id":${jsonString(externalRecordId)}}"""
}

internal data class ActivitySyncRecord(
    val activityType: String,
    val startedAt: Instant,
    val endedAt: Instant,
    override val source: String,
    override val externalRecordId: String,
    val sourceMetadata: Map<String, String>,
) : HealthSyncRecord {
    override fun toWireJson(): String {
        val startedAt = startedAt.truncatedTo(ChronoUnit.SECONDS)
        val endedAt = endedAt.truncatedTo(ChronoUnit.SECONDS)
        val duration = endedAt.epochSecond - startedAt.epochSecond
        val metadata = sourceMetadata.entries.sortedBy { it.key }
            .joinToString(",") { "${jsonString(it.key)}:${jsonString(it.value)}" }
        return """{"type":"activity","activity_type":${jsonString(activityType)},"started_at":"$startedAt","ended_at":"$endedAt","duration_seconds":$duration,"source":${jsonString(source)},"external_record_id":${jsonString(externalRecordId)},"source_metadata":{$metadata}}"""
    }
}

internal enum class QueueState { PENDING, INVALID }

internal data class QueuedHealthRecord(
    val record: HealthSyncRecord,
    val state: QueueState = QueueState.PENDING,
    val error: String? = null,
)

internal interface HealthConnectGateway {
    fun hasRequiredPermissions(): Boolean
    fun readRecords(windowStart: Instant): List<HealthSyncRecord>
}

internal interface HealthSyncStore {
    fun readQueue(): List<QueuedHealthRecord>
    fun writeQueue(records: List<QueuedHealthRecord>)
    fun readConfirmed(): Map<String, String>
    fun writeConfirmed(records: Map<String, String>)
    fun readWindowStart(): Instant?
    fun writeWindowStart(value: Instant?)
    fun lastSuccessfulSync(): Instant?
    fun writeLastSuccessfulSync(value: Instant)
    fun lastError(): String?
    fun writeLastError(value: String?)
}

internal sealed interface UploadResult {
    data class Completed(val statuses: List<String>, val diagnostics: List<String?> = emptyList()) : UploadResult
    data object AuthInvalid : UploadResult
    data class Unavailable(val message: String) : UploadResult
}

internal interface HealthSyncTransport {
    fun upload(token: String, records: List<HealthSyncRecord>): UploadResult
}

internal sealed interface HealthSyncOutcome {
    data object PermissionMissing : HealthSyncOutcome
    data object RePairRequired : HealthSyncOutcome
    data class Completed(val pendingCount: Int, val invalidCount: Int) : HealthSyncOutcome
    data class Unavailable(val message: String) : HealthSyncOutcome
}

internal class HealthSyncEngine(
    private val gateway: HealthConnectGateway,
    private val store: HealthSyncStore,
    private val transport: HealthSyncTransport,
    private val now: () -> Instant = { Instant.now() },
) {
    fun sync(token: String?): HealthSyncOutcome {
        val permitted = try {
            gateway.hasRequiredPermissions()
        } catch (_: Exception) {
            store.writeLastError("Health Connect niet bereikbaar.")
            return HealthSyncOutcome.Unavailable("Health Connect niet bereikbaar.")
        }
        if (!permitted) {
            store.writeWindowStart(null)
            return HealthSyncOutcome.PermissionMissing
        }
        if (token == null) return HealthSyncOutcome.RePairRequired

        val windowStart = store.readWindowStart() ?: now().minusSeconds(30L * 24 * 60 * 60).also(store::writeWindowStart)
        val confirmed = store.readConfirmed().toMutableMap()
        val records = try {
            gateway.readRecords(windowStart)
        } catch (_: Exception) {
            store.writeLastError("Health Connect lezen is mislukt.")
            return HealthSyncOutcome.Unavailable("Health Connect lezen is mislukt.")
        }
        val queue = merge(store.readQueue(), records, confirmed).toMutableList()
        markOversized(queue)
        store.writeQueue(queue)

        batches(queue.filter { it.state == QueueState.PENDING }.map { it.record }).forEach { batch ->
            when (val response = transport.upload(token, batch)) {
                UploadResult.AuthInvalid -> return HealthSyncOutcome.RePairRequired
                is UploadResult.Unavailable -> {
                    store.writeLastError(response.message)
                    return HealthSyncOutcome.Unavailable(response.message)
                }
                is UploadResult.Completed -> applyResults(queue, confirmed, batch, response.statuses, response.diagnostics)
            }
        }
        store.writeQueue(queue)
        store.writeConfirmed(confirmed)
        store.writeLastSuccessfulSync(now())
        store.writeLastError(null)
        return HealthSyncOutcome.Completed(
            pendingCount = queue.count { it.state == QueueState.PENDING },
            invalidCount = queue.count { it.state == QueueState.INVALID },
        )
    }

    fun pendingCount(): Int = store.readQueue().count { it.state == QueueState.PENDING }

    fun invalidCount(): Int = store.readQueue().count { it.state == QueueState.INVALID }

    private fun merge(
        existing: List<QueuedHealthRecord>,
        fresh: List<HealthSyncRecord>,
        confirmed: MutableMap<String, String>,
    ): List<QueuedHealthRecord> {
        val merged = existing.toMutableList()
        fresh.forEach { record ->
            val key = record.key()
            if (confirmed[key] == record.toWireJson()) return@forEach
            confirmed.remove(key)
            val index = merged.indexOfFirst { it.record.source == record.source && it.record.externalRecordId == record.externalRecordId }
            if (index == -1) merged += QueuedHealthRecord(record)
            else if (
                merged[index].record.toWireJson() != record.toWireJson() ||
                needsDurationMappingRetry(merged[index], record)
            ) merged[index] = QueuedHealthRecord(record)
        }
        return merged
    }

    private fun markOversized(queue: MutableList<QueuedHealthRecord>) {
        queue.indices.filter { queue[it].state == QueueState.PENDING }.forEach { index ->
            if (batchJson(listOf(queue[index].record)).toByteArray(StandardCharsets.UTF_8).size > HEALTH_SYNC_PAYLOAD_LIMIT_BYTES) {
                queue[index] = queue[index].copy(state = QueueState.INVALID, error = "Record overschrijdt payloadlimiet.")
            }
        }
    }

    private fun needsDurationMappingRetry(existing: QueuedHealthRecord, record: HealthSyncRecord): Boolean =
        existing.state == QueueState.INVALID &&
            existing.error == "Backend wees record af." &&
            record is ActivitySyncRecord &&
            (record.startedAt.nano != 0 || record.endedAt.nano != 0)

    private fun batches(records: List<HealthSyncRecord>): List<List<HealthSyncRecord>> {
        val result = mutableListOf<List<HealthSyncRecord>>()
        val current = mutableListOf<HealthSyncRecord>()
        records.forEach { record ->
            val candidate = current + record
            if (candidate.size > HEALTH_SYNC_BATCH_LIMIT || batchJson(candidate).toByteArray(StandardCharsets.UTF_8).size > HEALTH_SYNC_PAYLOAD_LIMIT_BYTES) {
                if (current.isNotEmpty()) result += current.toList()
                current.clear()
            }
            current += record
        }
        if (current.isNotEmpty()) result += current
        return result
    }

    private fun applyResults(
        queue: MutableList<QueuedHealthRecord>,
        confirmed: MutableMap<String, String>,
        batch: List<HealthSyncRecord>,
        statuses: List<String>,
        diagnostics: List<String?>,
    ) {
        batch.forEachIndexed { index, record ->
            when (statuses.getOrNull(index)) {
                "created", "updated", "unchanged" -> {
                    queue.removeAll { it.record.source == record.source && it.record.externalRecordId == record.externalRecordId }
                    confirmed[record.key()] = record.toWireJson()
                }
                "invalid" -> {
                    val queueIndex = queue.indexOfFirst { it.record.source == record.source && it.record.externalRecordId == record.externalRecordId }
                    if (queueIndex >= 0) queue[queueIndex] = queue[queueIndex].copy(
                        state = QueueState.INVALID,
                        error = diagnostics.getOrNull(index) ?: "Backend wees record af.",
                    )
                }
            }
        }
    }

    internal companion object {
        fun batchJson(records: List<HealthSyncRecord>): String = "{\"records\":[${records.joinToString(",") { it.toWireJson() }}]}"
    }
}

internal fun jsonString(value: String): String = buildString {
    append('"')
    value.forEach {
        when (it) {
            '\\' -> append("\\\\")
            '"' -> append("\\\"")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            else -> append(it)
        }
    }
    append('"')
}

private fun HealthSyncRecord.key(): String = "$source\u0000$externalRecordId"
