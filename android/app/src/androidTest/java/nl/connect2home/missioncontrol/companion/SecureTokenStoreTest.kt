package nl.connect2home.missioncontrol.companion

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import android.content.pm.ApplicationInfo
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SecureTokenStoreTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val store = SecureTokenStore(context)

    @After
    fun clearToken() {
        store.clear()
    }

    @Test
    fun storesOnlyCiphertextAndCanClearToken() {
        val token = "device-token-for-instrumentation-test"

        assertEquals(true, store.save(token))
        assertEquals(token, store.read())

        val storedValues = context.getSharedPreferences(SecureTokenStore.PREFERENCES_NAME, 0).all.values
        assertFalse(storedValues.contains(token))

        store.clear()
        assertNull(store.read())
    }

    @Test
    fun disablesApplicationBackups() {
        val appInfo = context.packageManager.getApplicationInfo(context.packageName, 0)
        assertEquals(0, appInfo.flags and ApplicationInfo.FLAG_ALLOW_BACKUP)
    }
}
