package nl.connect2home.missioncontrol.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class HealthSyncEngineTest {
    private val now = Instant.parse("2026-08-31T10:00:00Z")

    @Test
    fun `permission denied neither reads nor uploads`() {
        val gateway = FakeGateway(permitted = false, records = listOf(weight("one")))
        val transport = FakeTransport()

        assertEquals(HealthSyncOutcome.PermissionMissing, engine(gateway, FakeStore(), transport).sync("token"))
        assertEquals(0, gateway.reads)
        assertTrue(transport.calls.isEmpty())
    }

    @Test
    fun `weight and activity map to HYD 174 payload`() {
        val records = listOf(weight("weight-id"), activity("activity-id"))
        val transport = FakeTransport()

        engine(FakeGateway(records = records), FakeStore(), transport).sync("token")

        val payload = HealthSyncEngine.batchJson(transport.calls.single())
        assertTrue(payload.contains("\"type\":\"weight\""))
        assertTrue(payload.contains("\"unit\":\"kg\""))
        assertTrue(payload.contains("\"type\":\"activity\""))
        assertTrue(payload.contains("\"duration_seconds\":1800"))
        assertTrue(payload.contains("\"data_origin\""))
    }

    @Test
    fun `fractional activity timestamps map to an exact whole second interval`() {
        val record = activity("fractional").copy(
            startedAt = now.minusSeconds(1800).plusMillis(100),
            endedAt = now.plusMillis(200),
        )

        val payload = record.toWireJson()

        assertTrue(payload.contains("\"duration_seconds\":1800"))
        assertTrue(payload.contains("\"started_at\":\"2026-08-31T09:30:00Z\""))
        assertTrue(payload.contains("\"ended_at\":\"2026-08-31T10:00:00Z\""))
    }

    @Test
    fun `duplicate Health Connect record is not uploaded again`() {
        val store = FakeStore()
        val transport = FakeTransport()
        val sync = engine(FakeGateway(records = listOf(weight("same"))), store, transport)

        sync.sync("token")
        sync.sync("token")

        assertEquals(1, transport.calls.size)
        assertTrue(store.readQueue().isEmpty())
    }

    @Test
    fun `offline queue survives retry and app restart`() {
        val store = FakeStore()
        val offline = FakeTransport(responses = mutableListOf(UploadResult.Unavailable("offline")))
        assertTrue(engine(FakeGateway(records = listOf(weight("queued"))), store, offline).sync("token") is HealthSyncOutcome.Unavailable)
        assertEquals(1, store.readQueue().size)

        val online = FakeTransport()
        val restarted = engine(FakeGateway(records = emptyList()), store, online)
        assertTrue(restarted.sync("token") is HealthSyncOutcome.Completed)
        assertEquals(1, online.calls.size)
        assertTrue(store.readQueue().isEmpty())
    }

    @Test
    fun `partial results retain failed record and confirm successful record`() {
        val store = FakeStore()
        val transport = FakeTransport(responses = mutableListOf(UploadResult.Completed(listOf("created", "failed"))))

        engine(FakeGateway(records = listOf(weight("accepted"), weight("retry"))), store, transport).sync("token")

        assertEquals(listOf("retry"), store.readQueue().map { it.record.externalRecordId })
        assertEquals(1, store.readConfirmed().size)
    }

    @Test
    fun `unchanged removes pending record and invalid is terminal`() {
        val unchangedStore = FakeStore()
        engine(FakeGateway(records = listOf(weight("unchanged"))), unchangedStore, FakeTransport(
            responses = mutableListOf(UploadResult.Completed(listOf("unchanged"))),
        )).sync("token")
        assertTrue(unchangedStore.readQueue().isEmpty())

        val invalidStore = FakeStore()
        val invalidTransport = FakeTransport(responses = mutableListOf(
            UploadResult.Completed(listOf("invalid"), listOf("validation_error:value_error:record")),
        ))
        engine(FakeGateway(records = listOf(weight("invalid"))), invalidStore, invalidTransport).sync("token")
        assertEquals(QueueState.INVALID, invalidStore.readQueue().single().state)
        assertEquals("validation_error:value_error:record", invalidStore.readQueue().single().error)
        engine(FakeGateway(records = listOf(weight("invalid"))), invalidStore, invalidTransport).sync("token")
        assertEquals(1, invalidTransport.calls.size)
    }

    @Test
    fun `old fractional duration invalid activity is retried once`() {
        val record = activity("fractional-invalid").copy(
            startedAt = now.minusSeconds(1800).plusMillis(100),
            endedAt = now.plusMillis(200),
        )
        val store = FakeStore()
        store.writeQueue(listOf(QueuedHealthRecord(record, QueueState.INVALID, "Backend wees record af.")))
        val transport = FakeTransport()

        engine(FakeGateway(records = listOf(record)), store, transport).sync("token")

        assertEquals(1, transport.calls.size)
        assertTrue(store.readQueue().isEmpty())
    }

    @Test
    fun `revoked token requires re-pair and keeps queue`() {
        val store = FakeStore()
        val transport = FakeTransport(responses = mutableListOf(UploadResult.AuthInvalid))

        assertEquals(HealthSyncOutcome.RePairRequired, engine(FakeGateway(records = listOf(weight("auth"))), store, transport).sync("token"))
        assertEquals(1, store.readQueue().size)
    }

    @Test
    fun `batches never exceed 100 records`() {
        val records = (1..101).map { weight("weight-$it") }
        val transport = FakeTransport()

        engine(FakeGateway(records = records), FakeStore(), transport).sync("token")

        assertEquals(listOf(100, 1), transport.calls.map { it.size })
    }

    @Test
    fun `oversized payload is terminal and is never sent`() {
        val oversized = activity("large", "x".repeat(HEALTH_SYNC_PAYLOAD_LIMIT_BYTES))
        val store = FakeStore()
        val transport = FakeTransport()

        val result = engine(FakeGateway(records = listOf(oversized)), store, transport).sync("token")

        assertEquals(HealthSyncOutcome.Completed(0, 1), result)
        assertEquals(QueueState.INVALID, store.readQueue().single().state)
        assertFalse(transport.calls.isNotEmpty())
    }

    private fun engine(gateway: FakeGateway, store: FakeStore, transport: FakeTransport) =
        HealthSyncEngine(gateway, store, transport) { now }

    private fun weight(id: String) = WeightSyncRecord(now, 72.4, "com.example.health", id)

    private fun activity(id: String, origin: String = "com.example.health") = ActivitySyncRecord(
        activityType = "exercise_8",
        startedAt = now.minusSeconds(1800),
        endedAt = now,
        source = "com.example.health",
        externalRecordId = id,
        sourceMetadata = mapOf("data_origin" to origin),
    )
}

private class FakeGateway(
    private val permitted: Boolean = true,
    private val records: List<HealthSyncRecord> = emptyList(),
) : HealthConnectGateway {
    var reads = 0
    override fun hasRequiredPermissions(): Boolean = permitted
    override fun readRecords(windowStart: Instant): List<HealthSyncRecord> = records.also { reads += 1 }
}

private class FakeStore : HealthSyncStore {
    private var queue = emptyList<QueuedHealthRecord>()
    private var confirmed = emptyMap<String, String>()
    private var windowStart: Instant? = null
    private var successful: Instant? = null
    private var error: String? = null
    override fun readQueue(): List<QueuedHealthRecord> = queue
    override fun writeQueue(records: List<QueuedHealthRecord>) { queue = records.toList() }
    override fun readConfirmed(): Map<String, String> = confirmed
    override fun writeConfirmed(records: Map<String, String>) { confirmed = records.toMap() }
    override fun readWindowStart(): Instant? = windowStart
    override fun writeWindowStart(value: Instant?) { windowStart = value }
    override fun lastSuccessfulSync(): Instant? = successful
    override fun writeLastSuccessfulSync(value: Instant) { successful = value }
    override fun lastError(): String? = error
    override fun writeLastError(value: String?) { error = value }
}

private class FakeTransport(
    private val responses: MutableList<UploadResult> = mutableListOf(),
) : HealthSyncTransport {
    val calls = mutableListOf<List<HealthSyncRecord>>()
    override fun upload(token: String, records: List<HealthSyncRecord>): UploadResult {
        calls += records
        return if (responses.isEmpty()) UploadResult.Completed(List(records.size) { "created" }) else responses.removeAt(0)
    }
}
