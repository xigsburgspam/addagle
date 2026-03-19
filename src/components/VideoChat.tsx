import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Video, VideoOff, Mic, MicOff, SkipForward, ThumbsUp, Hand, Smile, Users, PhoneOff, Flag, ShieldAlert, Terminal, Radio, Activity, X, AlertTriangle, Ghost, MessageSquare, ArrowRight, UserCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Peer, { MediaConnection } from 'peerjs';
import Draggable from 'react-draggable';
import { useFirebase } from '../FirebaseContext';
import { useLanguage } from '../LanguageContext';
import { db, collection, addDoc, Timestamp, doc, setDoc, increment, updateDoc, runTransaction } from '../firebase';
import { Chat } from './Chat';
import { StatsDisplay } from './StatsDisplay';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

import { getDistrict } from '../utils/location';

interface VideoChatProps {
  onExit: () => void;
  mode: 'video' | 'text';
  userName?: string;
}

export const VideoChat: React.FC<VideoChatProps> = ({ onExit, mode, userName }) => {
  const { user, userData } = useFirebase();
  const isAdmin = user?.email === 'edublitz71@gmail.com';

  // ── Token system ────────────────────────────────────────────────────────────
  const tokensRef = useRef<number>(userData?.tokens ?? 100);
  useEffect(() => { tokensRef.current = userData?.tokens ?? 100; }, [userData?.tokens]);
  const tokens = userData?.tokens ?? 100;
  const videoCallCost = 7; // tokens per video call

  const { t } = useLanguage();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reaction, setReaction] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isAdminConnected, setIsAdminConnected] = useState(false);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(
    window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
  );

  const [showAgeConsent, setShowAgeConsent] = useState(true);
  const [showIntro, setShowIntro] = useState(false);
  const [faceDetectionWarning, setFaceDetectionWarning] = useState(false);
  const faceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const noFaceCountRef = useRef(0);

  // Audio refs
  const joinSoundRef = useRef<AudioContext | null>(null);
  const disconnectSoundRef = useRef<AudioContext | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');

  const [showChat, setShowChat] = useState(false);
  const [videoTimer, setVideoTimer] = useState(300); // 5 min in seconds
  const videoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | undefined>(undefined);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);



  const localVideoRef = useRef<HTMLVideoElement>(null);
  const draggableRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const currentCallRef = useRef<MediaConnection | null>(null);
  const partnerIdRef = useRef<string | null>(null);
  const partnerUidRef = useRef<string | null>(null);
  const partnerEmailRef = useRef<string | null>(null);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    const onConnect = () => {
      getDistrict().then(district => {
        newSocket.emit('set-district', { district });
      }).catch(() => {});
    };

    if (newSocket.connected) onConnect();
    else newSocket.once('connect', onConnect);

    const peer = new Peer({
      debug: 3,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          {
            urls: 'turn:free.expressturn.com:3478',
            username: '000000002089091968',
            credential: 'RMGzeBVkbqAMUd3DD+dKHoiFy4o='
          },
          {
            urls: 'turn:free.expressturn.com:3478',
            username: '000000002089185883',
            credential: 'gZ2jNoAMR1qjuWC+6Zo6dVD7WLo='
          },
          {
            urls: 'turn:free.expressturn.com:3478',
            username: '000000002089185971',
            credential: 'MQOVaraA3FVL/t0nhNJ5aSkn0NI='
          },
          {
            urls: 'turn:free.expressturn.com:3478',
            username: '000000002089186010',
            credential: 'D54Lk/eZK4wb0jju3mcwScLMqPo='
          },
          {
            urls: 'turn:free.expressturn.com:3478',
            username: '000000002089186136',
            credential: 'LADkAnLKd5LGJAuopGli+o2Ju5w='
          },
          {
            urls: 'turn:free.expressturn.com:3478',
            username: '000000002089186180',
            credential: 'LT9U7xcnDVKN2nuvMfdBqtGws9Y='
          },
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all'
      }
    });
    peerRef.current = peer;

    peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      const errorType = err.type as string;
      if (['peer-unavailable', 'network', 'disconnected', 'negotiation-failed', 'webrtc', 'socket-closed', 'socket-error'].includes(errorType)) {
        handleDisconnect('Connection error: ' + errorType);
        if (errorType === 'socket-closed' || errorType === 'socket-error') {
          setTimeout(() => {
            if (peerRef.current && !peerRef.current.destroyed) {
              peerRef.current.reconnect();
            }
          }, 3000);
        } else {
          setTimeout(() => findNextRef.current(), 2000);
        }
      }
    });

    peer.on('disconnected', () => {
      console.log('Peer disconnected from server, attempting to reconnect...');
      peer.reconnect();
    });

    peer.on('call', (call) => {
      console.log('Receiving call');
      call.answer(localStreamRef.current || undefined);
      currentCallRef.current = call;
      call.on('stream', (remoteStream) => {
        setRemoteStream(remoteStream);
        setIsConnected(true);
      });
      call.on('close', () => {
        handleDisconnect('Call closed');
      });
      call.on('error', () => {
        handleDisconnect('Call error');
      });
    });

    const handleResize = () => {
      setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      newSocket.disconnect();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      peer.destroy();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('matched', async ({ partnerId, partnerPeerId, partnerUid, partnerEmail, isPartnerAdmin, initiator, roomId: rId }) => {
      setIsSearching(false);
      setRoomId(rId);
      setIsAdminConnected(!!isPartnerAdmin);
      playJoinSound();
      partnerIdRef.current = partnerId;
      partnerUidRef.current = partnerUid;
      partnerEmailRef.current = partnerEmail;

      // Deduct tokens for video call using a transaction (reads live value, not stale cache)
      // Every participant pays — not just the initiator
      if (mode === 'video' && !isAdmin && user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(userRef);
            const current = snap.exists() ? (snap.data().tokens ?? 100) : 100;
            if (current < videoCallCost) {
              throw new Error('INSUFFICIENT_TOKENS');
            }
            tx.update(userRef, { tokens: current - videoCallCost });
            tokensRef.current = current - videoCallCost;
          });
        } catch (e: any) {
          if (e?.message === 'INSUFFICIENT_TOKENS') {
            setConnectionError(`Not enough tokens! You need ${videoCallCost} tokens per video call.`);
            setTimeout(() => onExit(), 4000);
          } else {
            console.error('Token deduction failed', e);
          }
        }
      }

      if (initiator) {
        try {
          const statField = mode === 'video' ? 'totalVideoChats' : 'totalTextChats';
          await setDoc(doc(db, 'stats', 'global'), {
            [statField]: increment(1)
          }, { merge: true });
        } catch (e) {
          console.error('Failed to update stats:', e);
        }
      }

      // For text mode, connected immediately since no stream needed
      if (mode === 'text') {
        setIsConnected(true);
      }

      if (initiator && localStreamRef.current) {
        const call = peerRef.current?.call(partnerPeerId, localStreamRef.current);
        if (call) {
          currentCallRef.current = call;
          call.on('stream', (remoteStream) => {
            setRemoteStream(remoteStream);
            setIsConnected(true);
          });
          call.on('close', () => {
            handleDisconnect('Call closed');
          });
          call.on('error', () => {
            handleDisconnect('Call error');
          });
        }
      }
    });

    socket.on('partner-skipped', () => {
      playDisconnectSound();
      handleDisconnect('Partner skipped');
      setTimeout(() => findNextRef.current(), 1500);
    });

    socket.on('partner-disconnected', () => {
      playDisconnectSound();
      handleDisconnect('Partner disconnected');
      // Auto-find next node immediately when partner exits
      findNextRef.current();
    });

    socket.on('reaction', (data) => {
      setReaction(data.type);
      setTimeout(() => setReaction(null), 2000);
    });

    socket.on('admin-connected', () => {
      setIsAdminConnected(true);
    });

    socket.on('admin-disconnected-from-room', () => {
      setIsAdminConnected(false);
    });

    socket.on('limit-reached', () => {
      setIsSearching(false);
      setConnectionError(`Not enough tokens to start a video call. You need ${videoCallCost} tokens.`);
      setTimeout(() => onExit(), 4000);
    });

    return () => {
      socket.off('matched');
      socket.off('partner-skipped');
      socket.off('partner-disconnected');
      socket.off('reaction');
      socket.off('admin-connected');
      socket.off('admin-disconnected-from-room');
      socket.off('limit-reached');
    };
  }, [socket]);

  useEffect(() => {
    if (mode === 'text') return;
    if (!videoEnabled && (isConnected || isSearching)) {
      handleDisconnect('Camera required');
      setIsSearching(false);
    }
  }, [videoEnabled, isConnected, isSearching]);

  useEffect(() => {
    if (isConnected && remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [isConnected, remoteStream]);

  // 5-minute auto-skip timer for video calls
  useEffect(() => {
    if (mode !== 'video') return;
    if (isConnected) {
      setVideoTimer(300);
      videoTimerRef.current = setInterval(() => {
        setVideoTimer(prev => {
          if (prev <= 1) {
            clearInterval(videoTimerRef.current!);
            handleNext();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
      setVideoTimer(300);
    }
    return () => { if (videoTimerRef.current) clearInterval(videoTimerRef.current); };
  }, [isConnected, mode]);

  useEffect(() => {
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(device => device.kind === 'videoinput');
        setAvailableCameras(cameras);
      } catch (err) {
        console.error('Error fetching cameras:', err);
      }
    };
    getCameras();
  }, []);

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // --- Sound helpers ---
  const playJoinSound = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  };

  const playDisconnectSound = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(300, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  };

  // --- Face detection using canvas pixel analysis ---
  const checkFacePresence = useCallback(() => {
    if (mode !== 'video') return;
    const video = localVideoRef.current;
    const canvas = faceCanvasRef.current;
    if (!video || !canvas || !localStream) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 80;
    canvas.height = 60;
    ctx.drawImage(video, 0, 0, 80, 60);

    const data = ctx.getImageData(20, 10, 40, 40).data;
    let skinPixels = 0;
    const total = (40 * 40);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 60 && g > 40 && b > 20 && r > g && r > b &&
          (r - g) > 10 && r < 250) {
        skinPixels++;
      }
    }

    const ratio = skinPixels / total;
    if (ratio < 0.04) {
      noFaceCountRef.current++;
      if (noFaceCountRef.current >= 3) {
        setFaceDetectionWarning(true);
        if (isConnected || isSearching) {
          handleDisconnect('No face detected');
          setIsSearching(false);
          if (socket) socket.emit('next');
        }
      }
    } else {
      noFaceCountRef.current = 0;
      setFaceDetectionWarning(false);
    }
  }, [mode, localStream, isConnected, isSearching, socket]);

  useEffect(() => {
    if (mode !== 'video' || !localStream) return;
    faceCheckIntervalRef.current = setInterval(checkFacePresence, 3000);
    return () => {
      if (faceCheckIntervalRef.current) clearInterval(faceCheckIntervalRef.current);
    };
  }, [mode, localStream, checkFacePresence]);

  const handleDisconnect = (reason: string) => {
    setIsConnected(false);
    setRemoteStream(null);
    setRoomId(null);
    setIsAdminConnected(false);
    // Clear remote video to avoid frozen frame (Bug 4)
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (currentCallRef.current) {
      currentCallRef.current.close();
      currentCallRef.current = null;
    }
    partnerIdRef.current = null;
  };

  const findNextRef = useRef<() => void>(() => {});
  const findNext = async () => {
    if (!socket) return;
    if (mode === 'video' && !videoEnabled) return;

    // Token check: 7 tokens per video call
    if (mode === 'video' && !isAdmin) {
      if (tokensRef.current < videoCallCost) {
        setConnectionError(`Not enough tokens! You need ${videoCallCost} tokens per video call. You have ${tokensRef.current} left.`);
        setTimeout(() => onExit(), 5000);
        return;
      }
    }

    if (mode === 'video') {
      let stream = localStreamRef.current;
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: currentDeviceId ? { exact: currentDeviceId } : undefined,
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 }
            },
            audio: true
          });
          setLocalStream(stream);
          localStreamRef.current = stream;
        } catch (err) {
          alert(t.cameraRequired);
          onExit();
          return;
        }
      }
    }

    setIsSearching(true);
    if (peerRef.current?.id) {
      socket.emit('join-queue', {
        peerId: peerRef.current.id,
        uid: user?.uid,
        email: user?.email,
        isAdmin,
        mode
      });
    } else {
      peerRef.current?.once('open', (id) => socket.emit('join-queue', {
        peerId: id,
        uid: user?.uid,
        email: user?.email,
        isAdmin,
        mode
      }));
    }
  };
  findNextRef.current = findNext;

  useEffect(() => {
    if (showChat) {
      setUnreadCount(0);
    }
  }, [showChat]);

  const handleNewMessage = () => {
    if (!showChat && mode === 'video') {
      setUnreadCount(prev => prev + 1);
    }
  };

  const handleNext = () => {
    if (socket) socket.emit('next');
    handleDisconnect('User skipped');
    setAudioEnabled(true);
    findNext();
  };

  const handleDrop = () => {
    if (socket) socket.emit('next');
    handleDisconnect('User dropped');
    onExit();
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = !videoEnabled);
      setVideoEnabled(!videoEnabled);
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !audioEnabled);
      setAudioEnabled(!audioEnabled);
    }
  };

  const sendReaction = (type: string) => {
    if (socket && roomId) {
      socket.emit('reaction', { roomId, type });
      setReaction(type);
      setTimeout(() => setReaction(null), 2000);
    }
  };

  const submitReport = async () => {
    if (!partnerIdRef.current || !user || !reportReason) return;

    try {
      await addDoc(collection(db, 'reports'), {
        reporterId: user.uid,
        reporterEmail: user.email,
        reportedId: partnerUidRef.current,
        violatorUid: partnerUidRef.current,
        violatorEmail: partnerEmailRef.current,
        violatorName: partnerEmailRef.current,
        reason: reportReason,
        timestamp: Timestamp.now(),
        roomId: roomId
      });
      setShowReportModal(false);
      setReportReason('');
      handleNext();
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'reports');
    }
  };



  return (
    <div className="flex flex-col h-[100dvh] bg-neutral-950 text-white overflow-hidden font-sans selection:bg-emerald-500/30">
      {/* Hidden canvas for face detection */}
      <canvas ref={faceCanvasRef} className="hidden" />

      {/* 18+ Age Consent Modal */}
      <AnimatePresence>
        {showAgeConsent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-neutral-950/95 backdrop-blur-2xl flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-neutral-900 border border-red-500/30 rounded-[40px] p-10 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7 text-red-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tighter">Age Verification</h2>
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Adults Only — 18+</p>
                </div>
              </div>
              <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 mb-8 space-y-3">
                <p className="text-sm text-neutral-300 leading-relaxed">
                  This platform is strictly for users aged <span className="font-black text-red-400">18 years or older</span>.
                </p>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  By continuing, you confirm that you are at least 18 years old and agree to our Terms of Service. You may encounter adult language and content. Minors are strictly prohibited.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => { setShowAgeConsent(false); setShowIntro(true); }}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20"
                >
                  I am 18 or older — Continue
                </button>
                <button
                  onClick={onExit}
                  className="w-full py-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded-2xl font-black text-sm uppercase tracking-widest transition-all"
                >
                  I am under 18 — Exit
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Face Detection Warning */}
      <AnimatePresence>
        {faceDetectionWarning && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[90] bg-red-500 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-black uppercase tracking-widest"
          >
            <AlertTriangle className="w-4 h-4" />
            No face detected — session paused
          </motion.div>
        )}
      </AnimatePresence>

      {/* Intro Overlay */}
      <AnimatePresence>
        {showIntro && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-neutral-950/90 backdrop-blur-2xl flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-xl w-full bg-neutral-900 border border-neutral-800 rounded-[40px] p-10 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />

              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center">
                  <ShieldAlert className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tighter ">{t.protocolInit}</h2>
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{t.securityHandshake}</p>
                </div>
              </div>

              <div className="space-y-6 mb-10">
                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-emerald-500">01</span>
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-widest mb-1 ">Camera Requirement</p>
                    <p className="text-xs text-neutral-500 leading-relaxed">{t.cameraMandatory}</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-emerald-500">02</span>
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-widest mb-1 ">Moderation Policy</p>
                    <p className="text-xs text-neutral-500 leading-relaxed">{t.moderationPolicy}</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-emerald-500">03</span>
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-widest mb-1 ">Privacy Protocol</p>
                    <p className="text-xs text-neutral-500 leading-relaxed">{t.privacyProtocol}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowIntro(false);
                  findNext();
                }}
                className="w-full py-5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl font-black text-lg uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20"
              >
                {t.acceptInit}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-neutral-950/90 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-[40px] p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                  <h2 className="text-xl font-black uppercase tracking-tighter ">{t.reportTitle}</h2>
                </div>
                <button onClick={() => setShowReportModal(false)} className="p-2 hover:bg-neutral-800 rounded-full transition-colors">
                  <X className="w-5 h-5 text-neutral-500" />
                </button>
              </div>

              <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest mb-6">{t.reportReason}</p>

              <div className="space-y-3 mb-8">
                {[
                  { id: '18+', label: t.report18 },
                  { id: 'harm', label: t.reportHarm },
                  { id: 'violence', label: t.reportViolence },
                  { id: 'harassment', label: t.reportHarassment },
                  { id: 'spam', label: t.reportSpam }
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setReportReason(option.label)}
                    className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between group ${
                      reportReason === option.label
                        ? 'bg-red-500/10 border-red-500 text-red-500'
                        : 'bg-neutral-800/50 border-neutral-700 text-neutral-400 hover:border-neutral-600'
                    }`}
                  >
                    <span className="text-xs font-black uppercase tracking-widest">{option.label}</span>
                    <div className={`w-4 h-4 rounded-full border-2 transition-all ${
                      reportReason === option.label ? 'bg-red-500 border-red-500' : 'border-neutral-700'
                    }`} />
                  </button>
                ))}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setShowReportModal(false)}
                  className="flex-1 py-4 bg-neutral-800 hover:bg-neutral-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={submitReport}
                  disabled={!reportReason}
                  className="flex-1 py-4 bg-red-500 hover:bg-red-400 disabled:opacity-30 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-red-500/20"
                >
                  {t.report}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-neutral-900 bg-neutral-950 z-30">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Ghost className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="hidden xs:block">
              <h1 className="text-xl sm:text-2xl font-black tracking-widest uppercase leading-none font-brand bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">{t.appName}</h1>
              <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-neutral-600 mt-1">{mode === 'video' ? 'Video Protocol v2.5' : 'Anonymous Text v1.0'}</p>
            </div>
          </div>

          <div className="h-6 sm:h-8 w-px bg-neutral-900 mx-1 sm:mx-2" />

          <StatsDisplay mode={mode} />

          {/* 5-min session timer in header beside Video Chatting */}
          {mode === 'video' && isConnected && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
              style={{ background: videoTimer <= 30 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.05)', borderColor: videoTimer <= 30 ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.12)' }}>
              <div className={`w-1.5 h-1.5 rounded-full ${videoTimer <= 30 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="text-[11px] font-black font-mono tabular-nums"
                style={{ color: videoTimer <= 30 ? '#ef4444' : videoTimer <= 60 ? '#f59e0b' : '#10b981' }}>
                {Math.floor(videoTimer / 60)}:{String(videoTimer % 60).padStart(2, '0')}
              </span>
              <span className="text-[8px] font-bold uppercase tracking-widest text-neutral-600 hidden sm:inline">left</span>
            </div>
          )}

          {mode === 'video' && !isAdmin && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl border"
              style={{ background: 'rgba(16,185,129,0.04)', borderColor: tokens < videoCallCost ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.12)' }}>
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] font-black uppercase tracking-widest leading-none"
                  style={{ color: 'rgba(16,185,129,0.5)' }}>Tokens</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] font-black tabular-nums leading-none"
                    style={{ color: tokens < videoCallCost ? '#ef4444' : tokens < 20 ? '#f59e0b' : '#10b981' }}>
                    {tokens}
                  </span>
                  <span className="text-[9px] text-neutral-500 font-bold">/{videoCallCost} per call</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={handleDrop}
            className="group flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all duration-300"
          >
            <PhoneOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:rotate-12 transition-transform" />
            <span className="hidden sm:inline">{t.terminateSession}</span>
            <span className="sm:hidden">{t.exit}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative bg-neutral-950">

        {/* Video Section */}
        {mode === 'video' ? (
          <div className="flex-1 relative flex flex-col items-center justify-center p-2 sm:p-4 md:p-8 min-h-0">
            <div className="relative w-full h-full bg-neutral-900 overflow-hidden">
              <div className="absolute inset-0 opacity-[0.05] pointer-events-none"
                   style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`w-full h-full object-contain ${!isConnected ? 'hidden' : ''}`}
              />

              <AnimatePresence>
                {isAdminConnected && (
                  <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="absolute top-4 left-1/2 -translate-x-1/2 z-40"
                  >
                    <div className="flex items-center gap-3 px-6 py-3 bg-emerald-500 text-black rounded-full shadow-2xl border border-emerald-400/50">
                      <ShieldAlert className="w-5 h-5 animate-pulse" />
                      <span className="text-xs font-black uppercase tracking-widest ">Connected to Admin</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!isConnected && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                  {isSearching ? (
                    <div className="flex flex-col items-center gap-6 sm:gap-8">
                      <div className="relative">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                          className="w-24 h-24 sm:w-32 sm:h-32 border-2 border-dashed border-emerald-500/30 rounded-full"
                        />
                        <div className="absolute inset-0 m-auto w-16 h-16 sm:w-24 sm:h-24 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin" />
                        <Video className="absolute inset-0 m-auto w-8 h-8 sm:w-10 sm:h-10 text-emerald-500 animate-pulse" />
                      </div>
                      <div className="text-center">
                        <p className="text-xl sm:text-2xl font-black uppercase tracking-[0.2em] text-emerald-500  mb-2">{t.searching}</p>
                        <p className="text-[8px] sm:text-[10px] font-bold text-neutral-600 uppercase tracking-[0.4em]">{t.scanning}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 sm:gap-6">
                      <div className="w-16 h-16 sm:w-24 sm:h-24 bg-neutral-800 rounded-2xl sm:rounded-3xl flex items-center justify-center border border-neutral-700">
                        <VideoOff className="w-8 h-8 sm:w-12 sm:h-12 text-neutral-600" />
                      </div>
                      <p className="text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-neutral-600">{t.protocolStandby}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="fixed top-20 left-4 w-20 sm:w-24 md:w-32 aspect-square bg-neutral-950 rounded-xl overflow-hidden border-2 border-neutral-800 z-50">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover -scale-x-100 ${!videoEnabled ? 'hidden' : ''}`}
              />
              {!videoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                  <VideoOff className="w-6 h-6 sm:w-10 sm:h-10 text-neutral-700" />
                </div>
              )}
              <div className="absolute inset-0 pointer-events-none border-2 border-emerald-500/20 rounded-xl" />
            </div>

            <AnimatePresence>
              {reaction && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 1.5, y: -50 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
                >
                  <span className="text-[6rem] sm:text-[12rem] drop-shadow-[0_0_60px_rgba(0,0,0,0.8)]">
                    {reaction === 'like' && '👍'}
                    {reaction === 'wave' && '👋'}
                    {reaction === 'laugh' && '😂'}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {isConnected && (
              <button
                onClick={() => setShowReportModal(true)}
                className="fixed top-20 right-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-black text-xs uppercase tracking-widest transition-all z-50 shadow-lg"
              >
                {t.report}
              </button>
            )}

            <div className="absolute top-0 left-0 w-8 h-8 sm:w-12 sm:h-12 border-t-2 border-l-2 border-emerald-500/30 rounded-tl-2xl sm:rounded-tl-[40px] pointer-events-none" />
            <div className="absolute top-0 right-0 w-8 h-8 sm:w-12 sm:h-12 border-t-2 border-r-2 border-emerald-500/30 rounded-tr-2xl sm:rounded-tr-[40px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-8 h-8 sm:w-12 sm:h-12 border-b-2 border-l-2 border-emerald-500/30 rounded-bl-2xl sm:rounded-bl-[40px] pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-8 h-8 sm:w-12 sm:h-12 border-b-2 border-r-2 border-emerald-500/30 rounded-br-2xl sm:rounded-br-[40px] pointer-events-none" />

            <div className="mt-4 sm:mt-6 md:mt-10 flex items-center gap-2 sm:gap-4 md:gap-6 z-30 mb-4 shrink-0">
              <button
                onClick={handleNext}
                disabled={!isConnected && !isSearching}
                className="group relative flex items-center gap-2 sm:gap-4 px-6 sm:px-8 md:px-12 py-3 sm:py-4 md:py-5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl sm:rounded-2xl md:rounded-3xl font-black text-sm sm:text-lg md:text-xl transition-all shadow-2xl shadow-emerald-500/20 uppercase tracking-tighter overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                Skip
                <SkipForward className="w-4 h-4 sm:w-6 sm:h-6 md:w-7 md:h-7 group-hover:translate-x-2 transition-transform duration-500" />
              </button>

              <div className="flex items-center gap-1 sm:gap-2 md:gap-3 bg-neutral-900 p-1 sm:p-2 md:p-3 rounded-xl sm:rounded-2xl md:rounded-3xl border border-neutral-800 shadow-2xl">
                <button onClick={toggleAudio} className="p-3 sm:p-4 hover:bg-neutral-800 rounded-2xl transition-all disabled:opacity-20 group">
                  {audioEnabled ? <Mic className="w-5 h-5 sm:w-6 sm:h-6" /> : <MicOff className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />}
                </button>
                <button onClick={() => setShowChat(!showChat)} className={`relative p-3 sm:p-4 hover:bg-neutral-800 rounded-2xl transition-all group lg:hidden ${showChat ? 'bg-emerald-500/20 text-emerald-500' : ''}`}>
                  <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform" />
                  {unreadCount > 0 && !showChat && (
                    <span className="absolute top-1 right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-500 text-white text-[10px] sm:text-xs font-bold flex items-center justify-center rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={`relative flex flex-col items-center justify-center p-2 sm:p-4 md:p-8 min-h-[40vh] lg:min-h-0 ${isConnected ? 'hidden' : 'flex-1'}`}>
            <div className="relative w-full h-full max-w-4xl bg-neutral-900 rounded-xl sm:rounded-2xl md:rounded-[40px] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-neutral-800 flex flex-col items-center justify-center text-center p-8">
              <div className="absolute inset-0 opacity-[0.05] pointer-events-none"
                   style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

              {!isConnected && (
                <AnimatePresence mode="wait">
                  {isSearching ? (
                    <motion.div
                      key="searching-text"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.1 }}
                      className="flex flex-col items-center"
                    >
                      <div className="relative mb-8">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                          className="w-24 h-24 sm:w-32 sm:h-32 rounded-full border-2 border-emerald-500/20 border-t-emerald-500"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <MessageSquare className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-500 animate-pulse" />
                        </div>
                      </div>
                      <h2 className="text-2xl sm:text-4xl font-black tracking-tighter uppercase  mb-4">{t.scanning}</h2>
                      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{t.searching}</span>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="standby-text"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center"
                    >
                      <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-neutral-800 flex items-center justify-center mb-8 border border-neutral-700">
                        <Ghost className="w-10 h-10 sm:w-12 sm:h-12 text-neutral-600" />
                      </div>
                      <h2 className="text-2xl sm:text-4xl font-black tracking-tighter uppercase  mb-4 text-neutral-500">{t.anonymousChat}</h2>
                      <p className="text-neutral-600 mb-8 max-w-xs">{t.anonymousChatDesc}</p>
                      <button
                        onClick={findNext}
                        className="group relative px-10 sm:px-12 py-4 sm:py-5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-black rounded-2xl font-black text-lg sm:text-xl uppercase tracking-tighter  flex items-center gap-3 hover:from-emerald-400 hover:to-emerald-500 transition-all shadow-2xl shadow-emerald-500/20"
                      >
                        {t.startTextChat}
                        <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-2 transition-transform" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </div>
        )}

        {/* Chat Section */}
        <div className={`
          flex flex-col
          ${mode === 'video' ? 'w-full lg:w-[450px] h-[45vh] lg:h-full border-t lg:border-t-0 lg:border-l absolute lg:relative bottom-0 left-0 right-0 z-40' : (isConnected ? 'w-full h-full flex-1' : 'hidden')}
          border-neutral-900 bg-neutral-950/95 lg:bg-neutral-950/50 backdrop-blur-2xl lg:backdrop-blur-xl
          transition-all duration-500
          ${mode === 'video' && !showChat ? 'translate-y-full lg:translate-y-0 lg:flex' : 'translate-y-0'}
        `}>
          <div className="h-full w-full flex flex-col">
            <div className="p-4 sm:p-6 border-b border-neutral-900 flex items-center gap-3 bg-neutral-950/50">
              <Terminal className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-500">{t.sessionLog}</span>
              {mode === 'text' && (
                <span className="ml-auto mr-0 text-[9px] font-mono text-neutral-600">
                  Chat: <span className="text-neutral-400">2599</span> chars/session
                </span>
              )}

              <div className="ml-auto flex items-center gap-4">
                {mode === 'text' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleNext}
                      disabled={!isConnected && !isSearching}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-black text-xs uppercase tracking-widest transition-all"
                    >
                      Skip
                      <SkipForward className="w-3 h-3" />
                    </button>
                    {isConnected && (
                      <button
                        onClick={() => setShowReportModal(true)}
                        className="p-2 bg-neutral-800 hover:bg-red-500 text-white rounded-lg transition-all"
                      >
                        <Flag className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
                {isConnected && (
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-500">{t.encrypted}</span>
                  </div>
                )}
                {mode === 'video' && (
                  <button onClick={() => setShowChat(false)} className="lg:hidden p-2 hover:bg-neutral-800 rounded-lg transition-colors">
                    <X className="w-4 h-4 text-neutral-400" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {roomId && user ? (
                <Chat socket={socket} roomId={roomId} currentUserId={user.uid} onNewMessage={handleNewMessage} onChatLimitReached={handleNext} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-neutral-800 p-8 text-center">
                  <Terminal className="w-12 h-12 mb-4 opacity-10" />
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">{t.waitingPeer}</p>
                  <p className="text-[8px] font-bold uppercase tracking-[0.2em] mt-2 opacity-20">{t.secureChannel}</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};