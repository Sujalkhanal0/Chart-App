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

wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        if (data.type === "join") {
            ws.room = data.room; ws.username = data.username; ws.avatar = data.avatar;
            if (!rooms[ws.room]) rooms[ws.room] = new Set();
            rooms[ws.room].add(ws);
            broadcast(ws.room, { type: "system", text: `${ws.avatar} ${ws.username} joined!` });
        }

        if (data.type === "message") {
            broadcast(ws.room, {
                type: "message",
                message: { sender: ws.username, avatar: ws.avatar, text: data.text, disappear: data.disappear || false }
            });
        }

        if (data.type === "self_destruct") broadcast(ws.room, { type: "wipe_chat", admin: ws.username });

        if (["call_req", "call_acc", "hangup"].includes(data.type)) {
            broadcast(ws.room, { ...data, sender: ws.username, senderAvatar: ws.avatar });
            if(data.type === "hangup") broadcast(ws.room, { type: "system", text: `📞 Call Ended by ${ws.username}` });
        }
    });

    ws.on("close", () => {
        if (ws.room && rooms[ws.room]) {
            rooms[ws.room].delete(ws);
            broadcast(ws.room, { type: "system", text: `${ws.username} left.` });
        }
    });
});

function broadcast(room, data) {
    if (rooms[room]) {
        const out = JSON.stringify(data);
        rooms[room].forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(out); });
    }
}
// Use process.env.PORT for hosting services, or 8080 for local testing
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
