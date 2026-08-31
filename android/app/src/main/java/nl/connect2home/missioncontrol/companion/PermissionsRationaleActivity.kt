package nl.connect2home.missioncontrol.companion

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

class PermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(TextView(this).apply {
            setPadding(48, 48, 48, 48)
            text = getString(R.string.health_permissions_rationale)
            textSize = 18f
        })
    }
}
