package dev.anhcong.veyluro.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.sessionDataStore by preferencesDataStore(name = "session")

data class Session(
    val token: String,
    val userId: String,
    val username: String,
)

class SessionStore(private val context: Context) {
    private val tokenKey = stringPreferencesKey("token")
    private val userIdKey = stringPreferencesKey("user_id")
    private val usernameKey = stringPreferencesKey("username")

    val session: Flow<Session?> = context.sessionDataStore.data.map { prefs ->
        val token = prefs[tokenKey]
        val userId = prefs[userIdKey]
        val username = prefs[usernameKey]
        if (token.isNullOrBlank() || userId.isNullOrBlank() || username.isNullOrBlank()) {
            null
        } else {
            Session(token = token, userId = userId, username = username)
        }
    }

    suspend fun save(response: LoginResponse) {
        context.sessionDataStore.edit { prefs ->
            prefs[tokenKey] = response.token
            prefs[userIdKey] = response.userId
            prefs[usernameKey] = response.username
        }
    }

    suspend fun clear() {
        context.sessionDataStore.edit { prefs -> prefs.clear() }
    }
}
