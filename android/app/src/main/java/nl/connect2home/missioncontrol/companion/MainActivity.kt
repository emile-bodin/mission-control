package nl.connect2home.missioncontrol.companion

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.PermissionController
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

class MainActivity : ComponentActivity() {
    private lateinit var tokenStore: SecureTokenStore
    private val client = MissionControlClient()
    private lateinit var healthStore: SharedPreferencesHealthSyncStore
    private lateinit var healthGateway: AndroidHealthConnectGateway
    private lateinit var healthSyncEngine: HealthSyncEngine

    private lateinit var statusText: TextView
    private lateinit var statusDetail: TextView
    private lateinit var pairingCode: EditText
    private lateinit var pairButton: Button
    private lateinit var healthStatusText: TextView
    private lateinit var healthDetailText: TextView
    private lateinit var healthPermissionButton: Button
    private lateinit var healthSyncButton: Button

    private val healthPermissionRequest = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) { refreshHealthStatus() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tokenStore = SecureTokenStore(applicationContext)
        healthStore = SharedPreferencesHealthSyncStore(applicationContext)
        healthGateway = AndroidHealthConnectGateway(applicationContext)
        healthSyncEngine = HealthSyncEngine(
            gateway = healthGateway,
            store = healthStore,
            transport = object : HealthSyncTransport {
                override fun upload(token: String, records: List<HealthSyncRecord>): UploadResult = client.sync(token, records)
            },
        )
        statusText = findViewById(R.id.status_text)
        statusDetail = findViewById(R.id.status_detail)
        pairingCode = findViewById(R.id.pairing_code)
        pairButton = findViewById(R.id.pair_button)
        healthStatusText = findViewById(R.id.health_status_text)
        healthDetailText = findViewById(R.id.health_detail_text)
        healthPermissionButton = findViewById(R.id.health_permission_button)
        healthSyncButton = findViewById(R.id.health_sync_button)

        pairButton.setOnClickListener { pair() }
        findViewById<Button>(R.id.check_button).setOnClickListener { refreshStatus() }
        healthPermissionButton.setOnClickListener { healthPermissionRequest.launch(AndroidHealthConnectGateway.REQUIRED_PERMISSIONS) }
        healthSyncButton.setOnClickListener { syncHealth() }
        refreshStatus()
        refreshHealthStatus()
    }

    private fun pair() {
        val code = pairingCode.text.toString().trim()
        if (code.isEmpty()) {
            render(ConnectionState.UNPAIRED, "Voer een pairingcode in.")
            return
        }

        setPairingInProgress(true)
        Thread {
            val result = client.pair(code)
            runOnUiThread {
                setPairingInProgress(false)
                when (result) {
                    is PairingResult.Success -> {
                        if (tokenStore.save(result.token)) {
                            pairingCode.text?.clear()
                            render(ConnectionState.PAIRED, "Gekoppeld als ${result.deviceName}.")
                        } else {
                            render(ConnectionState.UNPAIRED, "Veilige tokenopslag is niet beschikbaar.")
                        }
                    }
                    PairingResult.Rejected -> render(ConnectionState.UNPAIRED, "Pairingcode is ongeldig, verlopen of tijdelijk geblokkeerd.")
                    PairingResult.BackendUnavailable -> render(ConnectionState.BACKEND_UNREACHABLE, "Backend niet bereikbaar. Probeer later opnieuw.")
                }
            }
        }.start()
    }

    private fun refreshStatus() {
        val token = tokenStore.read()
        if (token == null) {
            render(ConnectionState.UNPAIRED, "Nog niet gekoppeld.")
            return
        }

        render(ConnectionState.BACKEND_UNREACHABLE, "Status wordt gecontroleerd…")
        Thread {
            val result = client.status(token)
            runOnUiThread {
                when (result) {
                    is StatusResult.Connected -> render(ConnectionState.PAIRED, "Gekoppeld als ${result.deviceName}.")
                    StatusResult.AuthInvalid -> {
                        tokenStore.clear()
                        render(ConnectionState.AUTH_INVALID, "Authenticatie ongeldig of ingetrokken. Koppel opnieuw.")
                    }
                    StatusResult.BackendUnavailable -> render(ConnectionState.BACKEND_UNREACHABLE, "Backend niet bereikbaar. Probeer later opnieuw.")
                }
            }
        }.start()
    }

    private fun setPairingInProgress(inProgress: Boolean) {
        pairButton.isEnabled = !inProgress
        pairingCode.isEnabled = !inProgress
    }

    private fun syncHealth() {
        healthSyncButton.isEnabled = false
        renderHealthDetail("Synchronisatie wordt uitgevoerd…")
        Thread {
            val outcome = healthSyncEngine.sync(tokenStore.read())
            runOnUiThread {
                healthSyncButton.isEnabled = true
                if (outcome == HealthSyncOutcome.RePairRequired) {
                    tokenStore.clear()
                    render(ConnectionState.AUTH_INVALID, "Authenticatie ongeldig of ingetrokken. Koppel opnieuw.")
                }
                refreshHealthStatus()
            }
        }.start()
    }

    private fun refreshHealthStatus() {
        Thread {
            val permitted = healthGateway.hasRequiredPermissions()
            val pending = healthSyncEngine.pendingCount()
            val invalid = healthSyncEngine.invalidCount()
            val successful = healthStore.lastSuccessfulSync()
            val error = healthStore.lastError()
            runOnUiThread {
                healthStatusText.text = if (permitted) "Toestemming verleend" else "Geen toestemming"
                healthPermissionButton.isEnabled = !permitted
                healthSyncButton.isEnabled = permitted
                val lastSync = successful?.let { "Laatste sync: ${formatTime(it)}." } ?: "Nog niet gesynchroniseerd."
                val invalidText = if (invalid == 0) "" else " Ongeldige records: $invalid."
                renderHealthDetail("$lastSync Openstaand: $pending.$invalidText${error?.let { " Fout: $it" } ?: ""}")
            }
        }.start()
    }

    private fun renderHealthDetail(detail: String) {
        healthDetailText.text = detail
    }

    private fun formatTime(value: Instant): String = DateTimeFormatter
        .ofPattern("d MMM HH:mm", Locale("nl", "NL"))
        .withZone(ZoneId.of("Europe/Amsterdam"))
        .format(value)

    private fun render(state: ConnectionState, detail: String) {
        statusText.text = when (state) {
            ConnectionState.UNPAIRED -> "Niet gekoppeld"
            ConnectionState.PAIRED -> "Gekoppeld"
            ConnectionState.BACKEND_UNREACHABLE -> "Backend niet bereikbaar"
            ConnectionState.AUTH_INVALID -> "Authenticatie ongeldig"
        }
        statusDetail.text = detail
    }
}
