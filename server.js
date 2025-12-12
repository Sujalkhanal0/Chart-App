const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

// Serve files
const server = http.createServer((req, res) => {
  let filePath = "./index.html";
  if (req.url !== "/") filePath = "." + req.url;

  const ext = path.extname(filePath);
  let contentType = "text/html";
  if (ext === ".js") contentType = "text/javascript";
  if (ext === ".css") contentType = "text/css";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("404 Not Found");
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    }
  });
});

// IMPORTANT: use `server` (not custom port) for WebSocket on Render
const wss = new WebSocket.Server({ noServer: true });

// room storage
const rooms = {};

// broadcast helper
function broadcast(room, data) {
  if (!rooms[room]) return;
  const msg = JSON.stringify(data);
  for (const client of rooms[room]) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

// WebSocket upgrade (critical for Render)
server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  ws.room = null;
  ws.username = null;

  ws.on("message", (msg) => {
    let data = {};
    try { data = JSON.parse(msg); } catch { return; }

    if (data.type === "create") {
      const room = data.room;
      ws.room = room;
      ws.username = data.username;

      if (!rooms[room]) rooms[room] = new Set();
      rooms[room].add(ws);

      ws.send(JSON.stringify({ type: "created" }));
      broadcast(room, { type: "users", users: [...rooms[room]].map(u => u.username) });
    }

    if (data.type === "join") {
      const room = data.room;
      if (!rooms[room]) {
        ws.send(JSON.stringify({ type: "error", text: "Room not found" }));
        return;
      }

      ws.room = room;
      ws.username = data.username;
      rooms[room].add(ws);

      ws.send(JSON.stringify({ type: "joined" }));
      broadcast(room, { type: "users", users: [...rooms[room]].map(u => u.username) });
    }

    if (data.type === "message") {
      broadcast(ws.room, {
        type: "message",
        message: {
          id: Date.now() + "" + Math.random(),
          sender: ws.username,
          text: data.text
        }
      });
    }

    if (data.type === "file") {
      broadcast(ws.room, {
        type: "file",
        message: {
          id: Date.now() + "" + Math.random(),
          sender: ws.username,
          name: data.name,
          data: data.data,
          filetype: data.filetype
        }
      });
    }

    if (data.type === "clear") {
      broadcast(ws.room, { type: "clear" });
    }

    // WebRTC signaling
    if (data.type === "call-request") {
      broadcast(ws.room, { type: "call-request", from: ws.username, video: data.video });
    }
    if (data.type === "offer") broadcast(ws.room, { type: "offer", offer: data.offer, from: ws.username });
    if (data.type === "answer") broadcast(ws.room, { type: "answer", answer: data.answer });
    if (data.type === "candidate") broadcast(ws.room, { type: "candidate", candidate: data.candidate });
    if (data.type === "call-end") broadcast(ws.room, { type: "call-end" });
  });

  ws.on("close", () => {
    if (!ws.room || !rooms[ws.room]) return;
    rooms[ws.room].delete(ws);
    broadcast(ws.room, { type: "users", users: [...rooms[ws.room]].map(u => u.username) });
  });
});

// Start server
server.listen(PORT, () => console.log("Server running on " + PORT));
