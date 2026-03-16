import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
    },
  });
  const PORT = 3000;

  // Matchmaking queue
  let waitingUser: string | null = null;
  const activeMatches = new Map<string, string>();

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join matchmaking queue
    socket.on('join-queue', () => {
      console.log('User joined queue:', socket.id);
      
      // If already in a match, clean it up
      const currentPartner = activeMatches.get(socket.id);
      if (currentPartner) {
        io.to(currentPartner).emit('partner-skipped');
        activeMatches.delete(currentPartner);
        activeMatches.delete(socket.id);
      }

      if (waitingUser && waitingUser !== socket.id) {
        // Match found
        const partnerId = waitingUser;
        waitingUser = null;

        activeMatches.set(socket.id, partnerId);
        activeMatches.set(partnerId, socket.id);

        // Notify both users
        io.to(socket.id).emit('matched', { partnerId, initiator: true });
        io.to(partnerId).emit('matched', { partnerId: socket.id, initiator: false });
      } else {
        // Add to queue
        waitingUser = socket.id;
      }
    });

    // WebRTC Signaling
    socket.on('offer', (data) => {
      io.to(data.target).emit('offer', {
        sdp: data.sdp,
        sender: socket.id,
      });
    });

    socket.on('answer', (data) => {
      io.to(data.target).emit('answer', {
        sdp: data.sdp,
        sender: socket.id,
      });
    });

    socket.on('ice-candidate', (data) => {
      io.to(data.target).emit('ice-candidate', {
        candidate: data.candidate,
        sender: socket.id,
      });
    });

    // Reactions
    socket.on('reaction', (data) => {
      io.to(data.target).emit('reaction', {
        type: data.type,
        sender: socket.id,
      });
    });

    // Next/Skip
    socket.on('next', () => {
      const partnerId = activeMatches.get(socket.id);
      if (partnerId) {
        io.to(partnerId).emit('partner-skipped');
        activeMatches.delete(partnerId);
        activeMatches.delete(socket.id);
      }
      if (waitingUser === socket.id) {
        waitingUser = null;
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      if (waitingUser === socket.id) {
        waitingUser = null;
      }
      const partnerId = activeMatches.get(socket.id);
      if (partnerId) {
        io.to(partnerId).emit('partner-disconnected');
        activeMatches.delete(partnerId);
        activeMatches.delete(socket.id);
      }
    });
  });

  // API routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/users-online', (req, res) => {
    res.json({ count: io.engine.clientsCount });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = __dirname.endsWith('dist') ? __dirname : path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
