// Brawl Nexus — Multiplayer Server (Node.js + Socket.io)
// Deploy to Render.com / Railway.app (free tier)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const rooms = {}; // roomCode -> [socket1, socket2]

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('join', ({ room }) => {
    const code = room.toUpperCase();
    if (!rooms[code]) rooms[code] = [];
    const r = rooms[code];

    if (r.length >= 2) {
      socket.emit('status', { msg: 'Room full.' });
      return;
    }

    r.push(socket);
    socket.join(code);
    socket.roomCode = code;
    socket.role = r.length === 1 ? 'p1' : 'p2';
    socket.emit('role', { role: socket.role, room: code });

    console.log(`${socket.role.toUpperCase()} joined room ${code}`);

    if (r.length === 2) {
      io.to(code).emit('start');
      console.log(`Room ${code} — GAME START`);
    }
  });

  socket.on('input', (data) => {
    if (!socket.roomCode) return;
    socket.to(socket.roomCode).emit('input', data);
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    const code = socket.roomCode;
    if (code && rooms[code]) {
      rooms[code] = rooms[code].filter(s => s.id !== socket.id);
      if (rooms[code].length === 0) delete rooms[code];
      else io.to(code).emit('disconnect');
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Brawl Nexus server running on port ${PORT}`));
