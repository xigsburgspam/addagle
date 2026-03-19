import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, Globe, Plus, LogIn, MapPin, Loader2 } from 'lucide-react';
import { containsBanned } from '../constants';

interface CustomChatLobbyProps {
  onClose: () => void;
  onJoinGlobal: (name: string) => void;
  onCreateRoom: (name: string, roomName: string, maxMembers: number, mode: 'friends' | 'district', districtName?: string) => void;
  onJoinRoom: (name: string, roomName: string) => void;
  initialName?: string;
}

export const CustomChatLobby: React.FC<CustomChatLobbyProps> = ({ onClose, onJoinGlobal, onCreateRoom, onJoinRoom, initialName }) => {
  const [step, setStep] = useState<'name' | 'action' | 'create' | 'join'>(initialName ? 'action' : 'name');
  const [userName, setUserName] = useState(initialName || '');
  const [roomName, setRoomName] = useState('');
  const [maxMembers, setMaxMembers] = useState(2);
  const [mode, setMode] = useState<'friends' | 'district'>('friends');
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [error, setError] = useState('');

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = userName.trim();
    if (trimmedName.length < 3) {
      setError('Name must be at least 3 characters');
      return;
    }
    if (containsBanned(trimmedName)) {
      setError('That name contains prohibited words.');
      return;
    }
    setError('');
    setStep('action');
  };

  const handleDistrictJoin = async () => {
    setLoadingLocation(true);
    setError('');

    const fallbackToIP = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        const district = data.city || data.region || data.country_name || 'Unknown';
        setLoadingLocation(false);
        onCreateRoom(userName.trim(), '', 15, 'district', district);
      } catch (err) {
        setLoadingLocation(false);
        setError('Failed to identify district.');
      }
    };

    if (!navigator.geolocation) {
      fallbackToIP();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`, {
            headers: {
              'User-Agent': 'BlinkMeet/1.0'
            }
          });
          const data = await res.json();
          const district = data.address.state_district || data.address.county || data.address.city || data.address.state || 'Unknown';
          setLoadingLocation(false);
          onCreateRoom(userName.trim(), '', 15, 'district', district);
        } catch (err) {
          fallbackToIP();
        }
      },
      () => {
        fallbackToIP();
      },
      { timeout: 10000 }
    );
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedRoomName = roomName.trim();
    if (mode === 'friends' && (!trimmedRoomName || trimmedRoomName.length > 12)) {
      setError('Room name must be 1-12 characters');
      return;
    }
    if (mode === 'friends' && containsBanned(trimmedRoomName)) {
      setError('Room name contains prohibited words.');
      return;
    }
    setError('');

    if (mode === 'district') {
      setLoadingLocation(true);
      
      const fallbackToIP = async () => {
        try {
          const res = await fetch('https://ipapi.co/json/');
          const data = await res.json();
          const district = data.region || data.city || 'Unknown';
          setLoadingLocation(false);
          onCreateRoom(userName.trim(), '', maxMembers, 'district', district);
        } catch (err) {
          setLoadingLocation(false);
          setError('Failed to identify district from location.');
        }
      };

      if (!navigator.geolocation) {
        fallbackToIP();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`, {
              headers: {
                'User-Agent': 'BD-Omegle-Clone/1.0'
              }
            });
            const data = await res.json();
            const district = data.address?.state_district || data.address?.county || data.address?.city || data.address?.state || 'Unknown';
            setLoadingLocation(false);
            onCreateRoom(userName.trim(), '', maxMembers, 'district', district);
          } catch (err) {
            fallbackToIP();
          }
        },
        () => {
          fallbackToIP();
        },
        { timeout: 10000 }
      );
    } else {
      onCreateRoom(userName.trim(), roomName.trim(), maxMembers, 'friends');
    }
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedRoomName = roomName.trim();
    if (!trimmedRoomName) {
      setError('Please enter a room name');
      return;
    }
    if (containsBanned(trimmedRoomName)) {
      setError('Room name contains prohibited words.');
      return;
    }
    setError('');
    onJoinRoom(userName.trim(), trimmedRoomName);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        className="w-full max-w-md bg-[#13151a] border border-white/[0.08] rounded-3xl overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Users className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-wider">
                Custom Chat Room
              </h2>
              <p className="text-[10px] text-neutral-500 uppercase tracking-widest">
                {step === 'name' ? 'Choose Your Name' : step === 'action' ? 'Select Action' : step === 'create' ? 'Create Room' : 'Join Room'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (step === 'create' || step === 'join') setStep('action');
              else if (step === 'action') setStep('name');
              else onClose();
            }}
            className="w-8 h-8 rounded-full bg-white/6 hover:bg-white/12 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-neutral-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          <AnimatePresence mode="wait">
            {step === 'name' && (
              <motion.form key="name" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} onSubmit={handleNameSubmit}>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Your Display Name</label>
                <input
                  type="text"
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  placeholder="Enter a unique name..."
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all mb-4"
                  maxLength={20}
                  autoFocus
                />
                {error && <p className="text-red-400 text-xs mb-4">{error}</p>}
                <button type="submit" className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors">
                  Continue
                </button>
              </motion.form>
            )}

            {step === 'action' && (
              <motion.div key="action" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="flex flex-col gap-3">
                <button onClick={() => onJoinGlobal(userName)} className="w-full p-4 bg-neutral-900 border border-white/10 rounded-2xl flex items-center gap-4 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all text-left group">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Globe className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Join Global Chat</h3>
                    <p className="text-xs text-neutral-500">Public room with no time limit</p>
                  </div>
                </button>

                <button onClick={() => { setStep('create'); setError(''); setRoomName(''); }} className="w-full p-4 bg-neutral-900 border border-white/10 rounded-2xl flex items-center gap-4 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all text-left group">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Plus className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Create Chat Room</h3>
                    <p className="text-xs text-neutral-500">Start a new 15-minute room</p>
                  </div>
                </button>

                <button onClick={() => { setStep('join'); setError(''); setRoomName(''); }} className="w-full p-4 bg-neutral-900 border border-white/10 rounded-2xl flex items-center gap-4 hover:border-amber-500/50 hover:bg-amber-500/10 transition-all text-left group">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <LogIn className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Join a Chatroom</h3>
                    <p className="text-xs text-neutral-500">Enter with a specific room name</p>
                  </div>
                </button>

                <button 
                  onClick={handleDistrictJoin} 
                  disabled={loadingLocation}
                  className="w-full p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-4 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all text-left group disabled:opacity-50"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    {loadingLocation ? <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /> : <MapPin className="w-6 h-6 text-emerald-400" />}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-emerald-400 uppercase tracking-tight">Join My District</h3>
                    <p className="text-xs text-emerald-500/60 font-medium">Instantly connect with people in your area</p>
                  </div>
                </button>
              </motion.div>
            )}

            {step === 'create' && (
              <motion.form key="create" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} onSubmit={handleCreateSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Room Name (Max 12 chars)</label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={e => setRoomName(e.target.value)}
                    placeholder="e.g. MyRoom"
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                    maxLength={12}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Max Members ({maxMembers})</label>
                  <input
                    type="range"
                    min="2"
                    max="15"
                    value={maxMembers}
                    onChange={e => setMaxMembers(parseInt(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
                    <span>2</span>
                    <span>15</span>
                  </div>
                </div>

                {error && <p className="text-red-400 text-xs">{error}</p>}

                <button type="submit" disabled={loadingLocation} className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 mt-2">
                  {loadingLocation ? <><Loader2 className="w-4 h-4 animate-spin" /> Locating...</> : 'Create Room'}
                </button>
              </motion.form>
            )}

            {step === 'join' && (
              <motion.form key="join" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} onSubmit={handleJoinSubmit}>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Room Name</label>
                <input
                  type="text"
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  placeholder="Enter room name..."
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all mb-4"
                  maxLength={12}
                  autoFocus
                />
                {error && <p className="text-red-400 text-xs mb-4">{error}</p>}
                <button type="submit" className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors">
                  Join Room
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};
