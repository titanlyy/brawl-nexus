// Brawl Nexus — Server v3
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const rooms = {};

io.on('connection', (socket) => {
  socket.on('join', ({ room }) => {
    const code = String(room || '').toUpperCase().slice(0, 8);
    if (!code) return socket.emit('status', { msg: 'Enter a room code.' });
    if (!rooms[code]) rooms[code] = [];
    const list = rooms[code];
    if (list.length >= 2) return socket.emit('status', { msg: 'Room is full. Try a different code.' });

    list.push(socket.id);
    socket.join(code);
    socket.roomCode = code;
    socket.role = list.length === 1 ? 'p1' : 'p2';
    socket.emit('role', { role: socket.role, room: code });

    if (list.length === 1) {
      socket.emit('status', { msg: `Room ${code} created. Waiting for opponent...` });
    } else {
      io.to(code).emit('status', { msg: 'Opponent found! Match starting...' });
      setTimeout(() => io.to(code).emit('start'), 800);
    }
  });

  // Relay validated inputs only
  socket.on('input', (data) => {
    if (!socket.roomCode) return;
    socket.to(socket.roomCode).emit('input', {
      left:    !!data.left,
      right:   !!data.right,
      up:      !!data.up,
      attack:  !!data.attack,
      special: !!data.special,
      dash:    !!data.dash
    });
  });

  // Ping-pong for latency display
  socket.on('ping_game', () => socket.emit('pong_game'));

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    rooms[code] = rooms[code].filter(id => id !== socket.id);
    socket.to(code).emit('peer-left');
    if (rooms[code].length === 0) delete rooms[code];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Brawl Nexus server on port ${PORT}`));
