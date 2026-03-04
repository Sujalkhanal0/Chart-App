const http = require("http");
const fs = require("fs");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
    fs.readFile("./index.html", (err, content) => {
        if (err) {
            res.writeHead(500);
            return res.end("Error loading index.html");
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
    });
});

// Set a max payload limit to prevent the server from crashing on massive files
const wss = new WebSocket.Server({ 
    server,
    maxPayload: 10 * 1024 * 1024 // 10MB Limit
});

const rooms = {}; 
let latestPublicCode = ""; 
const MAX_PER_ROOM = 6; 
const MAX_HISTORY = 50; // Keep only last 50 messages to save RAM

// --- HEARTBEAT LOGIC TO PREVENT RENDER TIMEOUT ---
function heartbeat() {
  this.isAlive = true;
}

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate(); // Kill dead connections
    ws.isAlive = false;
    ws.ping(); // Standard WebSocket ping
  });
}, 30000); // 30 seconds

wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on('pong', heartbeat); // Reset alive status when client responds to ping

    ws.on("message", (msg) => {
        try {
            const data = JSON.parse(msg);
            
            // Handle Heartbeat from client (prevents messages getting "stuck")
            if (data.type === "ping") {
                ws.send(JSON.stringify({ type: "pong" }));
                return;
            }

            if (data.type === "generate_code") { latestPublicCode = data.code; }

            if (data.type === "join") {
                const val = data.room.toUpperCase();
                const isSecret = (val === "AALU00" || val === "AALUOO_ROOM");
                
                let targetRoom = null;
                if (isSecret) targetRoom = "AALUOO_ROOM";
                else if (val === latestPublicCode || rooms[val]) targetRoom = val;

                if (targetRoom) {
                    if (!rooms[targetRoom]) rooms[targetRoom] = { users: new Set(), messages: [] };
                    if (rooms[targetRoom].users.size >= MAX_PER_ROOM) {
                        ws.send(JSON.stringify({ type: "error", message: "ROOM FULL!" }));
                        return;
                    }
                    ws.room = targetRoom; ws.username = data.username; ws.avatar = data.avatar;
                    rooms[ws.room].users.add(ws);
                    ws.send(JSON.stringify({ type: "join_success", room: ws.room }));
                    
                    rooms[ws.room].messages.forEach(m => ws.send(JSON.stringify({ type: "message", message: m })));
                    broadcast(ws.room, { type: "system", text: `${ws.avatar} ${ws.username} joined!` });
                } else {
                    ws.send(JSON.stringify({ type: "error", message: "INVALID CODE!" }));
                }
            }

            if (data.type === "message" && ws.room) {
                const msgPayload = { 
                    id: data.id || "msg-" + Date.now(),
                    sender: ws.username, 
                    avatar: ws.avatar, 
                    text: data.text,
                    file: data.file, 
                    fileName: data.fileName,
                    timestamp: data.timestamp,
                    fullTime: data.fullTime,
                    replyTo: data.replyTo,
                    disappear: data.disappear,
                    edited: false
                };
                
                rooms[ws.room].messages.push(msgPayload);
                if (rooms[ws.room].messages.length > MAX_HISTORY) {
                    rooms[ws.room].messages.shift();
                }

                broadcast(ws.room, { type: "message", message: msgPayload });
            }

            if (data.type === "edit_message" && ws.room) {
                const roomMsgs = rooms[ws.room].messages;
                const msgObj = roomMsgs.find(m => m.id === data.id);
                if (msgObj && msgObj.sender === ws.username) {
                    msgObj.text = data.newText;
                    msgObj.edited = true;
                    broadcast(ws.room, { type: "edit_update", id: data.id, newText: data.newText });
                }
            }

            if (["typing", "offer", "answer", "candidate", "call_req", "call_acc", "hangup", "self_destruct"].includes(data.type)) {
                broadcast(ws.room, { ...data, sender: ws.username, avatar: ws.avatar });
                
                if(data.type === "self_destruct" && ws.room) {
                    rooms[ws.room].messages = [];
                    broadcast(ws.room, { type: "wipe_chat" });
                }
            }
        } catch (e) {
            console.error("Error processing message:", e);
        }
    });

    ws.on("close", () => {
        if (ws.room && rooms[ws.room]) {
            rooms[ws.room].users.delete(ws);
            broadcast(ws.room, { type: "system", text: `${ws.username} left.` });
            
            if (rooms[ws.room].users.size === 0) {
                delete rooms[ws.room];
            }
        }
    });
});

wss.on('close', () => {
  clearInterval(interval);
});

function broadcast(room, data) {
    if (rooms[room]) {
        const out = JSON.stringify(data);
        rooms[room].users.forEach(c => { 
            if (c.readyState === WebSocket.OPEN) c.send(out); 
        });
    }
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => console.log(`Jungle Server on ${PORT}`));
