package dev.anhcong.veyluro

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddComment
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Waves
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.anhcong.veyluro.data.ApiClient
import dev.anhcong.veyluro.data.ChatMessage
import dev.anhcong.veyluro.data.Friend
import dev.anhcong.veyluro.data.LoginResponse
import dev.anhcong.veyluro.data.Room
import dev.anhcong.veyluro.data.RoomMember
import dev.anhcong.veyluro.data.Session
import dev.anhcong.veyluro.data.SessionStore
import dev.anhcong.veyluro.ui.theme.VeyluroTheme
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.Locale

private enum class MainTab(val label: String, val icon: ImageVector) {
    Chats("Chats", Icons.AutoMirrored.Filled.Message),
    Contacts("Contacts", Icons.Filled.Group),
    Calls("Calls", Icons.Filled.Call),
    Me("Me", Icons.Filled.Person),
}

private data class UiMessage(
    val id: String,
    val author: String,
    val body: String,
    val time: String,
    val mine: Boolean,
)

private val bundleJson = Json { ignoreUnknownKeys = true }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val api = ApiClient()
        val sessionStore = SessionStore(applicationContext)

        setContent {
            VeyluroTheme {
                val session by sessionStore.session.collectAsState(initial = null)
                AppRoot(
                    api = api,
                    session = session,
                    saveSession = sessionStore::save,
                    clearSession = sessionStore::clear,
                )
            }
        }
    }
}

@Composable
private fun AppRoot(
    api: ApiClient,
    session: Session?,
    saveSession: suspend (LoginResponse) -> Unit,
    clearSession: suspend () -> Unit,
) {
    if (session == null) {
        LoginScreen(api = api, saveSession = saveSession)
    } else {
        FullShell(api = api, session = session, clearSession = clearSession)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FullShell(
    api: ApiClient,
    session: Session,
    clearSession: suspend () -> Unit,
) {
    var currentTab by remember { mutableStateOf(MainTab.Chats) }
    var selectedRoom by remember { mutableStateOf<Room?>(null) }

    Scaffold(
        contentWindowInsets = WindowInsets.safeDrawing,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
                title = {
                    Column {
                        Text("Veyluro", fontWeight = FontWeight.Bold)
                        Text(
                            if (selectedRoom == null) "@${session.username}" else selectedRoom!!.name,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    if (selectedRoom != null) {
                        TextButton(onClick = { selectedRoom = null }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
            )
        },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                MainTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = currentTab == tab,
                        onClick = {
                            currentTab = tab
                            if (tab != MainTab.Chats) selectedRoom = null
                        },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) },
                        colors = NavigationBarItemDefaults.colors(
                            indicatorColor = MaterialTheme.colorScheme.surfaceVariant,
                        ),
                    )
                }
            }
        },
    ) { inner ->
        when {
            currentTab == MainTab.Chats && selectedRoom == null -> {
                ChatsTab(
                    modifier = Modifier.padding(inner),
                    api = api,
                    session = session,
                    onOpenRoom = { selectedRoom = it },
                )
            }
            currentTab == MainTab.Chats -> {
                RoomDetailScreen(
                    modifier = Modifier.padding(inner),
                    api = api,
                    session = session,
                    room = selectedRoom!!,
                )
            }
            currentTab == MainTab.Contacts -> {
                ContactsTab(
                    modifier = Modifier.padding(inner),
                    api = api,
                    session = session,
                )
            }
            currentTab == MainTab.Calls -> CallsTab(modifier = Modifier.padding(inner))
            currentTab == MainTab.Me -> {
                MeTab(
                    modifier = Modifier.padding(inner),
                    session = session,
                    clearSession = clearSession,
                )
            }
        }
    }
}

@Composable
private fun LoginScreen(
    api: ApiClient,
    saveSession: suspend (LoginResponse) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var username by remember { mutableStateOf("") }
    var passwordHash by remember { mutableStateOf("") }
    var totp by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.padding(18.dp)) {
                    Text("Veyluro", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Text(
                        "Private flow messaging.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(18.dp))
                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Username") },
                        singleLine = true,
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = passwordHash,
                        onValueChange = { passwordHash = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Password hash") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = totp,
                        onValueChange = { totp = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("2FA code") },
                        singleLine = true,
                    )
                    if (error != null) {
                        Spacer(Modifier.height(10.dp))
                        Text(error.orEmpty(), color = MaterialTheme.colorScheme.error)
                    }
                    Spacer(Modifier.height(18.dp))
                    Button(
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !loading && username.isNotBlank() && passwordHash.isNotBlank(),
                        onClick = {
                            scope.launch {
                                loading = true
                                error = null
                                try {
                                    saveSession(
                                        api.login(
                                            username = username.trim(),
                                            passwordHash = passwordHash,
                                            totpCode = totp.ifBlank { null },
                                        ),
                                    )
                                } catch (t: Throwable) {
                                    error = t.message ?: "Login failed"
                                } finally {
                                    loading = false
                                }
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary,
                        ),
                    ) { if (loading) CircularProgressIndicator() else Text("Enter") }
                }
            }
        }
    }
}

@Composable
private fun ChatsTab(
    modifier: Modifier,
    api: ApiClient,
    session: Session,
    onOpenRoom: (Room) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var rooms by remember { mutableStateOf<List<Room>>(emptyList()) }
    var dmInput by remember { mutableStateOf("") }
    var groupName by remember { mutableStateOf("") }
    var groupMembers by remember { mutableStateOf("") }

    val reload: suspend () -> Unit = {
        loading = true
        error = null
        try {
            rooms = api.rooms(session.token)
        } catch (t: Throwable) {
            error = t.message ?: "Failed to load rooms"
        } finally {
            loading = false
        }
    }

    LaunchedEffect(session.token) { reload() }

    val filteredRooms = remember(rooms, query) {
        val q = query.trim().lowercase(Locale.getDefault())
        if (q.isBlank()) rooms else rooms.filter { it.name.lowercase(Locale.getDefault()).contains(q) }
    }

    Column(modifier = modifier.fillMaxSize().padding(16.dp)) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Search rooms") },
            singleLine = true,
        )
        Spacer(Modifier.height(10.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
                onClick = {
                    val username = dmInput.trim()
                    if (username.isBlank()) return@Button
                    scope.launch {
                        runCatching { api.startDm(session.token, username) }
                            .onFailure { error = it.message ?: "New DM failed" }
                            .onSuccess { reload() }
                    }
                },
            ) {
                Icon(Icons.Filled.AddComment, contentDescription = "New DM")
                Spacer(Modifier.width(6.dp))
                Text("New DM")
            }
            Button(
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
                onClick = {
                    val name = groupName.trim()
                    if (name.isBlank()) return@Button
                    val members = groupMembers.split(",").map { it.trim() }.filter { it.isNotBlank() }
                    scope.launch {
                        runCatching { api.createGroup(session.token, name, members) }
                            .onFailure { error = it.message ?: "Create group failed" }
                            .onSuccess {
                                groupName = ""
                                groupMembers = ""
                                reload()
                            }
                    }
                },
            ) {
                Icon(Icons.Filled.Group, contentDescription = "New Group")
                Spacer(Modifier.width(6.dp))
                Text("New Group")
            }
            TextButton(onClick = { scope.launch { reload() } }) {
                Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
            }
        }
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = dmInput,
            onValueChange = { dmInput = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("DM username") },
            singleLine = true,
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = groupName,
            onValueChange = { groupName = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Group name") },
            singleLine = true,
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = groupMembers,
            onValueChange = { groupMembers = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Members (comma separated usernames)") },
            singleLine = true,
        )
        Spacer(Modifier.height(12.dp))
        when {
            loading -> CircularProgressIndicator()
            error != null -> Text(error.orEmpty(), color = MaterialTheme.colorScheme.error)
            filteredRooms.isEmpty() -> EmptyRooms()
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(filteredRooms) { room ->
                    RoomRow(room = room, onClick = { onOpenRoom(room) })
                }
            }
        }
    }
}

@Composable
private fun RoomRow(room: Room, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape)
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                    ) {
                        Text(room.name.take(1).uppercase(), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(room.name, fontWeight = FontWeight.SemiBold)
                }
                if ((room.unreadCount ?: 0) > 0) BadgeCount(value = room.unreadCount ?: 0)
            }
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (room.type == "group") Icons.Filled.Group else Icons.AutoMirrored.Filled.Message,
                    contentDescription = room.type,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = room.lastMessage ?: if (room.type == "group") "Group chat" else "Direct message",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun BadgeCount(value: Int) {
    Box(
        modifier = Modifier
            .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(999.dp))
            .padding(horizontal = 8.dp, vertical = 2.dp),
    ) {
        Text(value.toString(), color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun RoomDetailScreen(
    modifier: Modifier,
    api: ApiClient,
    session: Session,
    room: Room,
) {
    val scope = rememberCoroutineScope()
    var messages by remember(room.id) { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var loadingMessages by remember(room.id) { mutableStateOf(true) }
    var messageError by remember(room.id) { mutableStateOf<String?>(null) }
    var draft by remember(room.id) { mutableStateOf("") }
    var members by remember(room.id) { mutableStateOf<List<RoomMember>>(emptyList()) }
    var memberInput by remember(room.id) { mutableStateOf("") }
    var memberError by remember(room.id) { mutableStateOf<String?>(null) }

    suspend fun reloadMembers() {
        if (room.type != "group") return
        runCatching { api.roomMembers(session.token, room.id) }
            .onFailure { memberError = it.message ?: "Load members failed" }
            .onSuccess {
                members = it
                memberError = null
            }
    }

    suspend fun reloadMessages() {
        loadingMessages = true
        runCatching { api.messages(session.token, room.id) }
            .onFailure {
                messageError = it.message ?: "Load messages failed"
                Log.e("VeyluroRoom", "load messages failed room=${room.id}: ${it.message}")
            }
            .onSuccess {
                messages = it
                messageError = null
                Log.d("VeyluroRoom", "loaded ${it.size} messages room=${room.id}")
            }
        loadingMessages = false
    }

    LaunchedEffect(room.id) {
        reloadMembers()
        reloadMessages()
    }

    Column(modifier = modifier.fillMaxSize().padding(12.dp)) {
        Text("${room.name} (${room.type})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        if (room.type == "group") {
            Spacer(Modifier.height(8.dp))
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.padding(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Group, contentDescription = "Members")
                        Spacer(Modifier.width(6.dp))
                        Text("Group members (${members.size})", fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(Modifier.height(6.dp))
                    LazyColumn(
                        modifier = Modifier.height(120.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        items(members) { m ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(m.username)
                                if (m.id != session.userId) {
                                    TextButton(
                                        onClick = {
                                            scope.launch {
                                                runCatching { api.removeGroupMember(session.token, room.id, m.id) }
                                                    .onFailure { memberError = it.message ?: "Remove failed" }
                                                    .onSuccess { reloadMembers() }
                                            }
                                        },
                                    ) { Text("Remove") }
                                }
                            }
                        }
                    }
                    OutlinedTextField(
                        value = memberInput,
                        onValueChange = { memberInput = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Add member username") },
                        singleLine = true,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (memberError != null) {
                            Text(memberError.orEmpty(), color = MaterialTheme.colorScheme.error)
                        }
                        Button(
                            onClick = {
                                val username = memberInput.trim()
                                if (username.isBlank()) return@Button
                                scope.launch {
                                    runCatching { api.addGroupMember(session.token, room.id, username) }
                                        .onFailure { memberError = it.message ?: "Add failed" }
                                        .onSuccess {
                                            memberInput = ""
                                            reloadMembers()
                                        }
                                }
                            },
                        ) {
                            Icon(Icons.Filled.Add, contentDescription = "Add member")
                            Spacer(Modifier.width(6.dp))
                            Text("Add")
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))
        when {
            loadingMessages -> {
                Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            messageError != null -> {
                Column(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(messageError.orEmpty(), color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = { scope.launch { reloadMessages() } }) { Text("Retry") }
                }
            }
            else -> LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(messages) { msg ->
                    MessageBubble(
                        message = UiMessage(
                            id = msg.id,
                            author = if (msg.senderId == session.userId) session.username else room.name,
                            body = decodeBundleText(msg.bundle),
                            time = formatTime(msg.createdAt),
                            mine = msg.senderId == session.userId,
                        ),
                    )
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.weight(1f),
                label = { Text("Message") },
                singleLine = true,
            )
            Spacer(Modifier.width(8.dp))
            Button(
                enabled = draft.isNotBlank(),
                onClick = {
                    val text = draft.trim()
                    if (text.isBlank()) return@Button
                    scope.launch {
                        runCatching {
                            val safe = text.replace("\\", "\\\\").replace("\"", "\\\"")
                            val bundle = """{"text":"$safe"}"""
                            api.sendMessage(session.token, room.id, bundle)
                        }.onFailure {
                            messageError = it.message ?: "Send failed"
                            Log.e("VeyluroRoom", "send failed room=${room.id}: ${it.message}")
                        }.onSuccess {
                            draft = ""
                            reloadMessages()
                        }
                    }
                },
            ) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
                Spacer(Modifier.width(6.dp))
                Text("Send")
            }
        }
    }
}

private fun decodeBundleText(bundle: String): String {
    return runCatching {
        val obj = bundleJson.parseToJsonElement(bundle).jsonObject
        obj["text"]?.jsonPrimitive?.content
            ?: obj["body"]?.jsonPrimitive?.content
            ?: obj["content"]?.jsonPrimitive?.content
            ?: bundle
    }.getOrElse { bundle }
}

private fun formatTime(unixSec: Long): String {
    val dt = java.time.Instant.ofEpochSecond(unixSec)
        .atZone(java.time.ZoneId.systemDefault())
        .toLocalTime()
    return "%02d:%02d".format(dt.hour, dt.minute)
}

@Composable
private fun MessageBubble(message: UiMessage) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (message.mine) Arrangement.End else Arrangement.Start,
    ) {
        Card(
            colors = CardDefaults.cardColors(
                containerColor = if (message.mine) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
            ),
        ) {
            Column(
                modifier = Modifier
                    .padding(10.dp)
                    .width(260.dp),
            ) {
                if (!message.mine) {
                    Text(message.author, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(message.body)
                Text(message.time, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun ContactsTab(
    modifier: Modifier,
    api: ApiClient,
    session: Session,
) {
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var contacts by remember { mutableStateOf<List<Friend>>(emptyList()) }

    LaunchedEffect(session.token) {
        loading = true
        runCatching { api.friends(session.token) }
            .onFailure {
                error = it.message ?: "Load friends failed"
                loading = false
            }
            .onSuccess {
                contacts = it
                error = null
                loading = false
            }
    }

    Column(modifier = modifier.fillMaxSize().padding(16.dp)) {
        Text("Trusted Contacts", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(12.dp))
        when {
            loading -> CircularProgressIndicator()
            error != null -> Text(error.orEmpty(), color = MaterialTheme.colorScheme.error)
            contacts.isEmpty() -> Text("No contacts yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(contacts) { contact ->
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(contact.username)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.CheckCircle, contentDescription = "Verified", tint = MaterialTheme.colorScheme.primary)
                                Spacer(Modifier.width(6.dp))
                                Text("Verified", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CallsTab(modifier: Modifier) {
    val logs = remember {
        listOf(
            "Encrypted voice call with hoang_phong",
            "Missed secure call from river_guard",
            "Group call: Dragon Hall (3 participants)",
        )
    }
    Column(modifier = modifier.fillMaxSize().padding(16.dp)) {
        Text("Calls", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(12.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(logs) { row ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Row(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Call, contentDescription = "Call")
                        Spacer(Modifier.width(8.dp))
                        Text(row, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun MeTab(
    modifier: Modifier,
    session: Session,
    clearSession: suspend () -> Unit,
) {
    val scope = rememberCoroutineScope()
    Column(
        modifier = modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Person, contentDescription = "Profile")
                    Spacer(Modifier.width(6.dp))
                    Text("Profile", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(4.dp))
                Text("@${session.username}")
                Text("Identity ID: ${session.userId.take(8)}...", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Settings, contentDescription = "Security")
                    Spacer(Modifier.width(6.dp))
                    Text("Security", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(4.dp))
                Text("E2EE route: legacy active")
                Text("Fingerprint mode: manual verify")
            }
        }
        Spacer(Modifier.weight(1f))
        Button(modifier = Modifier.fillMaxWidth(), onClick = { scope.launch { clearSession() } }) {
            Text("Sign out")
        }
    }
}

@Composable
private fun EmptyRooms() {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Waves, contentDescription = "Wave")
                Spacer(Modifier.width(6.dp))
                Text("The water is still", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            }
            Text("Start a protected conversation when the current opens.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
