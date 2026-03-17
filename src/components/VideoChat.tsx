import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Video, VideoOff, Mic, MicOff, SkipForward, ThumbsUp, Hand, Smile, Users, PhoneOff, Flag, ShieldAlert, Terminal, Radio, Activity, X, AlertTriangle, Ghost, MessageSquare, ArrowRight, UserCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Peer, { MediaConnection } from 'peerjs';
import Draggable from 'react-draggable';
import { useFirebase } from '../FirebaseContext';
import { useLanguage } from '../LanguageContext';
import { db, collection, addDoc, Timestamp, doc, setDoc, increment } from '../firebase';
import { Chat } from './Chat';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

interface VideoChatProps {
  onExit: () => void;
  mode: 'video' | 'text';
}

export const VideoChat: React.FC<VideoChatProps> = ({ onExit, mode }) => {
  const { user, userData } = useFirebase();
  const { t } = useLanguage();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    onlineUsers: 0,
    videoChatting: 0,
    textChatting: 0,
    totalVideoChats: 0,
    totalTextChats: 0
  });
  const [reaction, setReaction] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isAdminConnected, setIsAdminConnected] = useState(false);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(
    window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
  );
  
  const [showIntro, setShowIntro] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  
  const [showChat, setShowChat] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isMirrored, setIsMirrored] = useState(true);
  const [currentFilter, setCurrentFilter] = useState('none');
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

    const peer = new Peer({
      debug: 3,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: 'turn:free.expressturn.com:3478',
            username: '000000002089091968',
            credential: 'RMGzeBVkbqAMUd3DD+dKHoiFy4o='
          }
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
        // If it's a socket error, we might need to reconnect or recreate
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
      call.on('stream', (remoteStream) => {
        setRemoteStream(remoteStream);
        setIsConnected(true);
      });
    });

    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {}
    };

    const handleResize = () => {
      setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
    };

    fetchStats();
    window.addEventListener('resize', handleResize);
    const interval = setInterval(fetchStats, 5000);

    // Initial start
    // Don't call findNext automatically, wait for user to click "Connect" in intro

    return () => {
      clearInterval(interval);
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
      setIsConnected(true);
      setRoomId(rId);
      setIsAdminConnected(!!isPartnerAdmin);
      partnerIdRef.current = partnerId;
      partnerUidRef.current = partnerUid;
      partnerEmailRef.current = partnerEmail;

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

      if (initiator && localStreamRef.current) {
        const call = peerRef.current?.call(partnerPeerId, localStreamRef.current);
        if (call) {
          currentCallRef.current = call;
          call.on('stream', (remoteStream) => setRemoteStream(remoteStream));
        }
      }
    });

    socket.on('partner-skipped', () => {
      handleDisconnect('Partner skipped');
      setTimeout(() => findNext(), 1500); // Add delay to prevent race conditions
    });

    socket.on('partner-disconnected', () => {
      handleDisconnect('Partner disconnected');
      setTimeout(() => findNext(), 1500); // Add delay to prevent race conditions
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

    return () => {
      socket.off('matched');
      socket.off('partner-skipped');
      socket.off('partner-disconnected');
      socket.off('reaction');
      socket.off('admin-connected');
      socket.off('admin-disconnected-from-room');
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

  const handleDisconnect = (reason: string) => {
    setIsConnected(false);
    setRemoteStream(null);
    setRoomId(null);
    setIsAdminConnected(false);
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
    const isAdmin = user?.email === 'edublitz71@gmail.com';
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

  // Reset unread count when chat is opened
  useEffect(() => {
    if (showChat) {
      setUnreadCount(0);
    }
  }, [showChat]);

  // Handle new messages
  const handleNewMessage = () => {
    if (!showChat && mode === 'video') {
      setUnreadCount(prev => prev + 1);
    }
  };

  const handleNext = () => {
    if (socket) socket.emit('next');
    handleDisconnect('User skipped');
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
        reportedEmail: partnerEmailRef.current,
        reason: reportReason,
        timestamp: Timestamp.now(),
        roomId: roomId
      });
      alert(t.reportSuccess);
      setShowReportModal(false);
      setReportReason('');
      handleNext();
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'reports');
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-neutral-950 text-white overflow-hidden font-sans selection:bg-emerald-500/30">
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

      {/* Hardware-style Header */}
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
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-neutral-900 rounded-lg border border-neutral-800">
              <Activity className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-500" />
              <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-neutral-400">Live</span>
              <span className="text-[8px] sm:text-[10px] font-mono text-emerald-500">{stats.onlineUsers.toString().padStart(4, '0')}</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-neutral-900 rounded-lg border border-neutral-800">
              <Users className="w-3 h-3 text-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{mode === 'video' ? t.videoChatting : t.textChatting}</span>
              <span className="text-[10px] font-mono text-emerald-500">{mode === 'video' ? stats.videoChatting : stats.textChatting}</span>
            </div>
          </div>
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
            {/* Main Video Container Margin */}
            <div 
              className="relative w-full aspect-square bg-neutral-900 rounded-xl sm:rounded-2xl md:rounded-[40px] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-neutral-800 my-4 sm:my-8 md:my-16"
              style={{ maxWidth: 'min(56rem, calc(100vh - 24rem))' }}
            >
              
              {/* Background Grid for Empty State */}
              <div className="absolute inset-0 opacity-[0.05] pointer-events-none" 
                   style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

              {/* Remote Video */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`w-full h-full object-cover ${!isConnected ? 'hidden' : ''}`}
              />

              {/* Admin Connection Notification */}
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

              {/* Local Video (Technical PiP) - Movable */}
              <Draggable nodeRef={draggableRef} bounds="parent">
                <div 
                  ref={draggableRef}
                  className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 w-24 sm:w-32 md:w-48 aspect-square bg-neutral-950 rounded-xl sm:rounded-2xl overflow-hidden border-2 border-neutral-800 z-50 group cursor-move resize overflow-auto"
                >
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${!videoEnabled ? 'hidden' : ''} ${isMirrored ? 'scale-x-[-1]' : ''}`}
                    style={{ filter: currentFilter }}
                  />
                  {!videoEnabled && (
                    <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                      <VideoOff className="w-6 h-6 sm:w-10 sm:h-10 text-neutral-700" />
                    </div>
                  )}
                  
                  {/* Technical Overlay for Local Video */}
                  <div className="absolute inset-0 pointer-events-none border-2 border-emerald-500/20 rounded-xl sm:rounded-2xl" />
                  <div className="absolute top-1 left-1 sm:top-2 sm:left-2 flex items-center gap-1">
                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[6px] font-bold uppercase tracking-widest text-emerald-500">Local</span>
                  </div>
                </div>
              </Draggable>

              {/* Reaction Overlay */}
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

              {/* Hardware-style Report Button */}
              {isConnected && (
                <button
                  onClick={() => setShowReportModal(true)}
                  className="absolute top-4 right-4 sm:top-10 sm:right-10 p-2 sm:p-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl sm:rounded-2xl transition-all border border-red-500/20 group z-20 shadow-2xl"
                >
                  <Flag className="w-4 h-4 sm:w-6 sm:h-6" />
                  <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 bg-red-500 text-white text-[8px] sm:text-[10px] font-black px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap uppercase tracking-widest ">{t.reportViolation}</span>
                </button>
              )}

              {/* Corner Accents */}
              <div className="absolute top-0 left-0 w-8 h-8 sm:w-12 sm:h-12 border-t-2 border-l-2 border-emerald-500/30 rounded-tl-2xl sm:rounded-tl-[40px] pointer-events-none" />
              <div className="absolute top-0 right-0 w-8 h-8 sm:w-12 sm:h-12 border-t-2 border-r-2 border-emerald-500/30 rounded-tr-2xl sm:rounded-tr-[40px] pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-8 h-8 sm:w-12 sm:h-12 border-b-2 border-l-2 border-emerald-500/30 rounded-bl-2xl sm:rounded-bl-[40px] pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-8 h-8 sm:w-12 sm:h-12 border-b-2 border-r-2 border-emerald-500/30 rounded-br-2xl sm:rounded-br-[40px] pointer-events-none" />
            </div>

              {/* Controls Bar - Hardware Style */}
            <div className="mt-4 sm:mt-6 md:mt-10 flex items-center gap-2 sm:gap-4 md:gap-6 z-30 mb-4 shrink-0">
              <button
                onClick={handleNext}
                disabled={!isConnected && !isSearching}
                className="group relative flex items-center gap-2 sm:gap-4 px-6 sm:px-8 md:px-12 py-3 sm:py-4 md:py-5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl sm:rounded-2xl md:rounded-3xl font-black text-sm sm:text-lg md:text-xl transition-all shadow-2xl shadow-emerald-500/20 uppercase tracking-tighter  overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                {t.nextNode}
                <SkipForward className="w-4 h-4 sm:w-6 sm:h-6 md:w-7 md:h-7 group-hover:translate-x-2 transition-transform duration-500" />
              </button>

              <div className="flex items-center gap-1 sm:gap-2 md:gap-3 bg-neutral-900 p-1 sm:p-2 md:p-3 rounded-xl sm:rounded-2xl md:rounded-3xl border border-neutral-800 shadow-2xl">
                <button onClick={toggleAudio} className="p-3 sm:p-4 hover:bg-neutral-800 rounded-2xl transition-all disabled:opacity-20 group">
                  {audioEnabled ? <Mic className="w-5 h-5 sm:w-6 sm:h-6" /> : <MicOff className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />}
                </button>
                <select 
                  className="bg-neutral-800 text-xs text-white rounded-xl px-3 py-2 border border-neutral-700 hover:border-neutral-600 transition-all"
                  value={currentDeviceId}
                  onChange={(e) => {
                    const newDeviceId = e.target.value;
                    setCurrentDeviceId(newDeviceId);
                    if (localStreamRef.current) {
                      localStreamRef.current.getTracks().forEach(track => track.stop());
                      localStreamRef.current = null;
                    }
                    findNext();
                  }}
                >
                  {availableCameras.map(cam => (
                    <option key={cam.deviceId} value={cam.deviceId}>{cam.label || 'Camera'}</option>
                  ))}
                </select>
                <button 
                  className="bg-neutral-800 text-xs text-white rounded-xl px-3 py-2 border border-neutral-700 hover:border-neutral-600 transition-all"
                  onClick={() => setIsMirrored(!isMirrored)}
                >
                  {isMirrored ? 'Mirror Off' : 'Mirror On'}
                </button>
                <select 
                  className="bg-neutral-800 text-xs text-white rounded-xl px-3 py-2 border border-neutral-700 hover:border-neutral-600 transition-all"
                  value={currentFilter}
                  onChange={(e) => setCurrentFilter(e.target.value)}
                >
                  <option value="none">Normal</option>
                  <option value="sepia(1)">Vintage</option>
                  <option value="grayscale(1)">B&W</option>
                  <option value="hue-rotate(90deg)">Vibrant</option>
                  <option value="saturate(2) hue-rotate(20deg)">TikTok Colorful</option>
                  <option value="contrast(2)">High Contrast</option>
                </select>
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
        
        {/* Chat Section - Technical Sidebar */}
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
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-500 ">{t.sessionLog}</span>
              
              <div className="ml-auto flex items-center gap-4">
                {mode === 'text' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleNext}
                      disabled={!isConnected && !isSearching}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-black text-xs uppercase tracking-widest transition-all"
                    >
                      {t.nextNode}
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
                <Chat socket={socket} roomId={roomId} currentUserId={user.uid} onNewMessage={handleNewMessage} />
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
