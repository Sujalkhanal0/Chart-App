const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8080 });

const rooms = {};

function broadcast(room, data) {
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

    // CREATE ROOM
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

    // JOIN ROOM
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

    // MESSAGE
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

    // FILE
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

console.log("✅ Server running at ws://localhost:8080");
