import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp as initializeClientApp } from 'firebase/app';
import { getFirestore as getClientFirestore, collection, getDocs, getDoc, doc, setDoc, addDoc, increment } from 'firebase/firestore';
import { initializeApp as initializeAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// Load firebase config — resolve relative to source root, works in both dev and prod
const configPath = new URL('./firebase-applet-config.json', import.meta.url);
const firebaseConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

// Initialize Firebase Client SDK (for some client-side like logic if needed, but mostly for config)
const app = initializeClientApp(firebaseConfig);
const db = getClientFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Firebase Admin SDK for server-side operations (bypasses rules)
let adminApp;
console.log('Initializing Firebase Admin with Project ID:', firebaseConfig.projectId);
console.log('Using Firestore Database ID:', firebaseConfig.firestoreDatabaseId || '(default)');

if (!getAdminApps().length) {
  try {
    adminApp = initializeAdminApp({
      projectId: firebaseConfig.projectId,
    });
    console.log('Firebase Admin App initialized successfully');
  } catch (e) {
    console.error('Failed to initialize Firebase Admin App:', e);
  }
} else {
  adminApp = getAdminApps()[0];
  console.log('Using existing Firebase Admin App');
}
// Use the named database if provided, otherwise default
const adminDb = getAdminFirestore(adminApp, firebaseConfig.firestoreDatabaseId || '(default)');

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
    maxHttpBufferSize: 5e6, // 5MB — needed for image relay
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

  // Blocked users
  app.get('/api/user/blocked', async (req, res) => {
    const uid = req.query.uid as string;
    if (!uid) return res.status(400).send('Missing uid');
    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.data();
    res.json(userData?.blockedUsers || []);
  });

  app.delete('/api/user/blocked/:blockedId', async (req, res) => {
    const { uid } = req.body;
    const { blockedId } = req.params;
    if (!uid || !blockedId) return res.status(400).send('Missing uid or blockedId');
    await adminDb.collection('users').doc(uid).update({
      blockedUsers: FieldValue.arrayRemove(blockedId)
    });
    res.sendStatus(200);
  });

  // Video chat limits
  app.get('/api/user/stats', async (req, res) => {
    const uid = req.query.uid as string;
    if (!uid) return res.status(400).send('Missing uid');
    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const limit = userData?.dailyVideoLimit || 30;
    const usage = userData?.dailyVideoUsage || 0;
    const lastDate = userData?.lastVideoDate || new Date().toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    
    let currentUsage = usage;
    if (lastDate !== today) {
        currentUsage = 0;
    }

    res.json({ limit, remaining: Math.max(0, limit - Math.floor(currentUsage / 60)) });
  });

  app.post('/api/admin/user/limit', async (req, res) => {
    const { adminUid, targetUid, newLimit } = req.body;
    // Basic admin check (should be more robust)
    if (adminUid !== 'edublitz71@gmail.com') return res.status(403).send('Unauthorized');
    
    await adminDb.collection('users').doc(targetUid).set({ dailyVideoLimit: newLimit }, { merge: true });
    res.sendStatus(200);
  });

  // Matchmaking queues
  let waitingVideoUser: { socketId: string, peerId: string, uid: string, email: string, isAdmin: boolean } | null = null;
  let waitingTextUser: { socketId: string, peerId: string, uid: string, email: string, isAdmin: boolean } | null = null;

  const activeMatches = new Map<string, string>();
  const userModes = new Map<string, 'video' | 'text'>();
  const rooms = new Map<string, { type: 'video' | 'text', users: string[], peerIds: Map<string, string>, metadata: Map<string, { uid: string, email: string, isAdmin: boolean }> }>();
  const districtUsers = new Map<string, number>(); // districtName -> count
  const reportedPairs = new Set<string>();
  const blockedPairs = new Set<string>();
  const activeMatchStartTimes = new Map<string, number>();
  const sessionTimeouts = new Map<string, NodeJS.Timeout>();

  // Load reports and blocks on startup using Admin SDK
  adminDb.collection('reports').get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      reportedPairs.add(`${data.reporterId}:${data.reportedId}`);
    });
  }).catch(e => console.error('Failed to load reports:', e.message));

  adminDb.collection('blocks').get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      blockedPairs.add(`${data.blockerId}:${data.blockedId}`);
    });
  }).catch(e => console.error('Failed to load blocks:', e.message));

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
        expiresAt: Date.now() + 7 * 60 * 1000 // 7 minutes
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

  // Helper to check video chat limit

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
    socket.on('join-queue', async ({ peerId, uid, email, isAdmin, mode }: { peerId: string, uid: string, email: string, isAdmin: boolean, mode: 'video' | 'text' }) => {
      console.log('User joined queue:', socket.id, 'Mode:', mode, 'Peer:', peerId, 'UID:', uid, 'Admin:', isAdmin);



      userModes.set(socket.id, mode);

      // If already in a match, clean it up
      const currentPartner = activeMatches.get(socket.id);
      if (currentPartner) {
        const partnerSocket = io.sockets.sockets.get(currentPartner);
        if (partnerSocket) {
          const roomId = (partnerSocket as any)._roomId;
          if (roomId) {
            const startTime = activeMatchStartTimes.get(roomId);
            if (startTime) {
              const duration = (Date.now() - startTime) / 1000;
              if (duration >= 40) {
                // Increment counts
                const myUid = uid;
                const partnerUid = (partnerSocket as any)._uid;
                const myIsAdmin = isAdmin;
                const partnerIsAdmin = (partnerSocket as any)._isAdmin;
                

              }
              activeMatchStartTimes.delete(roomId);
              const timeout = sessionTimeouts.get(roomId);
              if (timeout) {
                clearTimeout(timeout);
                sessionTimeouts.delete(roomId);
              }
            }
          }
        }

        io.to(currentPartner).emit('partner-skipped');
        activeMatches.delete(currentPartner);
        activeMatches.delete(socket.id);
      }

      const isVideo = mode === 'video';
      let waitingUser = isVideo ? waitingVideoUser : waitingTextUser;

      if (waitingUser && waitingUser.socketId !== socket.id) {
        // Check if they reported each other or blocked each other
        if (reportedPairs.has(`${uid}:${waitingUser.uid}`) || reportedPairs.has(`${waitingUser.uid}:${uid}`) ||
            blockedPairs.has(`${uid}:${waitingUser.uid}`) || blockedPairs.has(`${waitingUser.uid}:${uid}`)) {
          // Don't match
          // If it was the only one in queue, we just stay in queue
          // But we need to keep waitingUser as waiting
          return;
        }

        // Match found
        const partner = waitingUser;
        if (isVideo) waitingVideoUser = null;
        else waitingTextUser = null;

        const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        activeMatches.set(socket.id, partner.socketId);
        activeMatches.set(partner.socketId, socket.id);

        socket.join(roomId);
        const partnerSocket = io.sockets.sockets.get(partner.socketId);
        partnerSocket?.join(roomId);

        // Store metadata on sockets for easier access on disconnect
        (socket as any)._roomId = roomId;
        (socket as any)._uid = uid;
        (socket as any)._isAdmin = isAdmin;
        if (partnerSocket) {
          (partnerSocket as any)._roomId = roomId;
          (partnerSocket as any)._uid = partner.uid;
          (partnerSocket as any)._isAdmin = partner.isAdmin;
        }

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

        if (isVideo) {
          totalVideoChats++;
          activeMatchStartTimes.set(roomId, Date.now());
          // Set a 5-minute timer to end the match
        const timeoutTime = isVideo ? 5 * 60 * 1000 : 7 * 60 * 1000;
        const timeout = setTimeout(async () => {
          if (activeMatches.has(socket.id) && activeMatches.get(socket.id) === partner.socketId) {
            io.to(roomId).emit('session-timeout');
            // Clean up
            socket.leave(roomId);
            partnerSocket?.leave(roomId);
            activeMatches.delete(socket.id);
            activeMatches.delete(partner.socketId);
            // Handle count if >= 40s (which it is)

            activeMatchStartTimes.delete(roomId);
            sessionTimeouts.delete(roomId);
          }
        }, timeoutTime);
        sessionTimeouts.set(roomId, timeout);
        } else {
          totalTextChats++;
        }

        // Persist to Firestore using Admin SDK
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
        if (isVideo) waitingVideoUser = { socketId: socket.id, peerId, uid, email, isAdmin };
        else waitingTextUser = { socketId: socket.id, peerId, uid, email, isAdmin };
      }
    });

    socket.on('block-user', async ({ blockerId, blockedId }) => {
      if (!blockerId || !blockedId) return;
      // Cannot block admin
      const adminEmail = 'edublitz71@gmail.com';
      // We don't have the blocked user's email here easily, but we can check if they are admin in the active match
      const partnerSocketId = activeMatches.get(socket.id);
      if (partnerSocketId) {
        const partnerSocket = io.sockets.sockets.get(partnerSocketId);
        if (partnerSocket && (partnerSocket as any)._isAdmin) {
          socket.emit('custom-error', 'You cannot block an admin.');
          return;
        }
      }

      blockedPairs.add(`${blockerId}:${blockedId}`);
      try {
        await adminDb.collection('blocks').add({
          blockerId,
          blockedId,
          timestamp: Date.now()
        });
      } catch (e) {}
    });

    // Chat
    socket.on('send-chat-message', ({ roomId, message }) => {
      socket.to(roomId).emit('chat-message', message);
    });

    // Image relay — base64 data passed through, never stored
    socket.on('send-chat-image', ({ roomId, imageId, base64, mimeType }) => {
      socket.to(roomId).emit('chat-image', { imageId, base64, mimeType });
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

    // Chat topup — relay to partner so both sides increase their limit
    socket.on('chat-topup', ({ roomId, chars }) => {
      socket.to(roomId).emit('chat-topup', { chars });
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
    socket.on('next', async () => {
      const partnerId = activeMatches.get(socket.id);
      if (partnerId) {
        const roomId = (socket as any)._roomId;
        if (roomId) {
          const startTime = activeMatchStartTimes.get(roomId);
          if (startTime) {
            const duration = (Date.now() - startTime) / 1000;
            if (duration >= 40) {
              const myUid = (socket as any)._uid;
              const myIsAdmin = (socket as any)._isAdmin;
              const partnerSocket = io.sockets.sockets.get(partnerId);
              const partnerUid = partnerSocket ? (partnerSocket as any)._uid : null;
              const partnerIsAdmin = partnerSocket ? (partnerSocket as any)._isAdmin : false;

              const today = new Date().toISOString().split('T')[0];

              if (myUid && !myIsAdmin) {
                const userRef = adminDb.collection('users').doc(myUid);
                await adminDb.runTransaction(async (transaction) => {
                  const userDoc = await transaction.get(userRef);
                  const userData = userDoc.data();
                  const lastDate = userData?.lastVideoDate || '';
                  const currentUsage = lastDate === today ? (userData?.dailyVideoUsage || 0) : 0;
                  transaction.update(userRef, {
                    dailyVideoUsage: currentUsage + duration,
                    lastVideoDate: today
                  });
                });
              }
              if (partnerUid && !partnerIsAdmin) {
                const partnerRef = adminDb.collection('users').doc(partnerUid);
                await adminDb.runTransaction(async (transaction) => {
                  const partnerDoc = await transaction.get(partnerRef);
                  const partnerData = partnerDoc.data();
                  const lastDate = partnerData?.lastVideoDate || '';
                  const currentUsage = lastDate === today ? (partnerData?.dailyVideoUsage || 0) : 0;
                  transaction.update(partnerRef, {
                    dailyVideoUsage: currentUsage + duration,
                    lastVideoDate: today
                  });
                });
              }
            }
            activeMatchStartTimes.delete(roomId);
            const timeout = sessionTimeouts.get(roomId);
            if (timeout) {
              clearTimeout(timeout);
              sessionTimeouts.delete(roomId);
            }
          }
        }

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
      if (waitingVideoUser?.socketId === socket.id) waitingVideoUser = null;
      if (waitingTextUser?.socketId === socket.id) waitingTextUser = null;
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
        expiresAt: Date.now() + 7 * 60 * 1000 // 7 minutes
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

    socket.on('custom-chat', ({ id, text, replyTo }) => {
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

      socket.to(`custom:${roomId}`).emit('custom-chat', { id, name, text, ts: Date.now(), replyTo });
    });

    socket.on('custom-report', async ({ violatorName, reason }) => {
      const roomId = (socket as any)._customRoom;
      const reporterName = (socket as any)._customName;
      if (!roomId || !reporterName) return;
      
      const room = customRooms.get(roomId);
      if (!room) return;

      const violator = room.users.find(u => u.name === violatorName);
      const reporter = room.users.find(u => u.name === reporterName);

      if (violator && reporter) {
        try {
          await adminDb.collection('reports').add({
            reporterId: reporter.uid || 'anonymous',
            reporterEmail: reporter.email || 'anonymous',
            reporterName: reporter.name,
            reportedId: violator.uid || 'anonymous',
            reportedEmail: violator.email || 'anonymous',
            reportedName: violator.name,
            reason,
            roomId,
            timestamp: new Date()
          });
          reportedPairs.add(`${reporter.uid || 'anonymous'}:${violator.uid || 'anonymous'}`);
          console.log(`Report submitted: ${reporterName} reported ${violatorName}`);
        } catch (e) {
          console.error('Failed to save report:', e);
        }
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
    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id);
      if (waitingVideoUser?.socketId === socket.id) waitingVideoUser = null;
      if (waitingTextUser?.socketId === socket.id) waitingTextUser = null;

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
        const roomId = (socket as any)._roomId;
        if (roomId) {
          const startTime = activeMatchStartTimes.get(roomId);
          if (startTime) {
            const duration = (Date.now() - startTime) / 1000;
            if (duration >= 40) {
              const myUid = (socket as any)._uid;
              const myIsAdmin = (socket as any)._isAdmin;
              const partnerSocket = io.sockets.sockets.get(partnerId);
              const partnerUid = partnerSocket ? (partnerSocket as any)._uid : null;
              const partnerIsAdmin = partnerSocket ? (partnerSocket as any)._isAdmin : false;

              const today = new Date().toISOString().split('T')[0];

              if (myUid && !myIsAdmin) {
                const userRef = adminDb.collection('users').doc(myUid);
                await adminDb.runTransaction(async (transaction) => {
                  const userDoc = await transaction.get(userRef);
                  const userData = userDoc.data();
                  const lastDate = userData?.lastVideoDate || '';
                  const currentUsage = lastDate === today ? (userData?.dailyVideoUsage || 0) : 0;
                  transaction.update(userRef, {
                    dailyVideoUsage: currentUsage + duration,
                    lastVideoDate: today
                  });
                });
              }
              if (partnerUid && !partnerIsAdmin) {
                const partnerRef = adminDb.collection('users').doc(partnerUid);
                await adminDb.runTransaction(async (transaction) => {
                  const partnerDoc = await transaction.get(partnerRef);
                  const partnerData = partnerDoc.data();
                  const lastDate = partnerData?.lastVideoDate || '';
                  const currentUsage = lastDate === today ? (partnerData?.dailyVideoUsage || 0) : 0;
                  transaction.update(partnerRef, {
                    dailyVideoUsage: currentUsage + duration,
                    lastVideoDate: today
                  });
                });
              }
            }
            activeMatchStartTimes.delete(roomId);
            const timeout = sessionTimeouts.get(roomId);
            if (timeout) {
              clearTimeout(timeout);
              sessionTimeouts.delete(roomId);
            }
          }
        }

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
    const videoChatting = Array.from(rooms.values()).filter(r => r.type === 'video').length * 2 + (waitingVideoUser ? 1 : 0);
    const textChatting = Array.from(rooms.values()).filter(r => r.type === 'text').length * 2 + (waitingTextUser ? 1 : 0);
    const customChatting = Array.from(customRooms.values()).reduce((acc, r) => acc + r.users.length, 0);
    const footballChatting = Array.from(footballRooms.values()).reduce((acc, r) => acc + r.names.size, 0);
    const onlineUsers = io.engine.clientsCount;
    res.json({
      onlineUsers,
      videoChatting,
      textChatting,
      customChatting,
      footballChatting,
      totalVideoChats,
      totalTextChats,
      districtUsers: Object.fromEntries(districtUsers)
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