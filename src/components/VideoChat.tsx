import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Video, VideoOff, Mic, MicOff, SkipForward, ThumbsUp, Hand, Smile, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Peer, { MediaConnection } from 'peerjs';

const MEETING_DURATION = 15; // seconds

export default function VideoChat() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [timeLeft, setTimeLeft] = useState(MEETING_DURATION);
  const [onlineCount, setOnlineCount] = useState(0);
  const [reaction, setReaction] = useState<string | null>(null);
  
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const currentCallRef = useRef<MediaConnection | null>(null);
  const partnerIdRef = useRef<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initialize Socket
    const newSocket = io();
    setSocket(newSocket);

    // Initialize PeerJS
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('My peer ID is: ' + id);
    });

    peer.on('call', (call) => {
      console.log('Receiving call');
      currentCallRef.current = call;
      call.answer(localStreamRef.current || undefined);
      
      call.on('stream', (remoteStream) => {
        console.log('Received remote stream from call');
        setRemoteStream(remoteStream);
      });
    });

    // Fetch online users periodically
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users-online');
        const data = await res.json();
        setOnlineCount(data.count);
      } catch (e) {
        console.error(e);
      }
    };
    fetchUsers();
    const interval = setInterval(fetchUsers, 5000);

    return () => {
      clearInterval(interval);
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('matched', async ({ partnerId, partnerPeerId, initiator }) => {
      console.log('Matched with:', partnerId, 'Peer:', partnerPeerId, 'Initiator:', initiator);
      setIsSearching(false);
      setIsConnected(true);
      setTimeLeft(MEETING_DURATION);
      partnerIdRef.current = partnerId;

      if (initiator && localStreamRef.current) {
        console.log('Calling partner:', partnerPeerId);
        const call = peerRef.current?.call(partnerPeerId, localStreamRef.current);
        if (call) {
          currentCallRef.current = call;
          call.on('stream', (remoteStream) => {
            console.log('Received remote stream from initiator');
            setRemoteStream(remoteStream);
          });
        }
      }
    });

    socket.on('partner-skipped', () => {
      handleDisconnect('Partner skipped');
      findNextRef.current();
    });

    socket.on('partner-disconnected', () => {
      handleDisconnect('Partner disconnected');
      findNextRef.current();
    });

    socket.on('reaction', (data) => {
      setReaction(data.type);
      setTimeout(() => setReaction(null), 2000);
    });

    return () => {
      socket.off('matched');
      socket.off('partner-skipped');
      socket.off('partner-disconnected');
      socket.off('reaction');
    };
  }, [socket]);

  // Handle remote stream attachment
  useEffect(() => {
    if (isConnected && remoteStream && remoteVideoRef.current) {
      if (remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      remoteVideoRef.current.play().catch(e => console.error('Error playing remote video:', e));
    }
  }, [isConnected, remoteStream]);

  // Handle local stream attachment
  useEffect(() => {
    if (localStream && localVideoRef.current && localVideoRef.current.srcObject !== localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Timer logic
  useEffect(() => {
    if (isConnected && timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (isConnected && timeLeft === 0) {
      handleNext();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isConnected, timeLeft]);

  const handleDisconnect = (reason: string) => {
    console.log('Disconnecting:', reason);
    setIsConnected(false);
    setRemoteStream(null);
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
    
    let stream = localStreamRef.current;
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Error accessing media devices.', err);
        alert('Could not access camera and microphone. Please allow permissions.');
        return;
      }
    }

    setIsSearching(true);
    if (peerRef.current && peerRef.current.id) {
      socket.emit('join-queue', peerRef.current.id);
    } else {
      peerRef.current?.once('open', (id) => {
        socket.emit('join-queue', id);
      });
    }
  };

  useEffect(() => {
    findNextRef.current = findNext;
  });

  const handleNext = () => {
    if (socket) {
      socket.emit('next');
    }
    handleDisconnect('User skipped');
    findNext();
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !videoEnabled;
      });
      setVideoEnabled(!videoEnabled);
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !audioEnabled;
      });
      setAudioEnabled(!audioEnabled);
    }
  };

  const sendReaction = (type: string) => {
    if (socket && partnerIdRef.current) {
      socket.emit('reaction', { target: partnerIdRef.current, type });
      // Show own reaction too
      setReaction(type);
      setTimeout(() => setReaction(null), 2000);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-white font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-900/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
            <Video className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">BlinkMeet</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-400 font-mono">
          <Users className="w-4 h-4" />
          <span>{onlineCount} online</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col items-center justify-center p-4 overflow-hidden">
        
        {/* Video Container */}
        <div className="relative w-full max-w-5xl aspect-video bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl border border-white/5">
          
          {/* Remote Video (Full size) */}
          {isConnected ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500">
              {isSearching ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                  <p className="text-lg font-medium animate-pulse">Finding a stranger...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <VideoOff className="w-16 h-16 opacity-50" />
                  <p className="text-lg font-medium">Click "Start" to meet someone</p>
                </div>
              )}
            </div>
          )}

          {/* Local Video (PiP) */}
          <div className="absolute bottom-4 right-4 w-32 sm:w-48 aspect-video bg-black rounded-xl overflow-hidden shadow-lg border border-white/20 z-10">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${!videoEnabled ? 'hidden' : ''}`}
            />
            {!videoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
                <VideoOff className="w-6 h-6 text-neutral-400" />
              </div>
            )}
          </div>

          {/* Timer Overlay */}
          <AnimatePresence>
            {isConnected && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 z-10"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-lg font-medium tracking-wider">
                  00:{timeLeft.toString().padStart(2, '0')}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reaction Overlay */}
          <AnimatePresence>
            {reaction && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.5, y: -50 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
              >
                <span className="text-8xl drop-shadow-2xl">
                  {reaction === 'like' && '👍'}
                  {reaction === 'wave' && '👋'}
                  {reaction === 'laugh' && '😂'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="mt-8 flex items-center gap-4">
          {!isSearching && !isConnected ? (
            <button
              onClick={findNext}
              className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-semibold text-lg transition-colors shadow-lg shadow-emerald-500/20"
            >
              Start Meeting
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-neutral-900 p-2 rounded-full border border-white/10">
                <button
                  onClick={toggleAudio}
                  className={`p-3 rounded-full transition-colors ${audioEnabled ? 'bg-neutral-800 hover:bg-neutral-700 text-white' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
                >
                  {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button
                  onClick={toggleVideo}
                  className={`p-3 rounded-full transition-colors ${videoEnabled ? 'bg-neutral-800 hover:bg-neutral-700 text-white' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
                >
                  {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
              </div>

              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 bg-white text-black hover:bg-neutral-200 rounded-full font-semibold transition-colors"
              >
                <SkipForward className="w-5 h-5" />
                Next
              </button>

              <div className="flex items-center gap-2 bg-neutral-900 p-2 rounded-full border border-white/10">
                <button
                  onClick={() => sendReaction('like')}
                  disabled={!isConnected}
                  className="p-3 rounded-full bg-neutral-800 hover:bg-neutral-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ThumbsUp className="w-5 h-5" />
                </button>
                <button
                  onClick={() => sendReaction('wave')}
                  disabled={!isConnected}
                  className="p-3 rounded-full bg-neutral-800 hover:bg-neutral-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Hand className="w-5 h-5" />
                </button>
                <button
                  onClick={() => sendReaction('laugh')}
                  disabled={!isConnected}
                  className="p-3 rounded-full bg-neutral-800 hover:bg-neutral-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Smile className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
