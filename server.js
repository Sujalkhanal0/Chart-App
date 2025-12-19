const http = require("http");
const fs = require("fs");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
    fs.readFile("./index.html", (err, content) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
    });
});

const wss = new WebSocket.Server({ server });
const rooms = {};
let latestPublicCode = ""; 
const MAX_PER_ROOM = 4; 

wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
        const data = JSON.parse(msg);
        if (data.type === "generate_code") { latestPublicCode = data.code; }
        if (data.type === "join") {
            const val = data.room.toUpperCase();
            const isSecret = (val === "BIBR00" || val === "BIBROO_ROOM");
            const isLatest = (val === latestPublicCode);
            if (isSecret || isLatest) {
                const targetRoom = isSecret ? "BIBROO_ROOM" : val;
                if (!rooms[targetRoom]) rooms[targetRoom] = new Set();
                if (rooms[targetRoom].size >= MAX_PER_ROOM) {
                    ws.send(JSON.stringify({ type: "error", message: "ROOM FULL! (MAX 4)" }));
                    return;
                }
                ws.room = targetRoom; ws.username = data.username; ws.avatar = data.avatar;
                rooms[ws.room].add(ws);
                ws.send(JSON.stringify({ type: "join_success", room: ws.room }));
                broadcast(ws.room, { type: "system", text: `${ws.avatar} ${ws.username} joined!` });
            } else {
                ws.send(JSON.stringify({ type: "error", message: "INVALID OR EXPIRED CODE!" }));
            }
        }
        if (data.type === "message" && ws.room) {
            broadcast(ws.room, { 
                type: "message", 
                message: { 
                    sender: ws.username, 
                    avatar: ws.avatar, 
                    text: data.text,
                    disappear: data.disappear,
                    file: data.file,
                    fileName: data.fileName
                } 
            });
        }
        if (data.type === "typing" && ws.room) {
            broadcast(ws.room, { type: "typing", sender: ws.username, avatar: ws.avatar, isTyping: data.isTyping });
        }
        if (["offer", "answer", "candidate", "call_req", "call_acc", "hangup", "self_destruct"].includes(data.type)) {
            broadcast(ws.room, { ...data, sender: ws.username, senderAvatar: ws.avatar });
            if(data.type === "self_destruct") broadcast(ws.room, { type: "wipe_chat" });
        }
    });
    ws.on("close", () => {
        if (ws.room && rooms[ws.room]) {
            rooms[ws.room].delete(ws);
            broadcast(ws.room, { type: "system", text: `${ws.username} left.` });
            if (rooms[ws.room].size === 0) { delete rooms[ws.room]; if (ws.room === latestPublicCode) latestPublicCode = ""; }
        }
    });
});

function broadcast(room, data) {
    if (rooms[room]) {
        const out = JSON.stringify(data);
        rooms[room].forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(out); });
    }
}
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => console.log(`Jungle Server Live on Port ${PORT}`));
