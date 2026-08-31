package nl.connect2home.missioncontrol.companion

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var tokenStore: SecureTokenStore
    private val client = MissionControlClient()

    private lateinit var statusText: TextView
    private lateinit var statusDetail: TextView
    private lateinit var pairingCode: EditText
    private lateinit var pairButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tokenStore = SecureTokenStore(applicationContext)
        statusText = findViewById(R.id.status_text)
        statusDetail = findViewById(R.id.status_detail)
        pairingCode = findViewById(R.id.pairing_code)
        pairButton = findViewById(R.id.pair_button)

        pairButton.setOnClickListener { pair() }
        findViewById<Button>(R.id.check_button).setOnClickListener { refreshStatus() }
        refreshStatus()
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
