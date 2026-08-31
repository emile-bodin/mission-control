package nl.connect2home.missioncontrol.companion

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.runBlocking
import java.time.Instant

internal class AndroidHealthConnectGateway(private val context: Context) : HealthConnectGateway {
    override fun hasRequiredPermissions(): Boolean = runBlocking {
        client.permissionController.getGrantedPermissions().containsAll(REQUIRED_PERMISSIONS)
    }

    // Fixed local read-window start is stored after permission grant. Every sync re-reads all data
    // readable since that start; stable Health Connect IDs plus the durable queue make this idempotent.
    override fun readRecords(windowStart: Instant): List<HealthSyncRecord> = runBlocking {
        val range = TimeRangeFilter.between(windowStart, Instant.now())
        readWeights(range) + readExerciseSessions(range)
    }

    private suspend fun readWeights(range: TimeRangeFilter): List<WeightSyncRecord> {
        val records = mutableListOf<WeightSyncRecord>()
        var pageToken: String? = null
        do {
            val response = client.readRecords(
                ReadRecordsRequest(WeightRecord::class, timeRangeFilter = range, pageToken = pageToken),
            )
            response.records.mapNotNullTo(records) { record ->
                record.metadata.id.takeIf { it.isNotBlank() }?.let { id ->
                    WeightSyncRecord(
                        measuredAt = record.time,
                        kilograms = record.weight.inKilograms,
                        source = record.metadata.dataOrigin.packageName.ifBlank { "health-connect" },
                        externalRecordId = id,
                    )
                }
            }
            pageToken = response.pageToken
        } while (pageToken != null)
        return records
    }

    private suspend fun readExerciseSessions(range: TimeRangeFilter): List<ActivitySyncRecord> {
        val records = mutableListOf<ActivitySyncRecord>()
        var pageToken: String? = null
        do {
            val response = client.readRecords(
                ReadRecordsRequest(ExerciseSessionRecord::class, timeRangeFilter = range, pageToken = pageToken),
            )
            response.records.mapNotNullTo(records) { record ->
                record.metadata.id.takeIf { it.isNotBlank() }?.let { id ->
                    ActivitySyncRecord(
                        activityType = "exercise_${record.exerciseType}",
                        startedAt = record.startTime,
                        endedAt = record.endTime,
                        source = record.metadata.dataOrigin.packageName.ifBlank { "health-connect" },
                        externalRecordId = id,
                        sourceMetadata = mapOf("data_origin" to record.metadata.dataOrigin.packageName),
                    )
                }
            }
            pageToken = response.pageToken
        } while (pageToken != null)
        return records
    }

    private val client: HealthConnectClient by lazy { HealthConnectClient.getOrCreate(context) }

    internal companion object {
        val REQUIRED_PERMISSIONS = setOf(
            HealthPermission.getReadPermission(WeightRecord::class),
            HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        )
    }
}
