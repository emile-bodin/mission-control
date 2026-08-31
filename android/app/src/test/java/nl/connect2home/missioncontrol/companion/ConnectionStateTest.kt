package nl.connect2home.missioncontrol.companion

import org.junit.Assert.assertEquals
import org.junit.Test

class ConnectionStateTest {
    @Test
    fun `without a token status is unpaired`() {
        assertEquals(ConnectionState.UNPAIRED, stateForStatus(tokenPresent = false, httpStatus = null))
    }

    @Test
    fun `successful status check is paired`() {
        assertEquals(ConnectionState.PAIRED, stateForStatus(tokenPresent = true, httpStatus = 200))
    }

    @Test
    fun `unauthorized status is invalid authentication`() {
        assertEquals(ConnectionState.AUTH_INVALID, stateForStatus(tokenPresent = true, httpStatus = 401))
    }

    @Test
    fun `missing response is backend unavailable`() {
        assertEquals(ConnectionState.BACKEND_UNREACHABLE, stateForStatus(tokenPresent = true, httpStatus = null))
    }
}
