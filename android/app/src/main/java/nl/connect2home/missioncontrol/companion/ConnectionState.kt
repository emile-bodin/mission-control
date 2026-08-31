package nl.connect2home.missioncontrol.companion

enum class ConnectionState {
    UNPAIRED,
    PAIRED,
    BACKEND_UNREACHABLE,
    AUTH_INVALID,
}

internal fun stateForStatus(tokenPresent: Boolean, httpStatus: Int?): ConnectionState = when {
    !tokenPresent -> ConnectionState.UNPAIRED
    httpStatus == 200 -> ConnectionState.PAIRED
    httpStatus == 401 -> ConnectionState.AUTH_INVALID
    else -> ConnectionState.BACKEND_UNREACHABLE
}
