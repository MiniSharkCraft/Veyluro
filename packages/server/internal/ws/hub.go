package ws

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"amoon-eclipse/server/internal/auth"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true }, // CORS handled by middleware
}

// Frame là message được gửi qua WebSocket
type Frame struct {
	Type   string          `json:"type"` // "message" | "ack" | "ping" | "pong"
	RoomID string          `json:"roomId,omitempty"`
	Data   json.RawMessage `json:"data,omitempty"`
}

// Client đại diện cho một WebSocket connection
type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	userID string
	roomID string
}

// Hub quản lý tất cả rooms và clients
type Hub struct {
	db         *sql.DB
	mu         sync.RWMutex
	rooms      map[string]map[*Client]struct{} // roomID → set of clients
	users      map[string]map[*Client]struct{} // userID → set of clients
	register   chan *Client
	unregister chan *Client
	broadcast  chan *roomMsg
	signal     chan *signalMsg
}

type roomMsg struct {
	roomID string
	data   []byte
	from   *Client
}

type signalMsg struct {
	toUserID string
	data     []byte
}

func NewHub(db *sql.DB) *Hub {
	return &Hub{
		db:         db,
		rooms:      make(map[string]map[*Client]struct{}),
		users:      make(map[string]map[*Client]struct{}),
		register:   make(chan *Client, 64),
		unregister: make(chan *Client, 64),
		broadcast:  make(chan *roomMsg, 256),
		signal:     make(chan *signalMsg, 256),
	}
}

// SendToUserInRoom gửi signal tới user trong đúng room (tránh cross-room spoofing).
func (h *Hub) SendToUserInRoom(toUserID, roomID string, data []byte) bool {
	h.mu.RLock()
	set, ok := h.users[toUserID]
	h.mu.RUnlock()
	if !ok {
		return false
	}

	delivered := false
	for c := range set {
		if c.roomID != roomID {
			continue
		}
		select {
		case c.send <- data:
			delivered = true
		default:
			go func(client *Client) { h.unregister <- client }(c)
		}
	}
	return delivered
}

// SendToUserGlobal sends data only to user-level sockets that are not bound to a room.
func (h *Hub) SendToUserGlobal(toUserID string, data []byte) bool {
	h.mu.RLock()
	set, ok := h.users[toUserID]
	h.mu.RUnlock()
	if !ok {
		return false
	}

	delivered := false
	for c := range set {
		if c.roomID != "" {
			continue
		}
		select {
		case c.send <- data:
			delivered = true
		default:
			go func(client *Client) { h.unregister <- client }(c)
		}
	}
	return delivered
}

// BroadcastToRoomMemberGlobals sends a user-level event to every current member of a room.
func (h *Hub) BroadcastToRoomMemberGlobals(roomID string, data []byte) {
	if h.db == nil {
		return
	}
	rows, err := h.db.Query(`SELECT user_id FROM room_members WHERE room_id=?`, roomID)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var userID string
		if rows.Scan(&userID) == nil && userID != "" {
			h.SendToUserGlobal(userID, data)
		}
	}
}

// BroadcastToRoom gửi data tới tất cả clients trong room (kể cả sender — dùng cho HTTP-triggered push).
func (h *Hub) BroadcastToRoom(roomID string, data []byte) {
	h.mu.RLock()
	set := h.rooms[roomID]
	for c := range set {
		select {
		case c.send <- data:
		default:
			go func(client *Client) { h.unregister <- client }(c)
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			if c.roomID != "" {
				if h.rooms[c.roomID] == nil {
					h.rooms[c.roomID] = make(map[*Client]struct{})
				}
				h.rooms[c.roomID][c] = struct{}{}
			}
			if h.users[c.userID] == nil {
				h.users[c.userID] = make(map[*Client]struct{})
			}
			h.users[c.userID][c] = struct{}{}
			h.mu.Unlock()

		case c := <-h.unregister:
			h.mu.Lock()
			if set, ok := h.rooms[c.roomID]; ok {
				delete(set, c)
				if len(set) == 0 {
					delete(h.rooms, c.roomID)
				}
			}
			if userSet, ok := h.users[c.userID]; ok {
				delete(userSet, c)
				if len(userSet) == 0 {
					delete(h.users, c.userID)
				}
			}
			h.mu.Unlock()
			close(c.send)

		case msg := <-h.broadcast:
			h.mu.RLock()
			set := h.rooms[msg.roomID]
			for c := range set {
				if c == msg.from {
					continue
				}
				select {
				case c.send <- msg.data:
				default:
					// slow client — drop và kick
					go func(client *Client) { h.unregister <- client }(c)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// ServeWS nâng cấp HTTP → WebSocket, yêu cầu roomID query param
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	roomID := r.URL.Query().Get("room")
	if roomID != "" && !h.isRoomMember(r, roomID, userID) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}

	c := &Client{
		hub:    h,
		conn:   conn,
		send:   make(chan []byte, 128),
		userID: userID,
		roomID: roomID,
	}

	h.register <- c
	go c.writePump()
	go c.readPump()
}

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 50 * time.Second
	maxMsgSize = 64 * 1024 // 64KB — đủ cho E2EE bundle
)

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMsgSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ws read error: %v", err)
			}
			break
		}

		// Validate frame
		var frame Frame
		if err := json.Unmarshal(msg, &frame); err != nil {
			continue
		}
		if frame.Type == "ping" {
			pong, _ := json.Marshal(Frame{Type: "pong"})
			c.send <- pong
			continue
		}

		// WebRTC signaling
		if frame.Type == "call-offer" || frame.Type == "call-answer" ||
			frame.Type == "call-ice" || frame.Type == "call-end" || frame.Type == "call-ring" ||
			frame.Type == "group-call-offer" || frame.Type == "group-call-answer" || frame.Type == "group-call-ice" {
			// Pairwise: forward trực tiếp tới target user, giữ nguyên tất cả fields
			var raw map[string]json.RawMessage
			if err := json.Unmarshal(msg, &raw); err != nil {
				continue
			}
			toUserIDRaw, ok := raw["toUserId"]
			if !ok {
				continue
			}
			var toUserID string
			if err := json.Unmarshal(toUserIDRaw, &toUserID); err != nil || toUserID == "" {
				continue
			}
			// Pairwise signals chỉ được gửi cho thành viên cùng room.
			if !c.hub.isUserInRoom(c.roomID, toUserID) {
				continue
			}
			// Override fromUserId với server-verified user ID
			fromJSON, _ := json.Marshal(c.userID)
			raw["fromUserId"] = fromJSON
			if _, ok := raw["roomId"]; !ok && c.roomID != "" {
				roomJSON, _ := json.Marshal(c.roomID)
				raw["roomId"] = roomJSON
			}
			out, _ := json.Marshal(raw)
			delivered := c.hub.SendToUserInRoom(toUserID, c.roomID, out)
			// Ring/end events should still reach target when they are not bound to room socket.
			if !delivered && (frame.Type == "call-ring" || frame.Type == "call-end") {
				c.hub.SendToUserGlobal(toUserID, out)
			}
			continue
		}

		// Group call room-wide signals (broadcast to all room members except sender)
		if frame.Type == "group-call-invite" || frame.Type == "group-call-join" || frame.Type == "group-call-end" {
			type sigFrame struct {
				Type     string          `json:"type"`
				FromUser string          `json:"fromUserId"`
				RoomID   string          `json:"roomId,omitempty"`
				Data     json.RawMessage `json:"data,omitempty"`
			}
			var sf sigFrame
			if err := json.Unmarshal(msg, &sf); err != nil {
				continue
			}
			sf.FromUser = c.userID
			out, _ := json.Marshal(sf)
			c.hub.broadcast <- &roomMsg{roomID: c.roomID, data: out, from: c}
			if frame.Type == "group-call-invite" {
				c.hub.BroadcastToRoomMemberGlobals(c.roomID, out)
			}
			continue
		}

		if frame.Type != "message" {
			continue
		}
		// Message realtime được push từ HTTP /api/messages để tránh duplicate frame.
		continue
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *Hub) isRoomMember(r *http.Request, roomID, userID string) bool {
	if h.db == nil {
		return false
	}
	var cnt int
	err := h.db.QueryRowContext(
		r.Context(),
		`SELECT COUNT(*) FROM room_members WHERE room_id=? AND user_id=?`,
		roomID,
		userID,
	).Scan(&cnt)
	return err == nil && cnt > 0
}

func (h *Hub) isUserInRoom(roomID, userID string) bool {
	if h.db == nil {
		return false
	}
	var cnt int
	err := h.db.QueryRowContext(
		context.Background(),
		`SELECT COUNT(*) FROM room_members WHERE room_id=? AND user_id=?`,
		roomID,
		userID,
	).Scan(&cnt)
	return err == nil && cnt > 0
}
