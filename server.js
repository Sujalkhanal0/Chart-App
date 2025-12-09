const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });

const rooms = {};

function sendAll(room, data) {
  if (!rooms[room]) return;
  rooms[room].forEach(c => {
    if (c.ws.readyState === WebSocket.OPEN) {
      try { c.ws.send(JSON.stringify(data)); } catch(e){ /* ignore send errors */ }
    }
  });
}

wss.on("connection", (ws) => {
  let currentRoom = null;
  let username = null;

  ws.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    // CREATE
    if (data.type === "create") {
      currentRoom = data.room;
      username = data.username;
      rooms[currentRoom] ||= [];
      rooms[currentRoom].push({ ws, username });
      ws.send(JSON.stringify({ type: "created", room: currentRoom }));
      sendAll(currentRoom, { type: "users", users: rooms[currentRoom].map(x => x.username) });
      return;
    }

    // JOIN
    if (data.type === "join") {
      if (!rooms[data.room]) {
        ws.send(JSON.stringify({ type: "error", text: "Room not found" }));
        return;
      }
      currentRoom = data.room;
      username = data.username;
      rooms[currentRoom].push({ ws, username });
      ws.send(JSON.stringify({ type: "joined", room: currentRoom }));
      sendAll(currentRoom, { type: "users", users: rooms[currentRoom].map(x => x.username) });
      return;
    }

    // CLEAR
    if (data.type === "clear" && currentRoom) {
      sendAll(currentRoom, { type: "clear" });
      return;
    }

    // MESSAGE
    if (data.type === "message" && currentRoom) {
      if (typeof data.text === "string" && data.text.trim() === "/clear") {
        sendAll(currentRoom, { type: "clear" });
        return;
      }
      const msg = { id: Math.random().toString(36).slice(2), sender: username, text: data.text };
      sendAll(currentRoom, { type: "message", message: msg });

      // auto-delete after 60s
      setTimeout(() => { sendAll(currentRoom, { type: "delete", id: msg.id }); }, 60000);
      return;
    }

    // FILE
    if (data.type === "file" && currentRoom) {
      const f = { id: Math.random().toString(36).slice(2), sender: username, name: data.name, data: data.data, filetype: data.filetype };
      sendAll(currentRoom, { type: "file", message: f });
      setTimeout(() => { sendAll(currentRoom, { type: "delete", id: f.id }); }, 60000);
      return;
    }

    // CALL / WebRTC signaling / control
    if (["call-request","offer","answer","candidate","call-reject","call-end"].includes(data.type) && currentRoom) {
      // broadcast signaling/control messages to room
      sendAll(currentRoom, data);
      return;
    }
  });

  ws.on("close", () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    rooms[currentRoom] = rooms[currentRoom].filter(c => c.ws !== ws);
    sendAll(currentRoom, { type: "users", users: rooms[currentRoom].map(x => x.username) });
  });

});

console.log("✅ Server running at ws://localhost:8080");
