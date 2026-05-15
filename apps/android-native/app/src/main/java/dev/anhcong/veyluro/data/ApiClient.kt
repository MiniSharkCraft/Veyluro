package dev.anhcong.veyluro.data

import android.util.Log
import dev.anhcong.veyluro.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

private val json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}

@Serializable
data class LoginRequest(
    val username: String,
    val password: String,
    val totpCode: String? = null,
)

@Serializable
data class LoginResponse(
    val token: String,
    val userId: String,
    val username: String,
    val publicKey: String? = null,
)

@Serializable
data class Room(
    val id: String,
    val name: String,
    val type: String,
    val lastMessage: String? = null,
    val unreadCount: Int? = null,
)

@Serializable
data class RoomMember(
    val id: String,
    val username: String,
    val avatarUrl: String? = null,
)

@Serializable
data class Friend(
    val id: String,
    val friendId: String,
    val username: String,
)

@Serializable
data class StartDmRequest(
    val username: String,
)

@Serializable
data class CreateGroupRequest(
    val name: String,
    val members: List<String>,
)

@Serializable
data class AddMemberRequest(
    val username: String,
)

@Serializable
data class RoomCreateResponse(
    val id: String,
    val status: String? = null,
)

@Serializable
data class ChatMessage(
    val id: String,
    val roomId: String,
    val senderId: String,
    val bundle: String,
    val createdAt: Long,
)

@Serializable
data class SendMessageRequest(
    val bundle: String,
    val clientId: String? = null,
)

@Serializable
data class SendMessageResponse(
    val id: String,
    val clientId: String? = null,
)

@Serializable
data class ApiError(
    val error: String? = null,
)

class ApiClient(
    private val baseUrl: String = BuildConfig.API_URL,
    private val client: OkHttpClient = defaultClient(),
) {
    suspend fun login(username: String, passwordHash: String, totpCode: String?): LoginResponse {
        return post(
            path = "/api/auth/login",
            token = null,
            body = LoginRequest(username = username, password = passwordHash, totpCode = totpCode),
        )
    }

    suspend fun rooms(token: String): List<Room> {
        return get(path = "/api/rooms", token = token)
    }

    suspend fun roomMembers(token: String, roomId: String): List<RoomMember> {
        return get(path = "/api/rooms/$roomId/members", token = token)
    }

    suspend fun startDm(token: String, username: String): RoomCreateResponse {
        return post(
            path = "/api/rooms/dm",
            token = token,
            body = StartDmRequest(username = username),
        )
    }

    suspend fun createGroup(token: String, name: String, members: List<String>): RoomCreateResponse {
        return post(
            path = "/api/rooms/group",
            token = token,
            body = CreateGroupRequest(name = name, members = members),
        )
    }

    suspend fun addGroupMember(token: String, roomId: String, username: String): RoomCreateResponse {
        return post(
            path = "/api/rooms/$roomId/members",
            token = token,
            body = AddMemberRequest(username = username),
        )
    }

    suspend fun removeGroupMember(token: String, roomId: String, userId: String): RoomCreateResponse {
        return delete(path = "/api/rooms/$roomId/members/$userId", token = token)
    }

    suspend fun friends(token: String): List<Friend> {
        return get(path = "/api/friends", token = token)
    }

    suspend fun messages(token: String, roomId: String, before: Long? = null): List<ChatMessage> {
        val path = if (before != null) {
            "/api/messages/$roomId?before=$before&limit=50"
        } else {
            "/api/messages/$roomId?limit=50"
        }
        return get(path = path, token = token)
    }

    suspend fun sendMessage(token: String, roomId: String, bundle: String): SendMessageResponse {
        return post(
            path = "/api/messages/$roomId",
            token = token,
            body = SendMessageRequest(bundle = bundle),
        )
    }

    private suspend inline fun <reified T> get(path: String, token: String?): T {
        return request(path = path, token = token, bodyJson = null)
    }

    private suspend inline fun <reified Req, reified Res> post(
        path: String,
        token: String?,
        body: Req,
    ): Res {
        return request(path = path, token = token, bodyJson = json.encodeToString(body))
    }

    private suspend inline fun <reified T> delete(path: String, token: String?): T {
        return request(path = path, token = token, bodyJson = "", method = "DELETE")
    }

    private suspend inline fun <reified T> request(
        path: String,
        token: String?,
        bodyJson: String?,
        method: String = "GET",
    ): T = withContext(Dispatchers.IO) {
        val requestBuilder = Request.Builder()
            .url(baseUrl.trimEnd('/') + path)

        if (token != null) {
            requestBuilder.header("Authorization", "Bearer $token")
        }

        if (method == "DELETE") {
            requestBuilder.delete()
        } else if (bodyJson == null) {
            requestBuilder.get()
        } else {
            requestBuilder
                .header("Content-Type", "application/json")
                .post(bodyJson.toRequestBody("application/json".toMediaType()))
        }

        client.newCall(requestBuilder.build()).execute().use { response ->
            val responseBody = response.body?.string().orEmpty()
            Log.d("VeyluroApi", "[$method] $path -> ${response.code}")
            if (!response.isSuccessful) {
                val apiError = runCatching { json.decodeFromString<ApiError>(responseBody) }.getOrNull()
                Log.e("VeyluroApi", "[$method] $path failed: ${apiError?.error ?: response.message}")
                throw IOException(apiError?.error ?: response.message)
            }
            json.decodeFromString(responseBody)
        }
    }
}

private fun defaultClient(): OkHttpClient {
    return OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
}
