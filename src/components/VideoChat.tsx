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
  
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const currentCallRef = useRef<MediaConnection | null>(null);
  const partnerIdRef = useRef<string | null>(null);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    const peer = new Peer({
      debug: 3,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun.services.mozilla.com' },
          {
            urls: 'turn:free.expressturn.com:3478',
            username: '000000002089091968',
            credential: 'RMGzeBVkbqAMUd3DD+dKHoiFy4o='
          },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
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
      findNext();
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

    socket.on('matched', async ({ partnerId, partnerPeerId, initiator, roomId: rId }) => {
      setIsSearching(false);
      setIsConnected(true);
      setRoomId(rId);
      partnerIdRef.current = partnerId;

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
      socket.emit('join-queue', peerRef.current.id);
    } else {
      peerRef.current?.once('open', (id) => socket.emit('join-queue', id));
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
        reportedId: partnerIdRef.current,
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
      {/* Hardware-style Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-neutral-900 bg-neutral-950 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter italic uppercase leading-none">ADDAgle</h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-600 mt-1">Video Protocol v2.5</p>
            </div>
          </div>
          
          <div className="h-8 w-px bg-neutral-900 mx-2" />
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 rounded-lg border border-neutral-800">
              <Activity className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Live</span>
              <span className="text-[10px] font-mono text-emerald-500">{onlineCount.toString().padStart(4, '0')}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 rounded-lg border border-neutral-800">
              <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Signal</span>
              <span className="text-[10px] font-mono text-emerald-500">98%</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={handleDrop}
            className="group flex items-center gap-3 px-6 py-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all duration-300"
          >
            <PhoneOff className="w-4 h-4 group-hover:rotate-12 transition-transform" />
            Terminate Session
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative bg-neutral-950">
        
        {/* Video Section */}
        <div className="flex-1 relative flex flex-col items-center justify-center p-8">
          
          <div className="relative w-full h-full max-w-6xl aspect-video bg-neutral-900 rounded-[40px] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-neutral-800">
            
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
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {isSearching ? (
                  <div className="flex flex-col items-center gap-8">
                    <div className="relative">
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                        className="w-32 h-32 border-2 border-dashed border-emerald-500/30 rounded-full" 
                      />
                      <div className="absolute inset-0 m-auto w-24 h-24 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin" />
                      <Video className="absolute inset-0 m-auto w-10 h-10 text-emerald-500 animate-pulse" />
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-black uppercase tracking-[0.2em] text-emerald-500 italic mb-2">Searching Node</p>
                      <p className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.4em]">Scanning Global Network...</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-6">
                    <div className="w-24 h-24 bg-neutral-800 rounded-3xl flex items-center justify-center border border-neutral-700">
                      <VideoOff className="w-12 h-12 text-neutral-600" />
                    </div>
                    <p className="text-sm font-black uppercase tracking-[0.3em] text-neutral-600">Protocol Standby</p>
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
                  className="absolute top-10 left-10 bg-emerald-500 text-black px-6 py-3 rounded-2xl flex items-center gap-4 z-40 font-black text-xs shadow-2xl shadow-emerald-500/40 uppercase italic tracking-widest"
                >
                  <ShieldAlert className="w-5 h-5" />
                  Active Admin Surveillance
                </motion.div>
              )}
            </AnimatePresence>

            {/* Local Video (Technical PiP) */}
            <div className="absolute bottom-10 right-10 w-48 sm:w-72 aspect-video bg-neutral-950 rounded-3xl overflow-hidden shadow-2xl border-2 border-neutral-800 z-20 group">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${!videoEnabled ? 'hidden' : ''}`}
              />
              {!videoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                  <VideoOff className="w-10 h-10 text-neutral-700" />
                </div>
              )}
              
              {/* Technical Overlay for Local Video */}
              <div className="absolute inset-0 pointer-events-none border-2 border-emerald-500/20 rounded-3xl" />
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-500">Local Node</span>
              </div>

              <div className="absolute inset-0 bg-neutral-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                <button onClick={toggleAudio} className="p-3 bg-neutral-900 border border-neutral-800 rounded-2xl hover:bg-neutral-800 transition-colors">
                  {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 text-red-500" />}
                </button>
                <button onClick={toggleVideo} className="p-3 bg-neutral-900 border border-neutral-800 rounded-2xl hover:bg-neutral-800 transition-colors">
                  {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5 text-red-500" />}
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
                  <span className="text-[12rem] drop-shadow-[0_0_60px_rgba(0,0,0,0.8)]">
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
                className="absolute top-10 right-10 p-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl transition-all border border-red-500/20 group z-20 shadow-2xl"
              >
                <Flag className="w-6 h-6" />
                <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 bg-red-500 text-white text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap uppercase tracking-widest italic">Report Violation</span>
              </button>
            )}

            {/* Corner Accents */}
            <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-emerald-500/30 rounded-tl-[40px] pointer-events-none" />
            <div className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-emerald-500/30 rounded-tr-[40px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 border-emerald-500/30 rounded-bl-[40px] pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-12 h-12 border-b-2 border-r-2 border-emerald-500/30 rounded-br-[40px] pointer-events-none" />
          </div>

          {/* Controls Bar - Hardware Style */}
          <div className="mt-10 flex items-center gap-6 z-30">
            <button
              onClick={handleNext}
              disabled={!isConnected && !isSearching}
              className="group relative flex items-center gap-4 px-12 py-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-3xl font-black text-xl transition-all shadow-2xl shadow-emerald-500/20 uppercase tracking-tighter italic overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              Next Node
              <SkipForward className="w-7 h-7 group-hover:translate-x-2 transition-transform duration-500" />
            </button>

            <div className="flex items-center gap-3 bg-neutral-900 p-3 rounded-3xl border border-neutral-800 shadow-2xl">
              <button onClick={() => sendReaction('like')} disabled={!isConnected} className="p-4 hover:bg-neutral-800 rounded-2xl transition-all disabled:opacity-20 group">
                <ThumbsUp className="w-6 h-6 group-hover:scale-110 transition-transform" />
              </button>
              <button onClick={() => sendReaction('wave')} disabled={!isConnected} className="p-4 hover:bg-neutral-800 rounded-2xl transition-all disabled:opacity-20 group">
                <Hand className="w-6 h-6 group-hover:scale-110 transition-transform" />
              </button>
              <button onClick={() => sendReaction('laugh')} disabled={!isConnected} className="p-4 hover:bg-neutral-800 rounded-2xl transition-all disabled:opacity-20 group">
                <Smile className="w-6 h-6 group-hover:scale-110 transition-transform" />
              </button>
            </div>
          </div>
        </div>

        {/* Chat Section - Technical Sidebar */}
        <AnimatePresence>
          {isConnected && roomId && user && (
            <motion.div
              initial={{ opacity: 0, x: 400 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 400 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-full lg:w-[450px] h-full border-l border-neutral-900 bg-neutral-950/50 backdrop-blur-xl"
            >
              <div className="h-full flex flex-col">
                <div className="p-6 border-b border-neutral-900 flex items-center gap-3">
                  <Terminal className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-black uppercase tracking-[0.3em] text-neutral-500 italic">Session Log</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <Chat socket={socket} roomId={roomId} currentUserId={user.uid} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};
