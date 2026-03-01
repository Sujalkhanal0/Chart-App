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
const MAX_PER_ROOM = 6; 

wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
        const data = JSON.parse(msg);
        
        if (data.type === "generate_code") { latestPublicCode = data.code; }

        if (data.type === "join") {
            const val = data.room.toUpperCase();
            const isSecret = (val === "AALU00" || val === "AALUOO_ROOM");
            const targetRoom = isSecret ? "AALUOO_ROOM" : (val === latestPublicCode ? val : null);

            if (targetRoom) {
                if (!rooms[targetRoom]) rooms[targetRoom] = { users: new Set(), messages: [] };
                if (rooms[targetRoom].users.size >= MAX_PER_ROOM) {
                    ws.send(JSON.stringify({ type: "error", message: "ROOM FULL!" }));
                    return;
                }
                ws.room = targetRoom; ws.username = data.username; ws.avatar = data.avatar;
                rooms[ws.room].users.add(ws);
                ws.send(JSON.stringify({ type: "join_success", room: ws.room }));
                // Send history
                rooms[ws.room].messages.forEach(m => ws.send(JSON.stringify({ type: "message", message: m })));
                broadcast(ws.room, { type: "system", text: `${ws.avatar} ${ws.username} joined!` });
            } else {
                ws.send(JSON.stringify({ type: "error", message: "INVALID CODE!" }));
            }
        }

       if (data.type === "message" && ws.room) {
    const msgPayload = { 
        id: "msg-" + Date.now(),
        sender: ws.username, 
        avatar: ws.avatar, 
        text: data.text,
        timestamp: data.timestamp, // e.g. "09:30 PM"
        fullTime: data.fullTime,   // e.g. "2026-03-01T..." (Used for 10 min logic)
        replyTo: data.replyTo,
        edited: false
    };
    rooms[ws.room].messages.push(msgPayload);
    broadcast(ws.room, { type: "message", message: msgPayload });
}

        if (data.type === "edit_message" && ws.room === "AALUOO_ROOM") {
            const msgObj = rooms[ws.room].messages.find(m => m.id === data.id);
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
    });

    ws.on("close", () => {
        if (ws.room && rooms[ws.room]) {
            rooms[ws.room].users.delete(ws);
            broadcast(ws.room, { type: "system", text: `${ws.username} left.` });
        }
    });
});

function broadcast(room, data) {
    if (rooms[room]) {
        const out = JSON.stringify(data);
        rooms[room].users.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(out); });
    }
}

server.listen(8080, '0.0.0.0', () => console.log(`Jungle Server on 8080`));
