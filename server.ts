import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const configPath = new URL('../firebase-applet-config.json', import.meta.url);
const firebaseConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
const adminDb = getFirestore(firebaseConfig.firestoreDatabaseId);

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

  let waitingVideoUser: { socketId: string, peerId: string, uid: string, email: string, isAdmin: boolean } | null = null;
  let waitingTextUser: { socketId: string, peerId: string, uid: string, email: string, isAdmin: boolean } | null = null;

  const activeMatches = new Map<string, string>();
  const userModes = new Map<string, 'video' | 'text'>();
  const rooms = new Map<string, { type: 'video' | 'text', users: string[], peerIds: Map<string, string>, metadata: Map<string, { uid: string, email: string, isAdmin: boolean }> }>();

  let totalVideoChats = 0;
  let totalTextChats = 0;

  // Football public chat rooms — matchId → { names: Set<string> }
  const footballRooms = new Map<string, { names: Set<string> }>();

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-queue', ({ peerId, uid, email, isAdmin, mode }: { peerId: string, uid: string, email: string, isAdmin: boolean, mode: 'video' | 'text' }) => {
      console.log('User joined queue:', socket.id, 'Mode:', mode, 'Peer:', peerId, 'UID:', uid, 'Admin:', isAdmin);

      userModes.set(socket.id, mode);

      const currentPartner = activeMatches.get(socket.id);
      if (currentPartner) {
        io.to(currentPartner).emit('partner-skipped');
        activeMatches.delete(currentPartner);
        activeMatches.delete(socket.id);
      }

      const isVideo = mode === 'video';
      let waitingUser = isVideo ? waitingVideoUser : waitingTextUser;

      if (waitingUser && waitingUser.socketId !== socket.id) {
        const partner = waitingUser;
        if (isVideo) waitingVideoUser = null;
        else waitingTextUser = null;

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
          type: mode,
          users: [socket.id, partner.socketId],
          peerIds: peerIdsMap,
          metadata: metadataMap
        });

        if (isVideo) totalVideoChats++;
        else totalTextChats++;

        adminDb.collection('stats').doc('global').set(
          isVideo
            ? { totalVideoChats: FieldValue.increment(1) }
            : { totalTextChats: FieldValue.increment(1) },
          { merge: true }
        ).catch((e: Error) => console.error('Firestore stats update failed:', e));

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
        if (isVideo) waitingVideoUser = { socketId: socket.id, peerId, uid, email, isAdmin };
        else waitingTextUser = { socketId: socket.id, peerId, uid, email, isAdmin };
      }
    });

    socket.on('send-chat-message', ({ roomId, message }) => {
      socket.to(roomId).emit('chat-message', message);
    });

    socket.on('typing-start', ({ roomId }) => {
      socket.to(roomId).emit('typing-start');
    });

    socket.on('typing-stop', ({ roomId }) => {
      socket.to(roomId).emit('typing-stop');
    });

    socket.on('message-delivered', ({ roomId, messageId }) => {
      socket.to(roomId).emit('message-delivered', { messageId });
    });

    socket.on('message-seen', ({ roomId, messageId }) => {
      socket.to(roomId).emit('message-seen', { messageId });
    });

    socket.on('message-reaction', ({ roomId, messageId, emoji }) => {
      socket.to(roomId).emit('message-reaction', { messageId, emoji });
    });

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

    socket.on('next', () => {
      const partnerId = activeMatches.get(socket.id);
      if (partnerId) {
        io.to(partnerId).emit('partner-skipped');
        activeMatches.delete(partnerId);
        activeMatches.delete(socket.id);

        for (const [roomId, room] of rooms.entries()) {
          if (room.users.includes(socket.id)) {
            rooms.delete(roomId);
            break;
          }
        }
      }
      if (waitingVideoUser?.socketId === socket.id) waitingVideoUser = null;
      if (waitingTextUser?.socketId === socket.id) waitingTextUser = null;
    });

    // ── Football public chat ────────────────────────────────────────────────

    socket.on('football-check-name', ({ matchId, name }: { matchId: string; name: string }) => {
      const room = footballRooms.get(matchId);
      const taken = room ? room.names.has(name.toLowerCase()) : false;
      socket.emit('football-name-result', { available: !taken });
    });

    socket.on('football-join', ({ matchId, name }: { matchId: string; name: string }) => {
      if (!footballRooms.has(matchId)) {
        footballRooms.set(matchId, { names: new Set() });
      }
      const room = footballRooms.get(matchId)!;
      if (room.names.has(name.toLowerCase())) {
        socket.emit('football-name-result', { available: false });
        return;
      }
      room.names.add(name.toLowerCase());
      (socket as any)._footballMatch = matchId;
      (socket as any)._footballName  = name;
      socket.join(`football:${matchId}`);
      io.to(`football:${matchId}`).emit('football-system', { text: `${name} has joined` });
      socket.emit('football-joined', { name });
    });

    socket.on('football-message', ({ matchId, text }: { matchId: string; text: string }) => {
      const name = (socket as any)._footballName;
      if (!name) return;
      io.to(`football:${matchId}`).emit('football-chat', { name, text, ts: Date.now() });
    });

    socket.on('football-typing-start', ({ matchId }: { matchId: string }) => {
      const name = (socket as any)._footballName;
      if (!name) return;
      socket.to(`football:${matchId}`).emit('football-typing-start', { name });
    });

    socket.on('football-typing-stop', ({ matchId }: { matchId: string }) => {
      const name = (socket as any)._footballName;
      if (!name) return;
      socket.to(`football:${matchId}`).emit('football-typing-stop', { name });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      if (waitingVideoUser?.socketId === socket.id) waitingVideoUser = null;
      if (waitingTextUser?.socketId === socket.id) waitingTextUser = null;

      userModes.delete(socket.id);

      // Football room cleanup
      const fMatch = (socket as any)._footballMatch;
      const fName  = (socket as any)._footballName;
      if (fMatch && fName) {
        const fRoom = footballRooms.get(fMatch);
        if (fRoom) fRoom.names.delete(fName.toLowerCase());
        io.to(`football:${fMatch}`).emit('football-system', { text: `${fName} has left` });
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
  app.use(express.json());

  app.get('/api/football/matches', async (req, res) => {
    try {
      const snap = await adminDb.collection('football_matches').where('live', '==', true).get();
      const matches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json(matches);
    } catch (e) {
      res.json([]);
    }
  });

  app.post('/api/football/matches', async (req, res) => {
    try {
      const { teamA, teamB, league, streamUrl } = req.body;
      const ref = await adminDb.collection('football_matches').add({
        teamA, teamB, league, streamUrl,
        live: true,
        createdAt: new Date().toISOString(),
      });
      res.json({ id: ref.id });
    } catch (e) {
      res.status(500).json({ error: 'Failed to add match' });
    }
  });

  app.delete('/api/football/matches/:id', async (req, res) => {
    try {
      await adminDb.collection('football_matches').doc(req.params.id).delete();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.patch('/api/football/matches/:id', async (req, res) => {
    try {
      await adminDb.collection('football_matches').doc(req.params.id).update(req.body);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/stats', (req, res) => {
    const videoChatting = Array.from(rooms.values()).filter(r => r.type === 'video').length * 2;
    const textChatting = Array.from(rooms.values()).filter(r => r.type === 'text').length * 2;
    const onlineUsers = io.engine.clientsCount;
    res.json({
      onlineUsers,
      videoChatting,
      textChatting,
      totalVideoChats,
      totalTextChats
    });
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