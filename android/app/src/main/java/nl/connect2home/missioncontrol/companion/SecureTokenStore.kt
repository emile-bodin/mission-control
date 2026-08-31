package nl.connect2home.missioncontrol.companion

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.GeneralSecurityException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal class SecureTokenStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun read(): String? = try {
        val encryptedToken = preferences.getString(CIPHERTEXT_KEY, null) ?: return null
        val initializationVector = preferences.getString(INITIALIZATION_VECTOR_KEY, null)
        if (initializationVector == null) {
            clear()
            return null
        }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKey(),
            GCMParameterSpec(GCM_TAG_LENGTH_BITS, Base64.decode(initializationVector, Base64.NO_WRAP)),
        )
        String(cipher.doFinal(Base64.decode(encryptedToken, Base64.NO_WRAP)), StandardCharsets.UTF_8)
    } catch (_: GeneralSecurityException) {
        clear()
        null
    } catch (_: IllegalArgumentException) {
        clear()
        null
    }

    fun save(token: String): Boolean = try {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        preferences.edit()
            .putString(CIPHERTEXT_KEY, Base64.encodeToString(cipher.doFinal(token.toByteArray(StandardCharsets.UTF_8)), Base64.NO_WRAP))
            .putString(INITIALIZATION_VECTOR_KEY, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .commit()
    } catch (_: GeneralSecurityException) {
        clear()
        false
    }

    fun clear() {
        preferences.edit()
            .remove(CIPHERTEXT_KEY)
            .remove(INITIALIZATION_VECTOR_KEY)
            .commit()
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).run {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build(),
            )
            generateKey()
        }
    }

    internal companion object {
        const val PREFERENCES_NAME = "secure_device_token"
        private const val KEY_ALIAS = "mission_control_device_token"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val CIPHERTEXT_KEY = "ciphertext"
        private const val INITIALIZATION_VECTOR_KEY = "initialization_vector"
        private const val GCM_TAG_LENGTH_BITS = 128
    }
}
