const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;

// Create normal web server
const server = http.createServer((req, res) => {
  let filePath = "./index.html";

  if (req.url !== "/") {
    filePath = "." + req.url;
  }

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

// Attach WebSocket to same server
const wss = new WebSocket.Server({ server });

const rooms = {};

function broadcast(room, data) {
  if (!rooms[room]) return;
  rooms[room].forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  });
}

wss.on("connection", (ws) => {
  let currentRoom = null;
  let username = null;

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "create") {
      currentRoom = data.room;
      username = data.username;
      rooms[currentRoom] = rooms[currentRoom] || [];
      rooms[currentRoom].push({ ws, username });

      ws.send(JSON.stringify({ type: "created", room: currentRoom }));

      broadcast(currentRoom, {
        type: "users",
        users: rooms[currentRoom].map(u => u.username)
      });
    }

    if (data.type === "join") {
      if (!rooms[data.room]) {
        ws.send(JSON.stringify({ type: "error", text: "Room not found" }));
        return;
      }

      currentRoom = data.room;
      username = data.username;
      rooms[currentRoom].push({ ws, username });

      ws.send(JSON.stringify({ type: "joined", room: currentRoom }));

      broadcast(currentRoom, {
        type: "users",
        users: rooms[currentRoom].map(u => u.username)
      });
    }

    if (data.type === "message" && currentRoom) {
      const message = {
        id: Math.random().toString(36),
        sender: username,
        text: data.text
      };

      broadcast(currentRoom, { type: "message", message });

      setTimeout(() => {
        broadcast(currentRoom, { type: "delete", id: message.id });
      }, 60000);
    }

    if (data.type === "file" && currentRoom) {
      const fileMsg = {
        sender: username,
        name: data.name,
        data: data.data
      };
      broadcast(currentRoom, { type: "file", message: fileMsg });
    }
  });

  ws.on("close", () => {
    if (!currentRoom) return;
    rooms[currentRoom] = rooms[currentRoom].filter(c => c.ws !== ws);
    broadcast(currentRoom, {
      type: "users",
      users: rooms[currentRoom].map(u => u.username)
    });
  });
});

server.listen(PORT, () => {
  console.log("✅ Server running on port " + PORT);
});
