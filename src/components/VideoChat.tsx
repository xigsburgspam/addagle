import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Video, VideoOff, Mic, MicOff, SkipForward, ThumbsUp, Hand, Smile, Users, PhoneOff, Flag, ShieldAlert, Terminal, Radio, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Peer, { MediaConnection } from 'peerjs';
import { useFirebase } from '../FirebaseContext';
import { db, collection, addDoc, Timestamp } from '../firebase';
import { Chat } from './Chat';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

interface VideoChatProps {
  onExit: () => void;
}

export const VideoChat: React.FC<VideoChatProps> = ({ onExit }) => {
  const { user, userData } = useFirebase();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [reaction, setReaction] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isAdminConnected, setIsAdminConnected] = useState(false);
  
  const [showIntro, setShowIntro] = useState(true);
  
  const [showChat, setShowChat] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const localVideoRef = useRef<HTMLVideoElement>(null);
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
      const errorType = err.type as string;
      if (['peer-unavailable', 'network', 'disconnected', 'negotiation-failed', 'webrtc'].includes(errorType)) {
        handleDisconnect('Connection error: ' + errorType);
        setTimeout(() => findNextRef.current(), 2000);
      }
    });

    peer.on('call', (call) => {
      console.log('Receiving call');
      call.answer(localStreamRef.current || undefined);
      call.on('stream', (remoteStream) => {
        setRemoteStream(remoteStream);
        setIsConnected(true);
      });
    });

    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users-online');
        if (res.ok) {
          const data = await res.json();
          setOnlineCount(data.count);
        }
      } catch (e) {}
    };
    fetchUsers();
    const interval = setInterval(fetchUsers, 5000);

    // Initial start
    const urlParams = new URLSearchParams(window.location.search);
    const adminRoom = urlParams.get('adminRoom');
    if (adminRoom) {
      peer.once('open', async (id) => {
        newSocket.emit('admin-join', { roomId: adminRoom, adminPeerId: id });
        setRoomId(adminRoom);
        setIsConnected(true);
        
        try {
          const res = await fetch('/api/active-rooms');
          const rooms = await res.json();
          const room = rooms.find((r: any) => r.id === adminRoom);
          if (room && localStreamRef.current) {
            Object.values(room.peerIds).forEach((pId: any) => {
              if (pId !== id) {
                peer.call(pId, localStreamRef.current!);
              }
            });
          }
        } catch (e) {
          console.error('Admin join call failed:', e);
        }
      });
    } else {
      // Don't call findNext automatically, wait for user to click "Connect" in intro
    }

    return () => {
      clearInterval(interval);
      newSocket.disconnect();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      peer.destroy();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('matched', async ({ partnerId, partnerPeerId, partnerUid, partnerEmail, initiator, roomId: rId }) => {
      setIsSearching(false);
      setIsConnected(true);
      setRoomId(rId);
      partnerIdRef.current = partnerId;
      partnerUidRef.current = partnerUid;
      partnerEmailRef.current = partnerEmail;

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
      findNext();
    });

    socket.on('partner-disconnected', () => {
      handleDisconnect('Partner disconnected');
      findNext();
    });

    socket.on('reaction', (data) => {
      setReaction(data.type);
      setTimeout(() => setReaction(null), 2000);
    });

    socket.on('admin-connected', () => {
      setIsAdminConnected(true);
    });

    return () => {
      socket.off('matched');
      socket.off('partner-skipped');
      socket.off('partner-disconnected');
      socket.off('reaction');
      socket.off('admin-connected');
    };
  }, [socket]);

  useEffect(() => {
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
    if (!socket || !videoEnabled) return;
    
    let stream = localStreamRef.current;
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        localStreamRef.current = stream;
      } catch (err) {
        alert('Camera and Microphone are required to use ADDAgle.');
        onExit();
        return;
      }
    }

    setIsSearching(true);
    if (peerRef.current?.id) {
      socket.emit('join-queue', { 
        peerId: peerRef.current.id, 
        uid: user?.uid, 
        email: user?.email 
      });
    } else {
      peerRef.current?.once('open', (id) => socket.emit('join-queue', { 
        peerId: id, 
        uid: user?.uid, 
        email: user?.email 
      }));
    }
  };
  findNextRef.current = findNext;

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

  const reportUser = async () => {
    if (!partnerIdRef.current || !user) return;
    if (!confirm('Report this user for 18+ content?')) return;

    try {
      await addDoc(collection(db, 'reports'), {
        reporterId: user.uid,
        reporterEmail: user.email,
        reportedId: partnerUidRef.current,
        reportedEmail: partnerEmailRef.current,
        reason: '18+ Content / Inappropriate Behavior',
        timestamp: Timestamp.now(),
        roomId: roomId
      });
      alert('User reported. Thank you for keeping ADDAgle safe.');
      handleNext();
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'reports');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-white overflow-hidden font-sans selection:bg-emerald-500/30">
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
                  <h2 className="text-2xl font-black uppercase tracking-tighter italic">Protocol Initialization</h2>
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Security Handshake Required</p>
                </div>
              </div>

              <div className="space-y-6 mb-10">
                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-emerald-500">01</span>
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-widest mb-1 italic">Camera Requirement</p>
                    <p className="text-xs text-neutral-500 leading-relaxed">Active video feed is mandatory. Disabling your camera will terminate the session immediately.</p>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-emerald-500">02</span>
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-widest mb-1 italic">Moderation Policy</p>
                    <p className="text-xs text-neutral-500 leading-relaxed">ADDAgle is a safe environment. Any inappropriate behavior or 18+ content will result in a permanent hardware ban.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-emerald-500">03</span>
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-widest mb-1 italic">Privacy Protocol</p>
                    <p className="text-xs text-neutral-500 leading-relaxed">All sessions are end-to-end encrypted. No data is stored or logged beyond the duration of the encounter.</p>
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
                Accept & Initialize
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hardware-style Header */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-neutral-900 bg-neutral-950 z-30">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Video className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="hidden xs:block">
              <h1 className="text-xl sm:text-2xl font-black tracking-tighter italic uppercase leading-none">ADDAgle</h1>
              <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-neutral-600 mt-1">Video Protocol v2.5</p>
            </div>
          </div>
          
          <div className="h-6 sm:h-8 w-px bg-neutral-900 mx-1 sm:mx-2" />
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-neutral-900 rounded-lg border border-neutral-800">
              <Activity className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-500" />
              <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-neutral-400">Live</span>
              <span className="text-[8px] sm:text-[10px] font-mono text-emerald-500">{onlineCount.toString().padStart(4, '0')}</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-neutral-900 rounded-lg border border-neutral-800">
              <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Signal</span>
              <span className="text-[10px] font-mono text-emerald-500">98%</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <button 
            onClick={() => setShowChat(!showChat)}
            className={`lg:hidden flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${showChat ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-neutral-900 text-neutral-400 border-neutral-800'}`}
          >
            <Smile className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Chat</span>
          </button>
          <button 
            onClick={handleDrop}
            className="group flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all duration-300"
          >
            <PhoneOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:rotate-12 transition-transform" />
            <span className="hidden sm:inline">Terminate Session</span>
            <span className="sm:hidden">Exit</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative bg-neutral-950">
        
        {/* Video Section */}
        <div className="flex-1 relative flex flex-col items-center justify-center p-2 sm:p-4 md:p-8">
          
          <div className="relative w-full h-full max-w-6xl aspect-video bg-neutral-900 rounded-xl sm:rounded-2xl md:rounded-[40px] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-neutral-800">
            
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
                      <p className="text-xl sm:text-2xl font-black uppercase tracking-[0.2em] text-emerald-500 italic mb-2">Searching Node</p>
                      <p className="text-[8px] sm:text-[10px] font-bold text-neutral-600 uppercase tracking-[0.4em]">Scanning Global Network...</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 sm:gap-6">
                    <div className="w-16 h-16 sm:w-24 sm:h-24 bg-neutral-800 rounded-2xl sm:rounded-3xl flex items-center justify-center border border-neutral-700">
                      <VideoOff className="w-8 h-8 sm:w-12 sm:h-12 text-neutral-600" />
                    </div>
                    <p className="text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-neutral-600">Protocol Standby</p>
                  </div>
                )}
              </div>
            )}

            {/* Admin Notification Overlay */}
            <AnimatePresence>
              {isAdminConnected && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute top-4 left-4 sm:top-10 sm:left-10 bg-emerald-500 text-black px-4 py-2 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4 z-40 font-black text-[10px] sm:text-xs shadow-2xl shadow-emerald-500/40 uppercase italic tracking-widest"
                >
                  <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />
                  Active Admin Surveillance
                </motion.div>
              )}
            </AnimatePresence>

            {/* Local Video (Technical PiP) */}
            <div className="absolute bottom-4 right-4 sm:bottom-10 sm:right-10 w-32 sm:w-48 md:w-72 aspect-video bg-neutral-950 rounded-xl sm:rounded-3xl overflow-hidden shadow-2xl border-2 border-neutral-800 z-20 group">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${!videoEnabled ? 'hidden' : ''}`}
              />
              {!videoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                  <VideoOff className="w-6 h-6 sm:w-10 sm:h-10 text-neutral-700" />
                </div>
              )}
              
              {/* Technical Overlay for Local Video */}
              <div className="absolute inset-0 pointer-events-none border-2 border-emerald-500/20 rounded-xl sm:rounded-3xl" />
              <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex items-center gap-1 sm:gap-2">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[6px] sm:text-[8px] font-bold uppercase tracking-widest text-emerald-500">Local Node</span>
              </div>

              <div className="absolute inset-0 bg-neutral-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 sm:gap-4">
                <button onClick={toggleAudio} className="p-2 sm:p-3 bg-neutral-900 border border-neutral-800 rounded-xl sm:rounded-2xl hover:bg-neutral-800 transition-colors">
                  {audioEnabled ? <Mic className="w-4 h-4 sm:w-5 sm:h-5" /> : <MicOff className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />}
                </button>
              </div>
            </div>

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
                onClick={reportUser}
                className="absolute top-4 right-4 sm:top-10 sm:right-10 p-2 sm:p-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl sm:rounded-2xl transition-all border border-red-500/20 group z-20 shadow-2xl"
              >
                <Flag className="w-4 h-4 sm:w-6 sm:h-6" />
                <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 bg-red-500 text-white text-[8px] sm:text-[10px] font-black px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap uppercase tracking-widest italic">Report Violation</span>
              </button>
            )}

            {/* Corner Accents */}
            <div className="absolute top-0 left-0 w-8 h-8 sm:w-12 sm:h-12 border-t-2 border-l-2 border-emerald-500/30 rounded-tl-2xl sm:rounded-tl-[40px] pointer-events-none" />
            <div className="absolute top-0 right-0 w-8 h-8 sm:w-12 sm:h-12 border-t-2 border-r-2 border-emerald-500/30 rounded-tr-2xl sm:rounded-tr-[40px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-8 h-8 sm:w-12 sm:h-12 border-b-2 border-l-2 border-emerald-500/30 rounded-bl-2xl sm:rounded-bl-[40px] pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-8 h-8 sm:w-12 sm:h-12 border-b-2 border-r-2 border-emerald-500/30 rounded-br-2xl sm:rounded-br-[40px] pointer-events-none" />
          </div>

          {/* Controls Bar - Hardware Style */}
          <div className="mt-4 sm:mt-6 md:mt-10 flex items-center gap-2 sm:gap-4 md:gap-6 z-30 mb-4">
            <button
              onClick={handleNext}
              disabled={!isConnected && !isSearching}
              className="group relative flex items-center gap-2 sm:gap-4 px-6 sm:px-8 md:px-12 py-3 sm:py-4 md:py-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl sm:rounded-2xl md:rounded-3xl font-black text-sm sm:text-lg md:text-xl transition-all shadow-2xl shadow-emerald-500/20 uppercase tracking-tighter italic overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              Next Node
              <SkipForward className="w-4 h-4 sm:w-6 sm:h-6 md:w-7 md:h-7 group-hover:translate-x-2 transition-transform duration-500" />
            </button>

            <div className="flex items-center gap-1 sm:gap-2 md:gap-3 bg-neutral-900 p-1 sm:p-2 md:p-3 rounded-xl sm:rounded-2xl md:rounded-3xl border border-neutral-800 shadow-2xl">
              <button onClick={() => sendReaction('like')} disabled={!isConnected} className="p-2 sm:p-4 hover:bg-neutral-800 rounded-xl sm:rounded-2xl transition-all disabled:opacity-20 group">
                <ThumbsUp className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform" />
              </button>
              <button onClick={() => sendReaction('wave')} disabled={!isConnected} className="p-2 sm:p-4 hover:bg-neutral-800 rounded-xl sm:rounded-2xl transition-all disabled:opacity-20 group">
                <Hand className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform" />
              </button>
              <button onClick={() => sendReaction('laugh')} disabled={!isConnected} className="p-2 sm:p-4 hover:bg-neutral-800 rounded-xl sm:rounded-2xl transition-all disabled:opacity-20 group">
                <Smile className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform" />
              </button>
            </div>
          </div>
        </div>

        {/* Chat Section - Technical Sidebar */}
        <div className={`
          fixed inset-0 z-50 lg:relative lg:inset-auto lg:z-0
          ${showChat ? 'flex' : 'hidden lg:flex'}
          w-full lg:w-[450px] h-full lg:h-full border-t lg:border-t-0 lg:border-l border-neutral-900 bg-neutral-950/95 lg:bg-neutral-950/50 backdrop-blur-2xl lg:backdrop-blur-xl
          transition-all duration-500
        `}>
          <div className="h-full w-full flex flex-col">
            <div className="p-4 sm:p-6 border-b border-neutral-900 flex items-center gap-3 bg-neutral-950/50">
              <Terminal className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-500 italic">Session Log</span>
              
              <div className="ml-auto flex items-center gap-4">
                {isConnected && (
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-500">Encrypted</span>
                  </div>
                )}
                <button 
                  onClick={() => setShowChat(false)}
                  className="lg:hidden p-2 hover:bg-neutral-900 rounded-lg transition-colors"
                >
                  <SkipForward className="w-4 h-4 text-neutral-500 rotate-90" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {roomId && user ? (
                <Chat socket={socket} roomId={roomId} currentUserId={user.uid} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-neutral-800 p-8 text-center">
                  <Terminal className="w-12 h-12 mb-4 opacity-10" />
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Waiting for peer connection...</p>
                  <p className="text-[8px] font-bold uppercase tracking-[0.2em] mt-2 opacity-20">Secure channel will initialize upon handshake</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
