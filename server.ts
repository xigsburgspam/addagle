import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// Load firebase config — resolve relative to source root, works in both dev and prod
const configPath = new URL('./firebase-applet-config.json', import.meta.url);
const firebaseConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

// Initialize Firebase Admin (only once)
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
const adminDb = getFirestore(firebaseConfig.firestoreDatabaseId);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BANNED_WORDS = [
  'sex', 'fuck', 'suck', 'kiss', 'bongo', 'boltu', 'hasina', 'chudina', 'chudi',
  'xudi', 'xudina', 'chodna', 'xodna', 'modi', 'bongoboltu'
];

function containsBanned(text: string) {
  const lower = text.toLowerCase();
  return BANNED_WORDS.some(w => lower.includes(w));
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
    },
  });
  const PORT = 3000;

  // Proxy endpoint for anti-iframe bypass
  app.get('/api/proxy-stream', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
      }

      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      });

      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('text/html')) {
        let html = await response.text();
        
        // Inject base tag to fix relative URLs
        const targetBase = new URL('.', targetUrl).href;
        if (html.includes('<head>')) {
          html = html.replace('<head>', `<head><base href="${targetBase}">`);
        } else {
          html = `<head><base href="${targetBase}"></head>` + html;
        }

        res.setHeader('Content-Type', contentType);
        // Do not set X-Frame-Options or CSP
        res.send(html);
      } else {
        // For non-HTML, just pipe it
        res.setHeader('Content-Type', contentType);
        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
      }
    } catch (e) {
      console.error('Proxy error:', e);
      res.status(500).send('Proxy error');
    }
  });

  // Matchmaking queues
  let videoQueue: { socketId: string, peerId: string, uid: string, email: string, isAdmin: boolean }[] = [];
  let textQueue: { socketId: string, peerId: string, uid: string, email: string, isAdmin: boolean }[] = [];

  const blockedUsers = new Map<string, Set<string>>(); // uid -> Set of reported uids

  // Load blocked matches from Firestore on start
  async function loadBlockedMatches() {
    try {
      const snapshot = await adminDb.collection('reports').get();
      snapshot.forEach(doc => {
        const data = doc.data();
        const reporterId = data.reporterId || data.reporterUid;
        const reportedId = data.reportedId || data.violatorUid;
        if (reporterId && reportedId) {
          if (!blockedUsers.has(reporterId)) blockedUsers.set(reporterId, new Set());
          blockedUsers.get(reporterId)!.add(reportedId);
          
          // Also add the reverse for two-way blocking
          if (!blockedUsers.has(reportedId)) blockedUsers.set(reportedId, new Set());
          blockedUsers.get(reportedId)!.add(reporterId);
        }
      });
      console.log(`Loaded ${snapshot.size} reports into blocked matches cache.`);
    } catch (e) {
      console.error('Failed to load blocked matches:', e);
    }
  }
  loadBlockedMatches();

  const activeMatches = new Map<string, string>();
  const userModes = new Map<string, 'video' | 'text'>();
  const rooms = new Map<string, { type: 'video' | 'text', users: string[], peerIds: Map<string, string>, metadata: Map<string, { uid: string, email: string, isAdmin: boolean }> }>();
  const districtUsers = new Map<string, number>(); // districtName -> count

  let totalVideoChats = 0;
  let totalTextChats = 0;

  // ── Football public chat rooms ───────────────────────────────────────────
  // matchId → { names: Set<string> }
  const footballRooms = new Map<string, { names: Set<string> }>();

  // ── Custom Chat Rooms ────────────────────────────────────────────────────
  interface CustomRoomUser {
    socketId: string;
    name: string;
    uid?: string;
    email?: string;
  }
  interface CustomRoom {
    id: string;
    isGlobal: boolean;
    mode?: 'friends' | 'district';
    district?: string;
    maxMembers?: number;
    users: CustomRoomUser[];
    expiresAt?: number;
  }
  const customRooms = new Map<string, CustomRoom>();

  // Helper to broadcast room state
  const broadcastCustomRoom = (roomId: string) => {
    const room = customRooms.get(roomId);
    if (room) {
      io.to(`custom:${roomId}`).emit('custom-room-update', {
        id: room.id,
        isGlobal: room.isGlobal,
        mode: room.mode,
        district: room.district,
        maxMembers: room.maxMembers,
        users: room.users,
        expiresAt: room.expiresAt
      });
    }
  };

  // Join or Create District Room
  const joinOrCreateDistrictRoom = (socket: any, { district, name, uid, email }: { district: string, name: string, uid?: string, email?: string }) => {
    if (containsBanned(name)) {
      socket.emit('custom-error', 'Prohibited words in name.');
      return;
    }
    const roomId = `district-${district}`;
    let room = customRooms.get(roomId);

    if (!room) {
      room = {
        id: roomId,
        isGlobal: false,
        mode: 'district',
        district,
        maxMembers: 15,
        users: [],
        expiresAt: Date.now() + 15 * 60 * 1000 // 15 minutes
      };
      customRooms.set(roomId, room);
    }

    if (room.users.some(u => u.name === name)) {
      socket.emit('custom-error', 'Name already taken in this district room.');
      return;
    }

    if (room.maxMembers && room.users.length >= room.maxMembers) {
      socket.emit('custom-error', 'District room is full.');
      return;
    }

    room.users.push({ socketId: socket.id, name, uid, email });
    socket._customRoom = roomId;
    socket._customName = name;
    socket.join(`custom:${roomId}`);
    io.to(`custom:${roomId}`).emit('custom-system', `${name} joined the district room`);
    broadcastCustomRoom(roomId);

    // Increment total text chats
    totalTextChats++;
    adminDb.collection('stats').doc('global').set({ totalTextChats: FieldValue.increment(1) }, { merge: true }).catch(() => {});
  };

  // Timer interval for custom rooms
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of customRooms.entries()) {
      if (!room.isGlobal && room.expiresAt && now >= room.expiresAt) {
        io.to(`custom:${roomId}`).emit('custom-expired');
        io.in(`custom:${roomId}`).socketsLeave(`custom:${roomId}`);
        customRooms.delete(roomId);
      }
    }
  }, 5000);

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Track user district
    socket.on('set-district', ({ district }: { district: string }) => {
      if (!district) return;
      (socket as any)._district = district;
      districtUsers.set(district, (districtUsers.get(district) || 0) + 1);
      io.emit('district-update', Object.fromEntries(districtUsers));
    });

    // Join matchmaking queue
    socket.on('join-queue', ({ peerId, uid, email, isAdmin, mode }: { peerId: string, uid: string, email: string, isAdmin: boolean, mode: 'video' | 'text' }) => {
      console.log('User joined queue:', socket.id, 'Mode:', mode, 'Peer:', peerId, 'UID:', uid, 'Admin:', isAdmin);

      // Store UID and Email on socket for reporting
      (socket as any)._uid = uid;
      (socket as any)._email = email;

      userModes.set(socket.id, mode);

      // If already in a match, clean it up
      const currentPartner = activeMatches.get(socket.id);
      if (currentPartner) {
        io.to(currentPartner).emit('partner-skipped');
        activeMatches.delete(currentPartner);
        activeMatches.delete(socket.id);
      }

      const isVideo = mode === 'video';
      let queue = isVideo ? videoQueue : textQueue;

      // Remove self if already in queue
      const selfIndex = queue.findIndex(u => u.socketId === socket.id);
      if (selfIndex !== -1) queue.splice(selfIndex, 1);

      // Find a partner who is not blocked
      const partnerIndex = queue.findIndex(u => {
        if (!uid || !u.uid) return true; // Allow anonymous matching if no UID
        const blocks = blockedUsers.get(uid);
        if (blocks && blocks.has(u.uid)) return false;
        const partnerBlocks = blockedUsers.get(u.uid);
        if (partnerBlocks && partnerBlocks.has(uid)) return false;
        return true;
      });

      if (partnerIndex !== -1) {
        // Match found
        const partner = queue.splice(partnerIndex, 1)[0];

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

        // Persist to Firestore
        adminDb.collection('stats').doc('global').set(
          isVideo
            ? { totalVideoChats: FieldValue.increment(1) }
            : { totalTextChats: FieldValue.increment(1) },
          { merge: true }
        ).catch((e: Error) => console.error('Firestore stats update failed:', e));

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
        queue.push({ socketId: socket.id, peerId, uid, email, isAdmin });
      }
    });

    // Chat
    socket.on('send-chat-message', ({ roomId, message }) => {
      socket.to(roomId).emit('chat-message', message);
    });

    socket.on('typing-start', ({ roomId }) => {
      socket.to(roomId).emit('typing-start');
    });

    socket.on('typing-stop', ({ roomId }) => {
      socket.to(roomId).emit('typing-stop');
    });

    // Message delivery/seen receipts
    socket.on('message-delivered', ({ roomId, messageId }) => {
      socket.to(roomId).emit('message-delivered', { messageId });
    });

    socket.on('message-seen', ({ roomId, messageId }) => {
      socket.to(roomId).emit('message-seen', { messageId });
    });

    // Message reactions
    socket.on('message-reaction', ({ roomId, messageId, emoji }) => {
      socket.to(roomId).emit('message-reaction', { messageId, emoji });
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
      videoQueue = videoQueue.filter(u => u.socketId !== socket.id);
      textQueue = textQueue.filter(u => u.socketId !== socket.id);
    });

    // ── Football public chat ────────────────────────────────────────────────

    socket.on('football-check-name', ({ matchId, name }: { matchId: string; name: string }) => {
      if (containsBanned(name)) {
        socket.emit('football-name-result', { available: false, error: 'Prohibited words in name' });
        return;
      }
      const room = footballRooms.get(matchId);
      const taken = room ? room.names.has(name.toLowerCase()) : false;
      socket.emit('football-name-result', { available: !taken });
    });

    socket.on('football-get-counts', () => {
      const counts: Record<string, number> = {};
      footballRooms.forEach((room, matchId) => {
        counts[matchId] = room.names.size;
      });
      socket.emit('football-lobby-counts', { counts });
    });

    socket.on('football-join', ({ matchId, name }: { matchId: string; name: string }) => {
      if (containsBanned(name)) {
        socket.emit('football-error', 'Prohibited words in name');
        return;
      }
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
      io.to(`football:${matchId}`).emit('football-member-count', { count: room.names.size });
      socket.emit('football-joined', { name });

      // Increment total text chats
      totalTextChats++;
      adminDb.collection('stats').doc('global').set({ totalTextChats: FieldValue.increment(1) }, { merge: true }).catch(() => {});
    });

    socket.on('football-message', ({ matchId, text }: { matchId: string; text: string }) => {
      if (containsBanned(text)) return; // Silently drop or handle
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

    // ── Custom Chat Rooms ───────────────────────────────────────────────────

    socket.on('custom-join-global', ({ name, uid, email }) => {
      if (containsBanned(name)) {
        socket.emit('custom-error', 'Prohibited words in name.');
        return;
      }
      const roomId = 'global-chat';
      if (!customRooms.has(roomId)) {
        customRooms.set(roomId, { id: roomId, isGlobal: true, users: [] });
      }
      const room = customRooms.get(roomId)!;
      if (room.users.some(u => u.name === name)) {
        socket.emit('custom-error', 'Name already taken in global chat.');
        return;
      }
      room.users.push({ socketId: socket.id, name, uid, email });
      (socket as any)._customRoom = roomId;
      (socket as any)._customName = name;
      socket.join(`custom:${roomId}`);
      io.to(`custom:${roomId}`).emit('custom-system', `${name} joined global chat`);
      broadcastCustomRoom(roomId);

      // Increment total text chats
      totalTextChats++;
      adminDb.collection('stats').doc('global').set({ totalTextChats: FieldValue.increment(1) }, { merge: true }).catch(() => {});
    });

    socket.on('custom-create', ({ roomName, maxMembers, mode, district, name, uid, email }) => {
      if (containsBanned(name)) {
        socket.emit('custom-error', 'Prohibited words in name.');
        return;
      }
      if (containsBanned(roomName)) {
        socket.emit('custom-error', 'Prohibited words in room name.');
        return;
      }
      if (customRooms.has(roomName)) {
        socket.emit('custom-error', 'Room name already exists.');
        return;
      }
      const newRoom: CustomRoom = {
        id: roomName,
        isGlobal: false,
        mode,
        district,
        maxMembers,
        users: [{ socketId: socket.id, name, uid, email }],
        expiresAt: Date.now() + 15 * 60 * 1000 // 15 minutes
      };
      customRooms.set(roomName, newRoom);
      (socket as any)._customRoom = roomName;
      (socket as any)._customName = name;
      socket.join(`custom:${roomName}`);
      io.to(`custom:${roomName}`).emit('custom-system', `${name} created the room`);
      broadcastCustomRoom(roomName);

      // Increment total text chats
      totalTextChats++;
      adminDb.collection('stats').doc('global').set({ totalTextChats: FieldValue.increment(1) }, { merge: true }).catch(() => {});
    });

    socket.on('custom-join', ({ roomName, name, uid, email }) => {
      if (containsBanned(name)) {
        socket.emit('custom-error', 'Prohibited words in name.');
        return;
      }
      const room = customRooms.get(roomName);
      if (!room) {
        socket.emit('custom-error', 'Room not found.');
        return;
      }
      if (room.isGlobal) {
        socket.emit('custom-error', 'Cannot join global chat via this method.');
        return;
      }
      if (room.maxMembers && room.users.length >= room.maxMembers) {
        socket.emit('custom-error', 'Room is full.');
        return;
      }
      if (room.users.some(u => u.name === name)) {
        socket.emit('custom-error', 'Name already taken in this room.');
        return;
      }
      room.users.push({ socketId: socket.id, name, uid, email });
      (socket as any)._customRoom = roomName;
      (socket as any)._customName = name;
      socket.join(`custom:${roomName}`);
      io.to(`custom:${roomName}`).emit('custom-system', `${name} joined the room`);
      broadcastCustomRoom(roomName);

      // Increment total text chats
      totalTextChats++;
      adminDb.collection('stats').doc('global').set({ totalTextChats: FieldValue.increment(1) }, { merge: true }).catch(() => {});
    });

    socket.on('custom-join-district', ({ district, name, uid, email }) => {
      if (containsBanned(name)) {
        socket.emit('custom-error', 'Prohibited words in name.');
        return;
      }
      joinOrCreateDistrictRoom(socket, { district, name, uid, email });
    });

    socket.on('custom-chat', ({ text, replyTo }) => {
      if (containsBanned(text)) return;
      const roomId = (socket as any)._customRoom;
      const name = (socket as any)._customName;
      if (!roomId || !name) return;
      const room = customRooms.get(roomId);
      if (!room) return;
      
      // Check if room needs minimum members
      if (!room.isGlobal && room.users.length < 2) {
        socket.emit('custom-error', 'Waiting for minimum 2 members to chat.');
        return;
      }

      socket.to(`custom:${roomId}`).emit('custom-chat', { name, text, ts: Date.now(), replyTo });
    });

    socket.on('custom-react', ({ messageId, emoji }) => {
      const roomId = (socket as any)._customRoom;
      if (!roomId) return;
      socket.to(`custom:${roomId}`).emit('custom-react', { messageId, emoji, name: (socket as any)._customName });
    });

    socket.on('custom-report', async ({ violatorName, reason }) => {
      const roomId = (socket as any)._customRoom;
      const reporterName = (socket as any)._customName;
      console.log(`Custom report received: ${reporterName} reporting ${violatorName} in room ${roomId}`);
      
      if (!roomId || !reporterName) {
        console.log('Custom report failed: roomId or reporterName missing');
        return;
      }
      
      const room = customRooms.get(roomId);
      if (!room) {
        console.log(`Custom report failed: Room ${roomId} not found`);
        return;
      }

      const violator = room.users.find(u => u.name === violatorName);
      const reporter = room.users.find(u => u.name === reporterName);

      // Always save the report — use room lookup for full data, fallback to socket properties
      try {
        const reporterId = reporter?.uid || (socket as any)._uid || 'anonymous';
        const reporterEmail = reporter?.email || (socket as any)._email || 'anonymous';
        const reportedId = violator?.uid || 'anonymous';
        const reportedEmail = violator?.email || 'anonymous';

        // Update in-memory blocked matches if we have both UIDs
        if (reporter?.uid && violator?.uid) {
          if (!blockedUsers.has(reporter.uid)) blockedUsers.set(reporter.uid, new Set());
          blockedUsers.get(reporter.uid)!.add(violator.uid);
          if (!blockedUsers.has(violator.uid)) blockedUsers.set(violator.uid, new Set());
          blockedUsers.get(violator.uid)!.add(reporter.uid);
        }

        await adminDb.collection('reports').add({
          reporterId,
          reporterEmail,
          reporterName: reporterName,
          reportedId,
          reportedEmail,
          reportedName: violatorName,
          reason,
          roomId,
          source: 'custom-chat',
          timestamp: FieldValue.serverTimestamp()
        });
        console.log(`Report submitted to Firestore: ${reporterName} reported ${violatorName} in room ${roomId}`);
      } catch (e) {
        console.error('Failed to save custom report:', e);
      }

      if (!violator || !reporter) {
        console.log(`Custom report note: Violator (${violatorName}) or Reporter (${reporterName}) not found live in room — report still saved`);
      }
    });

    socket.on('report-user', async ({ reportedId, reportedEmail, reason, roomId }) => {
      const uid = (socket as any)._uid;
      const email = (socket as any)._email;
      console.log(`User report received: ${uid} reporting ${reportedId} in room ${roomId}`);
      
      if (!uid) {
        console.log('User report failed: reporter UID missing (user might not be in queue)');
        return;
      }

      try {
        // Update in-memory blocked matches
        if (reportedId) {
          if (!blockedUsers.has(uid)) blockedUsers.set(uid, new Set());
          blockedUsers.get(uid)!.add(reportedId);
          
          if (!blockedUsers.has(reportedId)) blockedUsers.set(reportedId, new Set());
          blockedUsers.get(reportedId)!.add(uid);
        }

        await adminDb.collection('reports').add({
          reporterId: uid,
          reporterEmail: email || 'anonymous',
          reportedId: reportedId || 'anonymous',
          reportedEmail: reportedEmail || 'anonymous',
          reason,
          roomId,
          timestamp: FieldValue.serverTimestamp()
        });
        console.log(`User report submitted to Firestore: ${uid} reported ${reportedId}`);
      } catch (e) {
        console.error('Failed to save user report:', e);
      }
    });

    socket.on('custom-leave', () => {
      const roomId = (socket as any)._customRoom;
      const name = (socket as any)._customName;
      if (roomId && name) {
        const room = customRooms.get(roomId);
        if (room) {
          room.users = room.users.filter(u => u.socketId !== socket.id);
          io.to(`custom:${roomId}`).emit('custom-system', `${name} left the room`);
          if (room.users.length === 0 && !room.isGlobal) {
            customRooms.delete(roomId);
          } else {
            broadcastCustomRoom(roomId);
          }
        }
        socket.leave(`custom:${roomId}`);
        delete (socket as any)._customRoom;
        delete (socket as any)._customName;
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      
      videoQueue = videoQueue.filter(u => u.socketId !== socket.id);
      textQueue = textQueue.filter(u => u.socketId !== socket.id);

      userModes.delete(socket.id);

      // District cleanup
      const district = (socket as any)._district;
      if (district) {
        const count = districtUsers.get(district) || 1;
        if (count <= 1) districtUsers.delete(district);
        else districtUsers.set(district, count - 1);
        io.emit('district-update', Object.fromEntries(districtUsers));
      }

      // Football room cleanup
      const fMatch = (socket as any)._footballMatch;
      const fName  = (socket as any)._footballName;
      if (fMatch && fName) {
        const fRoom = footballRooms.get(fMatch);
        if (fRoom) {
          fRoom.names.delete(fName.toLowerCase());
          io.to(`football:${fMatch}`).emit('football-system', { text: `${fName} has left` });
          io.to(`football:${fMatch}`).emit('football-member-count', { count: fRoom.names.size });
        }
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

      // Custom room cleanup
      const customRoomId = (socket as any)._customRoom;
      const customName = (socket as any)._customName;
      if (customRoomId && customName) {
        const room = customRooms.get(customRoomId);
        if (room) {
          room.users = room.users.filter(u => u.socketId !== socket.id);
          io.to(`custom:${customRoomId}`).emit('custom-system', `${customName} left the room`);
          if (room.users.length === 0 && !room.isGlobal) {
            customRooms.delete(customRoomId);
          } else {
            broadcastCustomRoom(customRoomId);
          }
        }
      }
    });
  });

  // API routes
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/stats', (req, res) => {
    const videoChatting = Array.from(rooms.values()).filter(r => r.type === 'video').length * 2 + videoQueue.length;
    const textChatting = Array.from(rooms.values()).filter(r => r.type === 'text').length * 2 + textQueue.length;
    const customChatting = Array.from(customRooms.values()).reduce((acc, r) => acc + r.users.length, 0);
    const footballChatting = Array.from(footballRooms.values()).reduce((acc, r) => acc + r.names.size, 0);
    const onlineUsers = io.engine.clientsCount;

    // District room user counts (for users in district chat rooms)
    const districtRoomUsers: Record<string, number> = {};
    const districtWaiting: Record<string, boolean> = {};
    for (const [roomId, room] of customRooms.entries()) {
      if (room.mode === 'district' && room.district && room.users.length > 0) {
        districtRoomUsers[room.district] = room.users.length;
        districtWaiting[room.district] = room.users.length < 2;
      }
    }

    res.json({
      onlineUsers,
      videoChatting,
      textChatting,
      customChatting,
      footballChatting,
      totalVideoChats,
      totalTextChats,
      districtUsers: Object.fromEntries(districtUsers),
      districtRoomUsers,
      districtWaiting
    });
  });

  app.get('/api/active-rooms', (req, res) => {
    const activeRooms = Array.from(rooms.entries()).map(([id, data]) => ({
      id,
      type: '1v1',
      users: data.users,
      peerIds: Object.fromEntries(data.peerIds),
      metadata: Object.fromEntries(data.metadata)
    }));
    const activeCustomRooms = Array.from(customRooms.entries()).map(([id, data]) => ({
      id,
      type: 'custom',
      users: data.users.map(u => u.socketId),
      metadata: {}
    }));
    res.json([...activeRooms, ...activeCustomRooms]);
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