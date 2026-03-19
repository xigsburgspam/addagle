import React, { useEffect, useRef, useState } from 'react';
import { useFirebase } from '../FirebaseContext';
import { db, doc, getDoc, updateDoc, deleteDoc } from '../firebase';
import {
  X, User, Mail, Shield, Video, Ban, Edit2, Check
} from 'lucide-react';

interface BlockedUser {
  uid: string;
  displayName?: string;
  email?: string;
}

interface AccountSectionProps {
  onClose: () => void;
}

export const AccountSection: React.FC<AccountSectionProps> = ({ onClose }) => {
  const { user, userData, updateDisplayName, removeDisplayName } = useFirebase();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(true);
  const [activeTab, setActiveTab] = useState<'profile' | 'blocked'>('profile');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saveName, setSaveName] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoadingBlocked(true);
      try {
        const blockedIds: string[] = userData?.blockedUsers || [];
        const profiles: BlockedUser[] = [];
        for (const uid of blockedIds) {
          const snap = await getDoc(doc(db, 'users', uid));
          if (snap.exists()) {
            const d = snap.data();
            profiles.push({ uid, displayName: d.savedDisplayName || d.displayName || 'Unknown', email: d.email });
          } else {
            profiles.push({ uid });
          }
        }
        setBlockedUsers(profiles);
      } catch {
        setBlockedUsers([]);
      }
      setLoadingBlocked(false);
    };
    load();
  }, [user, userData?.blockedUsers]);

  const handleUnblock = async (blockedUid: string) => {
    if (!user) return;
    setUnblocking(blockedUid);
    try {
      const userRef = doc(db, 'users', user.uid);
      const current = userData?.blockedUsers || [];
      await updateDoc(userRef, { blockedUsers: current.filter((id: string) => id !== blockedUid) });
      const blockId = [user.uid, blockedUid].sort().join('_');
      await deleteDoc(doc(db, 'blocks', blockId)).catch(() => {});
      setBlockedUsers(prev => prev.filter(u => u.uid !== blockedUid));
    } catch (e) {
      console.error('Unblock failed', e);
    }
    setUnblocking(null);
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    await updateDisplayName(nameInput.trim(), saveName);
    setEditingName(false);
    setNameSuccess(true);
    setTimeout(() => setNameSuccess(false), 2000);
  };

  const handleRemoveName = async () => {
    await removeDisplayName();
    setNameInput('');
    setEditingName(false);
  };

  const displayedName = userData?.savedDisplayName || userData?.displayName || user?.displayName || 'Anonymous';
  const videoPercent = Math.min(100, Math.round((videoUsage / videoLimit) * 100));

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4" style={{ background: 'linear-gradient(135deg,#052e16,#0f172a)' }}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <X size={16} className="text-white" />
          </button>

          <div className="flex items-center gap-4">
            <div className="relative">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="avatar" className="w-16 h-16 rounded-2xl object-cover ring-2 ring-emerald-500/40" />
              ) : (
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white"
                  style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
                  {displayedName.charAt(0).toUpperCase()}
                </div>
              )}
              {userData?.role === 'admin' && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
                  <Shield size={11} className="text-amber-900" />
                </div>
              )}
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-tight">{displayedName}</p>
              <p className="text-neutral-400 text-sm">{user?.email}</p>
              <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{
                  background: userData?.role === 'admin' ? 'rgba(251,191,36,0.15)' : 'rgba(16,185,129,0.15)',
                  color: userData?.role === 'admin' ? '#fbbf24' : '#10b981'
                }}>
                {userData?.role === 'admin' ? '★ Admin' : 'Member'}
              </span>
            </div>
          </div>

          <div className="flex gap-2 mt-5">
            {(['profile', 'blocked'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: activeTab === tab ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
                  color: activeTab === tab ? '#10b981' : '#9ca3af',
                  border: activeTab === tab ? '1px solid rgba(16,185,129,0.3)' : '1px solid transparent'
                }}>
                {tab === 'profile' ? 'Profile' : `Blocked${blockedUsers.length ? ` (${blockedUsers.length})` : ''}`}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-80 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}>
          {activeTab === 'profile' && (
            <>
              {/* Display name card */}
              <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <User size={15} className="text-emerald-400" />
                    <span className="text-neutral-400 text-sm">Display Name</span>
                  </div>
                  {!editingName && (
                    <button onClick={() => { setEditingName(true); setNameInput(userData?.savedDisplayName || ''); }}
                      className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                      <Edit2 size={12} /> Edit
                    </button>
                  )}
                </div>
                {editingName ? (
                  <div className="space-y-3">
                    <input value={nameInput} onChange={e => setNameInput(e.target.value)}
                      placeholder="Enter display name..."
                      className="w-full bg-neutral-800 text-white rounded-xl px-3 py-2 text-sm outline-none border border-neutral-700 focus:border-emerald-500 transition-colors"
                      onKeyDown={e => e.key === 'Enter' && handleSaveName()} autoFocus />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div onClick={() => setSaveName(v => !v)}
                        className="w-9 h-5 rounded-full transition-colors flex items-center px-0.5 cursor-pointer"
                        style={{ background: saveName ? '#10b981' : '#374151' }}>
                        <div className="w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ transform: saveName ? 'translateX(16px)' : 'translateX(0)' }} />
                      </div>
                      <span className="text-neutral-400 text-xs">Remember across sessions</span>
                    </label>
                    <div className="flex gap-2">
                      <button onClick={handleSaveName}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold text-white"
                        style={{ background: '#10b981' }}>Save</button>
                      {userData?.hasSavedName && (
                        <button onClick={handleRemoveName}
                          className="px-3 py-2 rounded-xl text-sm text-red-400"
                          style={{ background: 'rgba(239,68,68,0.1)' }}>Clear</button>
                      )}
                      <button onClick={() => setEditingName(false)}
                        className="px-3 py-2 rounded-xl text-sm text-neutral-400"
                        style={{ background: 'rgba(255,255,255,0.05)' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-white font-medium flex items-center gap-2">
                    {displayedName}
                    {nameSuccess && <Check size={14} className="text-emerald-400" />}
                    {userData?.hasSavedName && <span className="text-xs text-neutral-500">(saved)</span>}
                  </p>
                )}
              </div>

              {/* Token balance */}
              <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Video size={15} className="text-emerald-400" />
                  <span className="text-neutral-400 text-sm">Tokens</span>
                  <span className="ml-auto text-xs font-black"
                    style={{ color: (userData?.tokens ?? 100) < 7 ? '#ef4444' : (userData?.tokens ?? 100) < 20 ? '#f59e0b' : '#10b981' }}>
                    {userData?.tokens ?? 100}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, Math.round(((userData?.tokens ?? 100) / 100) * 100))}%`,
                      background: (userData?.tokens ?? 100) < 7 ? '#ef4444' : (userData?.tokens ?? 100) < 20 ? '#f59e0b' : '#10b981'
                    }} />
                </div>
                <div className="flex justify-between mt-2">
                  <p className="text-xs text-neutral-500">7 tokens = 1 video call</p>
                  <p className="text-xs text-neutral-500">4 tokens = 1 custom chat</p>
                </div>
              </div>

              {/* Email */}
              <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2">
                  <Mail size={15} className="text-emerald-400" />
                  <span className="text-neutral-400 text-sm">Email</span>
                </div>
                <p className="text-white text-sm mt-1 font-medium">{user?.email}</p>
              </div>
            </>
          )}

          {activeTab === 'blocked' && (
            <div>
              {loadingBlocked ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : blockedUsers.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                    style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <Ban size={20} className="text-neutral-500" />
                  </div>
                  <p className="text-neutral-400 text-sm">No blocked users</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {blockedUsers.map(bu => (
                    <div key={bu.uid} className="flex items-center gap-3 p-3 rounded-2xl"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg,#6b7280,#4b5563)' }}>
                        {(bu.displayName || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{bu.displayName || 'Unknown User'}</p>
                        {bu.email && <p className="text-neutral-500 text-xs truncate">{bu.email}</p>}
                      </div>
                      <button onClick={() => handleUnblock(bu.uid)} disabled={unblocking === bu.uid}
                        className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                        style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                        {unblocking === bu.uid ? '...' : 'Unblock'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
