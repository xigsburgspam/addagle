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
  let waitingUser: { socketId: string, peerId: string, uid: string, email: string, isAdmin: boolean } | null = null;
  const activeMatches = new Map<string, string>();
  const rooms = new Map<string, { users: string[], peerIds: Map<string, string>, metadata: Map<string, { uid: string, email: string, isAdmin: boolean }> }>();

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join matchmaking queue
    socket.on('join-queue', ({ peerId, uid, email, isAdmin }: { peerId: string, uid: string, email: string, isAdmin: boolean }) => {
      console.log('User joined queue:', socket.id, 'Peer:', peerId, 'UID:', uid, 'Admin:', isAdmin);
      
      // If already in a match, clean it up
      const currentPartner = activeMatches.get(socket.id);
      if (currentPartner) {
        io.to(currentPartner).emit('partner-skipped');
        activeMatches.delete(currentPartner);
        activeMatches.delete(socket.id);
      }

      if (waitingUser && waitingUser.socketId !== socket.id) {
        // Match found
        const partner = waitingUser;
        waitingUser = null;

        const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        activeMatches.set(socket.id, partner.socketId);
        activeMatches.set(partner.socketId, socket.id);

        socket.join(roomId);
        io.sockets.sockets.get(partner.socketId)?.join(roomId);

        const peerIdsMap = new Map();
        peerIdsMap.set(socket.id, peerId);
        peerIdsMap.set(partner.socketId, partner.peerId);
        
        const metadataMap = new Map();
        metadataMap.set(socket.id, { uid, email, isAdmin });
        metadataMap.set(partner.socketId, { uid: partner.uid, email: partner.email, isAdmin: partner.isAdmin });

        rooms.set(roomId, { 
          users: [socket.id, partner.socketId], 
          peerIds: peerIdsMap,
          metadata: metadataMap
        });

        // Notify both users
        io.to(socket.id).emit('matched', { 
          partnerId: partner.socketId, 
          partnerPeerId: partner.peerId, 
          partnerUid: partner.uid,
          partnerEmail: partner.email,
          isPartnerAdmin: partner.isAdmin,
          initiator: true, 
          roomId 
        });
        io.to(partner.socketId).emit('matched', { 
          partnerId: socket.id, 
          partnerPeerId: peerId, 
          partnerUid: uid,
          partnerEmail: email,
          isPartnerAdmin: isAdmin,
          initiator: false, 
          roomId 
        });
      } else {
        // Add to queue
        waitingUser = { socketId: socket.id, peerId, uid, email, isAdmin };
      }
    });

    // Chat
    socket.on('send-chat-message', ({ roomId, message }) => {
      socket.to(roomId).emit('chat-message', message);
    });

    // Reactions
    socket.on('reaction', (data) => {
      if (data.roomId) {
        socket.to(data.roomId).emit('reaction', {
          type: data.type,
          sender: socket.id,
        });
      } else if (data.target) {
        io.to(data.target).emit('reaction', {
          type: data.type,
          sender: socket.id,
        });
      }
    });

    // Next/Skip
    socket.on('next', () => {
      const partnerId = activeMatches.get(socket.id);
      if (partnerId) {
        io.to(partnerId).emit('partner-skipped');
        activeMatches.delete(partnerId);
        activeMatches.delete(socket.id);
        
        // Find and delete room
        for (const [roomId, room] of rooms.entries()) {
          if (room.users.includes(socket.id)) {
            rooms.delete(roomId);
            break;
          }
        }
      }
      if (waitingUser?.socketId === socket.id) {
        waitingUser = null;
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      if (waitingUser?.socketId === socket.id) {
        waitingUser = null;
      }
      const partnerId = activeMatches.get(socket.id);
      if (partnerId) {
        io.to(partnerId).emit('partner-disconnected');
        activeMatches.delete(partnerId);
        activeMatches.delete(socket.id);

        for (const [roomId, room] of rooms.entries()) {
          if (room.users.includes(socket.id)) {
            rooms.delete(roomId);
            break;
          }
        }
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

  app.get('/api/active-rooms', (req, res) => {
    const activeRooms = Array.from(rooms.entries()).map(([id, data]) => ({
      id,
      users: data.users,
      peerIds: Object.fromEntries(data.peerIds),
      metadata: Object.fromEntries(data.metadata)
    }));
    res.json(activeRooms);
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
