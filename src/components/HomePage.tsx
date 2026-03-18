import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../FirebaseContext';
import { useLanguage } from '../LanguageContext';
import { auth, googleProvider, signInWithPopup, db, doc, onSnapshot } from '../firebase';
import { Ghost, Shield, MessageSquare, Zap, ArrowRight, Globe, Lock, UserCheck, Languages, Info, MessageCircle, Users, Video, Tv2, Map as MapIcon, Check, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AdminPopup } from './AdminPopup';
import { containsBanned } from '../constants';

const BANGLADESH_DISTRICTS = [
  "Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail",
  "Bagerhat", "Chuadanga", "Jessore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira",
  "Bogra", "Joypurhat", "Naogaon", "Natore", "Chapai Nawabganj", "Pabna", "Rajshahi", "Sirajganj",
  "Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon",
  "Habiganj", "Moulvibazar", "Sunamganj", "Sylhet",
  "Barguna", "Barisal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur",
  "Bandarban", "Brahmanbaria", "Chandpur", "Chittagong", "Comilla", "Cox's Bazar", "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati",
  "Sherpur", "Jamalpur", "Netrokona", "Mymensingh"
];

// Accurate geographical positions for all 64 districts of Bangladesh
// x: 0-100 (west to east), y: 0-100 (north to south)
const DISTRICT_GEO: Record<string, { x: number; y: number }> = {
  // Rangpur Division (northwest)
  "Panchagarh":     { x: 28, y: 4 },
  "Thakurgaon":     { x: 22, y: 9 },
  "Dinajpur":       { x: 18, y: 17 },
  "Nilphamari":     { x: 34, y: 10 },
  "Lalmonirhat":    { x: 42, y: 11 },
  "Kurigram":       { x: 52, y: 12 },
  "Rangpur":        { x: 38, y: 18 },
  "Gaibandha":      { x: 48, y: 22 },
  // Rajshahi Division (west)
  "Joypurhat":      { x: 36, y: 28 },
  "Naogaon":        { x: 24, y: 32 },
  "Bogra":          { x: 44, y: 32 },
  "Chapai Nawabganj": { x: 10, y: 40 },
  "Rajshahi":       { x: 18, y: 44 },
  "Natore":         { x: 32, y: 43 },
  "Sirajganj":      { x: 48, y: 40 },
  "Pabna":          { x: 36, y: 52 },
  // Khulna Division (southwest)
  "Kushtia":        { x: 26, y: 58 },
  "Meherpur":       { x: 14, y: 60 },
  "Chuadanga":      { x: 16, y: 66 },
  "Jhenaidah":      { x: 26, y: 66 },
  "Magura":         { x: 34, y: 71 },
  "Narail":         { x: 38, y: 76 },
  "Jessore":        { x: 24, y: 75 },
  "Satkhira":       { x: 14, y: 84 },
  "Khulna":         { x: 28, y: 84 },
  "Bagerhat":       { x: 38, y: 88 },
  // Barisal Division (south)
  "Rajbari":        { x: 44, y: 62 },
  "Faridpur":       { x: 48, y: 68 },
  "Gopalganj":      { x: 46, y: 78 },
  "Pirojpur":       { x: 48, y: 86 },
  "Jhalokati":      { x: 54, y: 87 },
  "Barisal":        { x: 60, y: 84 },
  "Bhola":          { x: 70, y: 85 },
  "Patuakhali":     { x: 62, y: 91 },
  "Barguna":        { x: 52, y: 93 },
  // Dhaka Division (central)
  "Manikganj":      { x: 52, y: 59 },
  "Tangail":        { x: 55, y: 48 },
  "Dhaka":          { x: 60, y: 64 },
  "Narayanganj":    { x: 64, y: 68 },
  "Munshiganj":     { x: 62, y: 74 },
  "Madaripur":      { x: 56, y: 78 },
  "Shariatpur":     { x: 66, y: 78 },
  // Mymensingh Division (north-central)
  "Jamalpur":       { x: 56, y: 34 },
  "Sherpur":        { x: 64, y: 28 },
  "Mymensingh":     { x: 66, y: 36 },
  "Netrokona":      { x: 74, y: 32 },
  // Sylhet Division (northeast)
  "Kishoreganj":    { x: 74, y: 46 },
  "Sunamganj":      { x: 82, y: 26 },
  "Sylhet":         { x: 90, y: 33 },
  "Moulvibazar":    { x: 86, y: 42 },
  "Habiganj":       { x: 80, y: 50 },
  // Comilla/Chittagong Division (east/southeast)
  "Brahmanbaria":   { x: 76, y: 57 },
  "Narsingdi":      { x: 70, y: 60 },
  "Gazipur":        { x: 62, y: 57 },
  "Comilla":        { x: 80, y: 66 },
  "Chandpur":       { x: 72, y: 72 },
  "Lakshmipur":     { x: 78, y: 78 },
  "Noakhali":       { x: 80, y: 84 },
  "Feni":           { x: 84, y: 76 },
  "Chittagong":     { x: 88, y: 86 },
  "Cox's Bazar":    { x: 88, y: 95 },
  "Khagrachhari":   { x: 90, y: 72 },
  "Rangamati":      { x: 92, y: 80 },
  "Bandarban":      { x: 92, y: 90 },
};

const DisplayNamePrompt: React.FC<{ onConfirm: (name: string, save: boolean) => void; onClose: () => void; userEmail?: string }> = ({ onConfirm, onClose, userEmail }) => {
  const [name, setName] = useState('');
  const [save, setSave] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    if (containsBanned(trimmed)) {
      setError('That name contains prohibited words.');
      return;
    }
    if (trimmed.toLowerCase() === 'admin' && userEmail !== 'edublitz71@gmail.com') {
      setError('This username is reserved.');
      return;
    }
    onConfirm(trimmed, save);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-[32px] p-8 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-black uppercase tracking-tighter">Enter Your Name</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-6 h-6 text-neutral-500" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2 ml-1">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="How should we call you?"
              className="w-full bg-black border border-neutral-800 rounded-2xl px-6 py-4 text-white placeholder:text-neutral-700 focus:outline-none focus:border-emerald-500/50 transition-all font-bold"
              autoFocus
            />
            {error && <p className="text-red-400 text-[10px] font-bold uppercase tracking-widest mt-2 ml-1">{error}</p>}
          </div>

          <button
            onClick={() => setSave(!save)}
            className="flex items-center gap-3 group cursor-pointer"
          >
            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${save ? 'bg-emerald-500 border-emerald-500' : 'border-neutral-800 group-hover:border-neutral-700'}`}>
              {save && <Check className="w-4 h-4 text-black" />}
            </div>
            <span className="text-sm font-bold text-neutral-400 group-hover:text-neutral-300">Save this name for all chats</span>
          </button>

          <button
            disabled={!name.trim()}
            onClick={handleConfirm}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 text-black font-black py-4 rounded-2xl transition-all uppercase tracking-widest"
          >
            Confirm & Join
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const BangladeshMap: React.FC<{
  districtUsers: Record<string, number>;
  districtRoomUsers: Record<string, number>;
  districtWaiting: Record<string, boolean>;
}> = ({ districtUsers, districtRoomUsers, districtWaiting }) => {
  const [hoveredDistrict, setHoveredDistrict] = useState<string | null>(null);

  // Determine display info per district
  const getDistrictStatus = (name: string) => {
    const roomUsers = districtRoomUsers[name] || 0;
    const isWaiting = districtWaiting[name] === true;
    const onlineCount = districtUsers[name] || 0;
    if (isWaiting) return { status: 'waiting', count: roomUsers, online: onlineCount };
    if (roomUsers > 0) return { status: 'active', count: roomUsers, online: onlineCount };
    if (onlineCount > 0) return { status: 'online', count: onlineCount, online: onlineCount };
    return { status: 'idle', count: 0, online: 0 };
  };

  return (
    <div className="w-full relative" style={{ maxWidth: 520 }}>
      {/* Neon glow border container */}
      <div
        className="relative rounded-3xl overflow-hidden"
        style={{
              background: 'linear-gradient(135deg, #0a0f0a 0%, #050d08 100%)',
              padding: 3,
        }}
      >
        <div
          className="rounded-3xl relative overflow-hidden"
          style={{ background: '#060d08', minHeight: 500 }}
        >
          {/* Animated neon border inner glow */}
          <div
            className="absolute inset-0 rounded-3xl pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at 50% 0%, #00ff8815 0%, transparent 60%), radial-gradient(ellipse at 50% 100%, #00ff8810 0%, transparent 60%)',
              zIndex: 1,
            }}
          />

          {/* Grid bg */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: 'linear-gradient(#00ff88 1px, transparent 1px), linear-gradient(90deg, #00ff88 1px, transparent 1px)', backgroundSize: '20px 20px' }}
          />

          <svg
            viewBox="0 0 100 100"
            className="w-full relative"
            style={{ zIndex: 2, display: 'block' }}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Bangladesh country outline — stylized polygon */}
            <polygon
              points="28,2 42,1 56,4 64,7 72,12 82,16 90,22 96,30 97,42 96,55 98,68 96,78 90,87 84,94 76,98 64,99 52,97 40,98 28,96 18,90 10,82 4,72 2,60 4,48 2,36 8,24 16,14 22,8"
              fill="rgba(0,255,136,0.04)"
              stroke="#00ff88"
              strokeWidth="0.6"
              strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 0 2px #00ff88)' }}
            />

            {/* Division region subtle fills */}
            {/* Rangpur - top left */}
            <polygon points="22,2 56,2 52,26 36,26 18,26 14,14" fill="rgba(0,200,100,0.05)" stroke="none" />
            {/* Rajshahi - mid left */}
            <polygon points="8,38 52,38 52,56 36,56 14,56 8,46" fill="rgba(0,180,120,0.04)" stroke="none" />
            {/* Khulna - bottom left */}
            <polygon points="8,56 40,56 42,96 16,92 6,78 4,64" fill="rgba(0,160,100,0.04)" stroke="none" />
            {/* Barisal - bottom center */}
            <polygon points="40,68 72,68 72,98 40,98" fill="rgba(0,140,100,0.04)" stroke="none" />
            {/* Dhaka - center */}
            <polygon points="44,44 76,44 76,70 44,70" fill="rgba(0,220,130,0.04)" stroke="none" />
            {/* Mymensingh - north center */}
            <polygon points="52,22 82,22 82,46 52,46" fill="rgba(0,200,110,0.04)" stroke="none" />
            {/* Sylhet - northeast */}
            <polygon points="72,18 98,18 98,58 72,58" fill="rgba(0,180,100,0.04)" stroke="none" />
            {/* Chittagong/CHT - east */}
            <polygon points="74,56 98,56 98,99 72,99" fill="rgba(0,160,90,0.04)" stroke="none" />

            {/* Division labels — very subtle */}
            {[
              { label: 'Rangpur', x: 35, y: 16 },
              { label: 'Rajshahi', x: 26, y: 44 },
              { label: 'Khulna', x: 22, y: 75 },
              { label: 'Barisal', x: 56, y: 88 },
              { label: 'Dhaka', x: 58, y: 62 },
              { label: 'Mymensingh', x: 65, y: 36 },
              { label: 'Sylhet', x: 85, y: 36 },
              { label: 'Chittagong', x: 86, y: 80 },
            ].map(d => (
              <text key={d.label} x={d.x} y={d.y} fontSize="2.2" fill="rgba(0,255,136,0.15)" textAnchor="middle" fontWeight="bold" style={{ letterSpacing: '0.05em', userSelect: 'none' }}>
                {d.label.toUpperCase()}
              </text>
            ))}

            {/* District dots + labels */}
            {Object.entries(DISTRICT_GEO).map(([name, pos]) => {
              const { status, count, online } = getDistrictStatus(name);
              const isHovered = hoveredDistrict === name;

              const dotColor =
                status === 'active' ? '#00ff88' :
                status === 'waiting' ? '#ffaa00' :
                status === 'online' ? '#00aaff' :
                '#1a3a26';

              const dotRadius =
                status === 'active' ? 1.4 :
                status === 'waiting' ? 1.2 :
                status === 'online' ? 0.9 :
                0.55;

              const glowFilter =
                status === 'active' ? 'drop-shadow(0 0 2px #00ff88)' :
                status === 'waiting' ? 'drop-shadow(0 0 2px #ffaa00)' :
                status === 'online' ? 'drop-shadow(0 0 1.5px #00aaff)' :
                'none';

              return (
                <g
                  key={name}
                  onMouseEnter={() => setHoveredDistrict(name)}
                  onMouseLeave={() => setHoveredDistrict(null)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Pulse ring for active districts */}
                  {status === 'active' && (
                    <circle cx={pos.x} cy={pos.y} r="2.5" fill="none" stroke="#00ff88" strokeWidth="0.3" opacity="0.3" className="animate-ping" />
                  )}
                  {status === 'waiting' && (
                    <circle cx={pos.x} cy={pos.y} r="2" fill="none" stroke="#ffaa00" strokeWidth="0.3" opacity="0.4" className="animate-ping" />
                  )}

                  {/* Main dot */}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={isHovered ? dotRadius * 1.6 : dotRadius}
                    fill={dotColor}
                    style={{ filter: glowFilter, transition: 'r 0.15s' }}
                  />

                  {/* District name label */}
                  <text
                    x={pos.x}
                    y={pos.y + dotRadius + 2.2}
                    fontSize={isHovered ? "1.9" : "1.55"}
                    fill={
                      status === 'active' ? '#00ff88' :
                      status === 'waiting' ? '#ffaa00' :
                      status === 'online' ? '#44aaff' :
                      '#2a5040'
                    }
                    textAnchor="middle"
                    style={{
                      fontWeight: status !== 'idle' ? 'bold' : 'normal',
                      letterSpacing: '0.02em',
                      userSelect: 'none',
                      transition: 'font-size 0.15s',
                    }}
                  >
                    {name}
                  </text>

                  {/* User count badge for active/waiting */}
                  {(status === 'active' || status === 'waiting') && count > 0 && (
                    <g>
                      <rect
                        x={pos.x + dotRadius}
                        y={pos.y - dotRadius - 2.5}
                        width={count >= 10 ? 5 : 3.5}
                        height="2.5"
                        rx="1"
                        fill={status === 'waiting' ? '#ffaa0022' : '#00ff8822'}
                        stroke={status === 'waiting' ? '#ffaa00' : '#00ff88'}
                        strokeWidth="0.2"
                      />
                      <text
                        x={pos.x + dotRadius + (count >= 10 ? 2.5 : 1.75)}
                        y={pos.y - dotRadius - 0.6}
                        fontSize="1.6"
                        fill={status === 'waiting' ? '#ffaa00' : '#00ff88'}
                        textAnchor="middle"
                        fontWeight="bold"
                        style={{ userSelect: 'none' }}
                      >
                        {count}
                      </text>
                    </g>
                  )}

                  {/* Tooltip on hover */}
                  {isHovered && (
                    <g>
                      <rect
                        x={Math.min(pos.x - 12, 78)}
                        y={pos.y - 10}
                        width={26}
                        height={status !== 'idle' ? 10 : 7}
                        rx="1.5"
                        fill="#0a1a10"
                        stroke={dotColor}
                        strokeWidth="0.3"
                        style={{ filter: `drop-shadow(0 0 3px ${dotColor})` }}
                      />
                      <text
                        x={Math.min(pos.x - 12, 78) + 13}
                        y={pos.y - 5.5}
                        fontSize="1.9"
                        fill="white"
                        textAnchor="middle"
                        fontWeight="bold"
                        style={{ userSelect: 'none' }}
                      >
                        {name}
                      </text>
                      {status !== 'idle' && (
                        <text
                          x={Math.min(pos.x - 12, 78) + 13}
                          y={pos.y - 2}
                          fontSize="1.7"
                          fill={dotColor}
                          textAnchor="middle"
                          style={{ userSelect: 'none' }}
                        >
                          {status === 'waiting' ? `⏳ ${count} waiting` :
                           status === 'active' ? `💬 ${count} chatting` :
                           `🌐 ${online} online`}
                        </text>
                      )}
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center gap-x-5 gap-y-2" style={{ zIndex: 3 }}>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#00ff88' }}>Chatting</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: '#ffaa00', boxShadow: '0 0 6px #ffaa00' }} />
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#ffaa00' }}>Waiting</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: '#00aaff', boxShadow: '0 0 6px #00aaff' }} />
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#00aaff' }}>Online</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-neutral-800" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600">Idle</span>
            </div>
            <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-neutral-700">64 Districts · Bangladesh</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const HomePage: React.FC<{
  onStart: (mode: 'video' | 'text', name: string) => void;
  onWatchFootball: (name: string) => void;
  onCustomChat: (name: string) => void;
}> = ({ onStart, onWatchFootball, onCustomChat }) => {
  const { user, userData, loading, updateDisplayName, removeDisplayName } = useFirebase();
  const { language, setLanguage, t } = useLanguage();
  const [isAdminPopupOpen, setIsAdminPopupOpen] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'video' | 'text' | 'football' | 'custom' } | null>(null);
  const [stats, setStats] = useState({
    onlineUsers: 0,
    videoChatting: 0,
    textChatting: 0,
    customChatting: 0,
    footballChatting: 0,
    totalVideoChats: 0,
    totalTextChats: 0,
    totalAccounts: 0,
    districtUsers: {} as Record<string, number>,
    districtRoomUsers: {} as Record<string, number>,
    districtWaiting: {} as Record<string, boolean>
  });

  // Live counters from /api/stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(prev => ({
            ...prev,
            onlineUsers: data.onlineUsers || 0,
            videoChatting: data.videoChatting || 0,
            textChatting: data.textChatting || 0,
            customChatting: data.customChatting || 0,
            footballChatting: data.footballChatting || 0,
            districtUsers: data.districtUsers || {},
            districtRoomUsers: data.districtRoomUsers || {},
            districtWaiting: data.districtWaiting || {},
          }));
        }
      } catch (e) {
        console.error('Failed to fetch stats:', e);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Persistent counters from Firestore
  useEffect(() => {
    const statsRef = doc(db, 'stats', 'global');
    const unsub = onSnapshot(statsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStats(prev => ({
          ...prev,
          totalVideoChats: data.totalVideoChats || 0,
          totalTextChats: data.totalTextChats || 0,
          totalAccounts: data.totalAccounts || 0,
        }));
      }
    }, (e) => {
      console.error('Firestore stats listen failed:', e);
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error('Login failed:', e);
    }
  };

  const handleAction = (type: 'video' | 'text' | 'football' | 'custom') => {
    if (userData?.hasSavedName && userData?.savedDisplayName) {
      executeAction(type, userData.savedDisplayName);
    } else {
      setPendingAction({ type });
      setShowNamePrompt(true);
    }
  };

  const executeAction = (type: 'video' | 'text' | 'football' | 'custom', name: string) => {
    if (type === 'video' || type === 'text') onStart(type, name);
    else if (type === 'football') onWatchFootball(name);
    else if (type === 'custom') onCustomChat(name);
  };

  const handleNameConfirm = async (name: string, save: boolean) => {
    if (save) {
      await updateDisplayName(name, true);
    }
    setShowNamePrompt(false);
    if (pendingAction) {
      executeAction(pendingAction.type, name);
      setPendingAction(null);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-emerald-500/30 overflow-x-hidden">
      {/* Background Grid Pattern */}
      <div className="fixed inset-0 z-0 opacity-[0.03] pointer-events-none"
           style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 p-6 flex justify-between items-center bg-gradient-to-b from-neutral-950 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
            <Ghost className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-black tracking-widest uppercase font-brand bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent">{t.appName}</span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsAdminPopupOpen(true)}
            className="px-4 py-3 bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 rounded-xl text-neutral-500 hover:text-emerald-500 hover:border-emerald-500/30 transition-all flex items-center gap-2"
          >
            <span className="text-[10px] font-black uppercase tracking-widest">{t.adminInfo}</span>
          </button>

          <div className="flex items-center gap-2 bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 p-1 rounded-xl">
            <button
              onClick={() => setLanguage('en')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${language === 'en' ? 'bg-emerald-500 text-black' : 'text-neutral-500 hover:text-white'}`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('bn')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${language === 'bn' ? 'bg-emerald-500 text-black' : 'text-neutral-500 hover:text-white'}`}
            >
              BN
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-32 pb-40">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center w-full"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-10">
              <Zap className="w-3 h-3" />
              Next-Gen Video Protocol
            </div>

            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[100px] font-black tracking-tighter leading-[0.85] mb-10 uppercase bg-gradient-to-br from-white via-white to-neutral-600 bg-clip-text text-transparent">
              {t.tagline.split(' ').map((word, i) => (
                <React.Fragment key={i}>
                  {word === 'Strangers' || word === 'অপরিচিতদের'
                    ? <span className="text-emerald-500 bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent">{word}</span>
                    : word}
                  {i === 1 && <br />}
                  {' '}
                </React.Fragment>
              ))}
            </h1>

            <p className="text-xl text-neutral-400 max-w-2xl mx-auto mb-12 leading-relaxed font-medium">
              {t.description}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center w-full">
              {user ? (
                userData?.isBlocked ? (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-6 rounded-3xl text-center font-bold w-full">
                    {t.accessRevoked}
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => handleAction('video')}
                      className="group relative bg-gradient-to-r from-emerald-500 to-emerald-600 text-black px-8 sm:px-10 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-3 hover:from-emerald-400 hover:to-emerald-500 transition-all duration-500 shadow-2xl shadow-emerald-500/20 w-full sm:w-auto"
                    >
                      {t.startEncounter}
                      <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-2 transition-transform duration-500" />
                    </button>

                    <button
                      onClick={() => handleAction('text')}
                      className="group relative bg-neutral-900 border border-neutral-800 text-white px-8 sm:px-10 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-3 hover:border-emerald-500/50 hover:bg-gradient-to-r hover:from-neutral-900 hover:to-neutral-800 transition-all duration-500 w-full sm:w-auto"
                    >
                      {t.startTextChat}
                      <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform duration-500" />
                    </button>

                    <button
                      onClick={() => handleAction('football')}
                      className="group relative overflow-hidden bg-gradient-to-r from-green-600 to-emerald-700 text-white px-8 sm:px-10 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-3 hover:from-green-500 hover:to-emerald-600 transition-all duration-500 shadow-2xl shadow-green-900/40 w-full sm:w-auto"
                    >
                      <span className="absolute top-1 right-2 text-[8px] font-black text-green-300/70 uppercase tracking-widest animate-pulse">● LIVE</span>
                      <Tv2 className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform duration-500" />
                      Watch Football
                    </button>

                    <button
                      onClick={() => handleAction('custom')}
                      className="group relative bg-indigo-600 border border-indigo-500 text-white px-8 sm:px-10 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-3 hover:bg-indigo-500 transition-all duration-500 shadow-2xl shadow-indigo-500/20 w-full sm:w-auto"
                    >
                      <Users className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform duration-500" />
                      Custom Chat Room
                    </button>
                  </>
                )
              ) : (
                <button
                  onClick={handleLogin}
                  className="group bg-neutral-900 border border-neutral-800 text-white px-8 sm:px-10 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-4 hover:bg-neutral-800 transition-all duration-500 w-full sm:w-auto"
                >
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  {t.joinWithGoogle}
                </button>
              )}
            </div>

            {user && userData?.hasSavedName && (
              <div className="mt-6 flex flex-col items-center gap-3">
                <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest">
                  Signed in as <span className="text-emerald-500">{userData.savedDisplayName}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowNamePrompt(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-white/5 rounded-xl text-neutral-400 hover:text-emerald-500 transition-all group"
                  >
                    <UserCheck className="w-3 h-3" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Change Name</span>
                  </button>
                  <button
                    onClick={() => removeDisplayName()}
                    className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-white/5 rounded-xl text-neutral-400 hover:text-red-400 transition-all group"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Remove Name</span>
                  </button>
                </div>
              </div>
            )}

            {/* Stats Bar */}
            <div className="mt-12 flex flex-wrap justify-center gap-3 w-full">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/50 border border-white/5 backdrop-blur-sm">
                <Users className="w-3 h-3 text-emerald-500" />
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Online:</span>
                <span className="text-xs font-black text-emerald-500 tabular-nums">{stats.onlineUsers}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/50 border border-white/5 backdrop-blur-sm">
                <Video className="w-3 h-3 text-emerald-500" />
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Video:</span>
                <span className="text-xs font-black text-emerald-500 tabular-nums">{stats.videoChatting}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/50 border border-white/5 backdrop-blur-sm">
                <MessageCircle className="w-3 h-3 text-emerald-500" />
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Text:</span>
                <span className="text-xs font-black text-emerald-500 tabular-nums">{stats.textChatting}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/50 border border-white/5 backdrop-blur-sm">
                <Shield className="w-3 h-3 text-neutral-600" />
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-600">Total Video:</span>
                <span className="text-xs font-black text-neutral-400 tabular-nums">{stats.totalVideoChats.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/50 border border-white/5 backdrop-blur-sm">
                <MessageSquare className="w-3 h-3 text-neutral-600" />
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-600">Total Text:</span>
                <span className="text-xs font-black text-neutral-400 tabular-nums">{stats.totalTextChats.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/50 border border-white/5 backdrop-blur-sm">
                <UserCheck className="w-3 h-3 text-neutral-600" />
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-600">Accounts:</span>
                <span className="text-xs font-black text-neutral-400 tabular-nums">{stats.totalAccounts.toLocaleString()}</span>
              </div>
            </div>

            {/* Map Section */}
            <div className="mt-20 w-full">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tighter">Live User Distribution</h2>
                  <p className="text-neutral-500 text-sm font-medium">Real-time activity across districts</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Live Map</span>
                </div>
              </div>
              <BangladeshMap
                districtUsers={stats.districtUsers}
                districtRoomUsers={stats.districtRoomUsers}
                districtWaiting={stats.districtWaiting}
              />
            </div>
          </motion.div>
        </div>
      </main>

      {/* Features Bento Grid */}
      <section className="relative z-10 border-t border-neutral-900 bg-neutral-950 py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-20">
            <h2 className="text-4xl font-black tracking-tighter uppercase mb-4">{t.protocol}</h2>
            <p className="text-neutral-500 font-medium">{t.protocolDesc}</p>
          </div>

          <div className="grid md:grid-cols-12 gap-6">
            <div className="md:col-span-8 p-12 rounded-[40px] bg-gradient-to-br from-neutral-900/50 to-neutral-900/20 border border-neutral-800 hover:border-emerald-500/30 transition-all duration-500 group">
              <Shield className="w-12 h-12 text-emerald-500 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-3xl font-black mb-4 uppercase tracking-tighter bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">{t.activeModeration}</h3>
              <p className="text-neutral-400 text-lg leading-relaxed max-w-xl">{t.activeModerationDesc}</p>
            </div>

            <div className="md:col-span-4 p-12 rounded-[40px] bg-gradient-to-br from-emerald-500 to-emerald-600 text-black group overflow-hidden relative">
              <Zap className="w-12 h-12 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-3xl font-black mb-4 uppercase tracking-tighter">{t.instantMatch}</h3>
              <p className="text-black/70 text-lg leading-relaxed font-bold">{t.instantMatchDesc}</p>
              <div className="absolute -bottom-10 -right-10 opacity-10">
                <Zap className="w-40 h-40" />
              </div>
            </div>

            <div className="md:col-span-4 p-12 rounded-[40px] bg-gradient-to-br from-neutral-900/50 to-neutral-900/20 border border-neutral-800 hover:border-emerald-500/30 transition-all duration-500 group">
              <MessageSquare className="w-12 h-12 text-emerald-500 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-2xl font-black mb-4 uppercase tracking-tighter bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">{t.zeroHistory}</h3>
              <p className="text-neutral-400 leading-relaxed">{t.zeroHistoryDesc}</p>
            </div>

            <div className="md:col-span-8 p-12 rounded-[40px] bg-gradient-to-br from-neutral-900/50 to-neutral-900/20 border border-neutral-800 hover:border-emerald-500/30 transition-all duration-500 group">
              <Ghost className="w-12 h-12 text-emerald-500 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-3xl font-black mb-4 uppercase tracking-tighter bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">{t.visualVerification}</h3>
              <p className="text-neutral-400 text-lg leading-relaxed max-w-xl">{t.visualVerificationDesc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-8 border-t border-neutral-900 bg-neutral-950">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
              <Ghost className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black tracking-widest uppercase font-brand bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent">{t.appName}</span>
          </div>
          <p className="text-neutral-600 text-xs font-bold uppercase tracking-[0.3em]">{t.copyright}</p>
          <div className="flex gap-8">
            <Link to="/terms" className="text-neutral-600 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">{t.terms}</Link>
            <Link to="/privacy" className="text-neutral-600 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">{t.privacy}</Link>
          </div>
        </div>
      </footer>

      {/* Admin Popup */}
      <AnimatePresence>
        {isAdminPopupOpen && (
          <AdminPopup isOpen={isAdminPopupOpen} onClose={() => setIsAdminPopupOpen(false)} />
        )}
        {showNamePrompt && (
          <DisplayNamePrompt
            userEmail={user?.email ?? undefined}
            onConfirm={handleNameConfirm}
            onClose={() => {
              setShowNamePrompt(false);
              setPendingAction(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};