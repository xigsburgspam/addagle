import React, { useEffect, useState } from 'react';
import { useFirebase } from '../FirebaseContext';
import { useLanguage } from '../LanguageContext';
import { db, collection, onSnapshot, query, doc, updateDoc, setDoc, deleteDoc, Timestamp, addDoc, getDocs, arrayRemove } from '../firebase';
import { Shield, UserX, MessageSquare, Terminal, ShieldAlert, Globe, Lock, Video, Tv2, Plus, Trash2, Wifi, WifiOff, Users, Search, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

interface User {
  id: string;
  uid: string;
  email: string;
  displayName?: string;
  role: string;
  isBlocked: boolean;
  tokens?: number;
}

interface Report {
  id: string;
  reporterUid: string;
  reporterEmail?: string;
  reporterName?: string;
  violatorUid: string;
  violatorEmail?: string;
  violatorName?: string;
  reason: string;
  timestamp: any;
  roomId?: string;
}

interface ActiveRoom {
  id: string;
  users: string[];
  peerIds: Record<string, string>;
}

interface BlockedEmail {
  id: string;
  blockedAt: any;
  reason: string;
  uid?: string;
}

interface FootballMatch {
  id: string;
  teamA: string;
  teamB: string;
  league: string;
  streamUrl: string;
  live: boolean;
  createdAt?: string;
}

export const AdminPanel: React.FC = () => {
  const { isAdmin, user } = useFirebase();
  const { t } = useLanguage();
  const [reports,      setReports]      = useState<Report[]>([]);
  const [blockedEmails,setBlockedEmails]= useState<BlockedEmail[]>([]);
  const [activeRooms,  setActiveRooms]  = useState<ActiveRoom[]>([]);
  const [users,        setUsers]        = useState<User[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState<'reports' | 'blocked' | 'matches' | 'users' | 'announcements'>('reports');
  const [giveAllAmount, setGiveAllAmount] = useState<number>(100);
  const [givingAll,     setGivingAll]     = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [newAnnTitle,   setNewAnnTitle]   = useState('');
  const [newAnnBody,    setNewAnnBody]    = useState('');
  const [annLoading,    setAnnLoading]    = useState(false);
  const [matches,      setMatches]      = useState<FootballMatch[]>([]);
  const [newMatch,     setNewMatch]     = useState({ teamA: '', teamB: '', league: '', streamUrl: '' });
  const [addingMatch,  setAddingMatch]  = useState(false);
  const [matchMsg,     setMatchMsg]     = useState('');
  const [userSearch,   setUserSearch]   = useState('');

  useEffect(() => {
    if (!isAdmin) return;

    const q = query(collection(db, 'reports'));
    const unsubscribeReports = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Report));
      data.sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
      setReports(data);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'reports'));

    const qBlocked = query(collection(db, 'blocked_emails'));
    const unsubscribeBlocked = onSnapshot(qBlocked, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BlockedEmail));
      data.sort((a, b) => (b.blockedAt?.toMillis?.() || 0) - (a.blockedAt?.toMillis?.() || 0));
      setBlockedEmails(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'blocked_emails'));

    const qUsers = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    const fetchRooms = async () => {
      try {
        const res = await fetch('/api/active-rooms');
        setActiveRooms(await res.json());
      } catch {}
    };
    fetchRooms();
    const roomInterval = setInterval(fetchRooms, 5000);

    const qMatches = query(collection(db, 'football_matches'));
    const unsubscribeMatches = onSnapshot(qMatches, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FootballMatch));
      data.sort((a, b) => (b.createdAt?.localeCompare(a.createdAt || '') || 0));
      setMatches(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'football_matches'));

    const qAnn = query(collection(db, 'announcements'));
    const unsubAnn = onSnapshot(qAnn, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setAnnouncements(data);
    });

    return () => {
      unsubscribeReports();
      unsubscribeBlocked();
      unsubscribeMatches();
      unsubscribeUsers();
      unsubAnn();
      clearInterval(roomInterval);
    };
  }, [isAdmin]);

  const deleteReport = async (id: string) => {
    if (!confirm('Delete this report?')) return;
    try {
      await deleteDoc(doc(db, 'reports', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `reports/${id}`);
    }
  };

  const unblockEmail = async (email: string, userId?: string) => {
    if (!confirm(`Unblock ${email}?`)) return;
    try {
      await deleteDoc(doc(db, 'blocked_emails', email));
      if (userId) await updateDoc(doc(db, 'users', userId), { isBlocked: false });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `blocked_emails/${email}`);
    }
  };

  const blockUser = async (userId: string, email?: string) => {
    if (!confirm('Block this user permanently?')) return;
    try {
      await updateDoc(doc(db, 'users', userId), { isBlocked: true });
      if (email) {
        await setDoc(doc(db, 'blocked_emails', email), { blockedAt: Timestamp.now(), reason: 'Admin Blocked', uid: userId });
      } else {
        await setDoc(doc(db, 'blocked_emails', `uid:${userId}`), { blockedAt: Timestamp.now(), reason: 'Admin Blocked (UID)', uid: userId });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const updateTokens = async (targetUid: string, delta: number) => {
    const target = users.find(u => u.uid === targetUid);
    if (!target) return;
    const current = target.tokens ?? 100;
    const newVal = Math.max(0, current + delta);
    try {
      await updateDoc(doc(db, 'users', targetUid), { tokens: newVal });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${targetUid}`);
    }
  };

  const setTokens = async (targetUid: string, newVal: number) => {
    if (isNaN(newVal) || newVal < 0) return;
    try {
      await updateDoc(doc(db, 'users', targetUid), { tokens: newVal });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${targetUid}`);
    }
  };

  const giveAllTokens = async () => {
    if (!giveAllAmount || giveAllAmount <= 0) return;
    setGivingAll(true);
    try {
      await Promise.all(users.map(u =>
        updateDoc(doc(db, 'users', u.uid), { tokens: (u.tokens ?? 100) + giveAllAmount })
          .catch(e => console.error('Failed for', u.uid, e))
      ));
    } catch (e) { console.error('Give all failed', e); }
    setGivingAll(false);
  };

  const postAnnouncement = async () => {
    if (!newAnnTitle.trim() || !newAnnBody.trim()) return;
    setAnnLoading(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        title: newAnnTitle.trim(),
        body: newAnnBody.trim(),
        createdAt: Timestamp.now(),
      });
      setNewAnnTitle('');
      setNewAnnBody('');
    } catch (e) { console.error('Post announcement failed', e); }
    setAnnLoading(false);
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      // Delete the announcement
      await deleteDoc(doc(db, 'announcements', id));
      // Clean up seenAnnouncements from ALL users who have this id stored
      // Query in batches — arrayRemove is safe even if the value isn't present
      const usersSnap = await getDocs(query(collection(db, 'users')));
      const batch: Promise<void>[] = [];
      usersSnap.forEach(userDoc => {
        const seen: string[] = userDoc.data().seenAnnouncements || [];
        if (seen.includes(id)) {
          batch.push(
            updateDoc(doc(db, 'users', userDoc.id), {
              seenAnnouncements: arrayRemove(id)
            }).catch(e => console.error('Failed to clean seenAnnouncements for', userDoc.id, e))
          );
        }
      });
      await Promise.all(batch);
    } catch (e) { console.error('Delete announcement failed', e); }
  };

  const addMatch = async () => {
    const { teamA, teamB, league, streamUrl } = newMatch;
    if (!teamA || !teamB || !league || !streamUrl) { setMatchMsg('All fields required.'); return; }
    setAddingMatch(true);
    try {
      await addDoc(collection(db, 'football_matches'), {
        teamA, teamB, league, streamUrl,
        live: true,
        createdAt: new Date().toISOString()
      });
      setNewMatch({ teamA: '', teamB: '', league: '', streamUrl: '' });
      setMatchMsg('Match added!');
      setTimeout(() => setMatchMsg(''), 3000);
    } catch (e) {
      setMatchMsg('Failed to add match.');
      handleFirestoreError(e, OperationType.CREATE, 'football_matches');
    }
    setAddingMatch(false);
  };

  const deleteMatch = async (id: string) => {
    if (!confirm('Delete this match?')) return;
    try {
      await deleteDoc(doc(db, 'football_matches', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `football_matches/${id}`);
    }
  };

  const toggleLive = async (id: string, live: boolean) => {
    try {
      await updateDoc(doc(db, 'football_matches', id), { live: !live });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `football_matches/${id}`);
    }
  };


  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(userSearch.toLowerCase()) || 
    u.displayName?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.uid?.toLowerCase().includes(userSearch.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-[40px] p-12 text-center shadow-2xl">
          <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <ShieldAlert className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-3xl font-black tracking-tighter uppercase mb-4">Access Denied</h1>
          <p className="text-neutral-500 font-medium leading-relaxed mb-8">
            This terminal is restricted to Gupto Protocol Administrators.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="w-full bg-white text-black font-black py-4 rounded-2xl hover:bg-emerald-500 hover:text-white transition-all duration-300 uppercase tracking-widest"
          >
            Return to Base
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-emerald-500/30 font-sans overflow-hidden flex flex-col">
      <header className="flex items-center justify-between px-10 py-6 border-b border-neutral-900 bg-neutral-950 z-30">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-widest uppercase leading-none font-brand bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent">{t.appName} Control</h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-600 mt-1">Gupto Protocol v2.5</p>
            </div>
          </div>
          <div className="h-8 w-px bg-neutral-900 mx-2" />
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-widest text-neutral-600">Active Nodes</span>
              <span className="text-lg font-mono text-emerald-500">{activeRooms.length.toString().padStart(2, '0')}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-widest text-neutral-600">Reports</span>
              <span className="text-lg font-mono text-red-500">{reports.length.toString().padStart(2, '0')}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-neutral-900 rounded-xl border border-neutral-800">
            <Globe className="w-3 h-3 text-emerald-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Global Status: </span>
            <span className="text-[10px] font-mono text-emerald-500 uppercase">Operational</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-neutral-900 rounded-xl border border-neutral-800">
            <Lock className="w-3 h-3 text-emerald-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Encryption: </span>
            <span className="text-[10px] font-mono text-emerald-500 uppercase">AES-256</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-80 border-r border-neutral-900 bg-neutral-950 p-8 flex flex-col gap-4">
          {/* Reports tab */}
          <button onClick={() => setActiveTab('reports')}
            className={`p-5 rounded-2xl transition-all duration-300 flex items-center justify-between ${activeTab === 'reports' ? 'bg-emerald-500 text-black shadow-2xl shadow-emerald-500/20' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}>
            <div className="flex items-center gap-4">
              <MessageSquare className="w-5 h-5" />
              <span className="font-black uppercase tracking-tighter">Reports</span>
            </div>
            {reports.length > 0 && (
              <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${activeTab === 'reports' ? 'bg-black text-emerald-500' : 'bg-neutral-800 text-neutral-500'}`}>
                {reports.length}
              </span>
            )}
          </button>

          {/* Users tab */}
          <button onClick={() => setActiveTab('users')}
            className={`p-5 rounded-2xl transition-all duration-300 flex items-center justify-between ${activeTab === 'users' ? 'bg-emerald-500 text-black shadow-2xl shadow-emerald-500/20' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}>
            <div className="flex items-center gap-4">
              <Users className="w-5 h-5" />
              <span className="font-black uppercase tracking-tighter">Users</span>
            </div>
            {users.length > 0 && (
              <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${activeTab === 'users' ? 'bg-black text-emerald-500' : 'bg-neutral-800 text-neutral-500'}`}>
                {users.length}
              </span>
            )}
          </button>

          {/* Blocked tab */}
          <button onClick={() => setActiveTab('blocked')}
            className={`p-5 rounded-2xl transition-all duration-300 flex items-center justify-between ${activeTab === 'blocked' ? 'bg-emerald-500 text-black shadow-2xl shadow-emerald-500/20' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}>
            <div className="flex items-center gap-4">
              <UserX className="w-5 h-5" />
              <span className="font-black uppercase tracking-tighter">Blocked</span>
            </div>
            {blockedEmails.length > 0 && (
              <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${activeTab === 'blocked' ? 'bg-black text-emerald-500' : 'bg-neutral-800 text-neutral-500'}`}>
                {blockedEmails.length}
              </span>
            )}
          </button>

          {/* Matches tab */}
          <button onClick={() => setActiveTab('matches')}
            className={`p-5 rounded-2xl transition-all duration-300 flex items-center justify-between ${activeTab === 'matches' ? 'bg-emerald-500 text-black shadow-2xl shadow-emerald-500/20' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}>
            <div className="flex items-center gap-4">
              <Tv2 className="w-5 h-5" />
              <span className="font-black uppercase tracking-tighter">Matches</span>
            </div>
            {matches.length > 0 && (
              <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${activeTab === 'matches' ? 'bg-black text-emerald-500' : 'bg-neutral-800 text-neutral-500'}`}>
                {matches.length}
              </span>
            )}
          </button>

          <button onClick={() => setActiveTab('announcements')}
            className={`p-5 rounded-2xl transition-all duration-300 flex items-center justify-between ${activeTab === 'announcements' ? 'bg-emerald-500 text-black shadow-2xl shadow-emerald-500/20' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}>
            <div className="flex items-center gap-4">
              <MessageSquare className="w-5 h-5" />
              <span className="font-black uppercase tracking-tighter">Announcements</span>
            </div>
            <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${activeTab === 'announcements' ? 'bg-black text-emerald-500' : 'bg-neutral-800 text-neutral-500'}`}>
              {announcements.length}
            </span>
          </button>

          <button onClick={() => { window.location.href = '/'; }}
            className="w-full flex items-center justify-center gap-4 p-6 rounded-2xl bg-white text-black hover:bg-emerald-500 hover:text-white transition-all duration-300 font-black uppercase tracking-tighter shadow-xl">
            <Video className="w-6 h-6" />
            Start Encounter
          </button>

          <div className="mt-auto p-6 bg-neutral-900/50 rounded-3xl border border-neutral-900">
            <div className="flex items-center gap-3 mb-4">
              <Terminal className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">System Log</span>
            </div>
            <div className="space-y-2">
              <p className="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">07:56:27 - Protocol Initialized</p>
              <p className="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">07:56:30 - Auth Handshake OK</p>
              <p className="text-[8px] font-mono text-emerald-500/50 uppercase tracking-widest animate-pulse">07:56:35 - Monitoring Active</p>
            </div>
          </div>
        </aside>

        <div className="flex-1 overflow-y-auto p-12 bg-neutral-950 relative">
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none"
               style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

          <AnimatePresence mode="wait">
            {activeTab === 'reports' ? (
              <motion.div key="reports" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-5xl mx-auto space-y-6">
                <div className="flex items-center justify-between mb-12">
                  <h2 className="text-4xl font-black tracking-tighter uppercase">Security Reports</h2>
                  <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-600">Real-time Feed</span>
                </div>
                {reports.map(report => (
                  <div key={report.id} className="bg-neutral-900/50 border border-neutral-900 rounded-[32px] p-8 hover:border-red-500/30 transition-all duration-500">
                    <div className="flex items-start justify-between mb-8">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-red-500/10 rounded-2xl flex items-center justify-center">
                          <ShieldAlert className="w-7 h-7 text-red-500" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-600 mb-1">Reported Entity</p>
                          <p className="text-xl font-mono text-emerald-500">{report.violatorEmail || report.violatorName || report.violatorUid}</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => deleteReport(report.id)}
                          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
                          Dismiss
                        </button>
                        <button onClick={() => blockUser(report.violatorUid, report.violatorEmail)}
                          className="flex items-center gap-3 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-red-600/20">
                          <UserX className="w-4 h-4" /> Execute Block
                        </button>
                      </div>
                    </div>
                    <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-900 mb-6">
                      <p className="text-neutral-400 text-sm font-medium">"{report.reason}"</p>
                    </div>
                    <div className="flex gap-8 pt-6 border-t border-neutral-900">
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mb-1">Reporter</p>
                        <p className="text-[10px] font-mono text-neutral-400">{report.reporterEmail || report.reporterName || report.reporterUid}</p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mb-1">Timestamp</p>
                        <p className="text-[10px] font-mono text-neutral-400">{new Date(report.timestamp?.toDate()).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {reports.length === 0 && (
                  <div className="py-40 text-center">
                    <Shield className="w-20 h-20 text-neutral-900 mx-auto mb-8" />
                    <p className="text-neutral-700 font-black uppercase tracking-[0.4em]">No Security Violations Logged</p>
                  </div>
                )}
              </motion.div>

            ) : activeTab === 'users' ? (
              <motion.div key="users" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-5xl mx-auto space-y-6">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-4xl font-black tracking-tighter uppercase">User Management</h2>
                    <p className="text-[10px] font-mono text-neutral-500 mt-2 uppercase tracking-widest">
                      Showing {filteredUsers.length} out of {users.length} total users
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-2">
                      <span className="text-xs text-neutral-500 font-bold uppercase tracking-widest">Bonus</span>
                      <input
                        type="number"
                        value={giveAllAmount}
                        min={1}
                        onChange={e => setGiveAllAmount(parseInt(e.target.value) || 0)}
                        className="w-16 bg-transparent text-white text-center text-sm font-black outline-none"
                      />
                      <span className="text-xs text-neutral-500 font-bold">tokens</span>
                    </div>
                    <button
                      onClick={giveAllTokens}
                      disabled={givingAll}
                      className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20"
                    >
                      {givingAll ? 'Giving...' : `Give All (${users.length})`}
                    </button>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                      <input 
                        value={userSearch}
                        onChange={e => setUserSearch(e.target.value)}
                        placeholder="Search users..."
                        className="pl-12 pr-6 py-3 bg-neutral-900 border border-neutral-800 rounded-2xl text-sm focus:border-emerald-500 outline-none transition-all w-64"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  {filteredUsers.map(user => (
                    <div key={user.id} className="bg-neutral-900/50 border border-neutral-900 rounded-[32px] p-8 hover:border-emerald-500/20 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                          <div className="w-14 h-14 bg-neutral-950 rounded-2xl flex items-center justify-center border border-neutral-800">
                            <Users className="w-6 h-6 text-neutral-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-3">
                              <p className="text-xl font-black text-white">{user.displayName || 'Anonymous'}</p>
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase ${user.role === 'admin' ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-500'}`}>
                                {user.role}
                              </span>
                              {user.isBlocked && (
                                <span className="text-[8px] font-black px-2 py-0.5 rounded uppercase bg-red-500 text-white">
                                  Blocked
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-mono text-neutral-500 mt-1">{user.email} • {user.uid}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-8">
                          <div className="text-right">


                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col items-center gap-1.5">
                              <span className="text-[8px] font-black uppercase tracking-widest text-neutral-500">Tokens</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => updateTokens(user.uid, -10)}
                                  className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white font-black text-sm transition-all flex items-center justify-center"
                                >−</button>
                                <input
                                  type="number"
                                  value={user.tokens ?? 100}
                                  min={0}
                                  onChange={() => {}}
                                  onBlur={(e) => setTokens(user.uid, parseInt(e.target.value))}
                                  className="w-16 bg-neutral-950 border border-neutral-800 rounded-xl p-1.5 text-center text-sm text-emerald-400 font-black"
                                />
                                <button
                                  onClick={() => updateTokens(user.uid, 10)}
                                  className="w-7 h-7 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white font-black text-sm transition-all flex items-center justify-center"
                                >+</button>
                              </div>
                              <div className="flex gap-1 mt-0.5">
                                <button onClick={() => setTokens(user.uid, 100)} className="px-2 py-0.5 text-[8px] font-black uppercase tracking-widest bg-neutral-800 hover:bg-emerald-500/20 text-neutral-500 hover:text-emerald-400 rounded-md transition-all">Reset 100</button>
                                <button onClick={() => setTokens(user.uid, 0)} className="px-2 py-0.5 text-[8px] font-black uppercase tracking-widest bg-neutral-800 hover:bg-red-500/20 text-neutral-500 hover:text-red-400 rounded-md transition-all">Zero</button>
                              </div>
                            </div>
                            {!user.isBlocked ? (
                              <button onClick={() => blockUser(user.id, user.email)}
                                className="p-4 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-2xl transition-all">
                                <UserX className="w-5 h-5" />
                              </button>
                            ) : (
                              <button onClick={() => unblockEmail(user.email, user.id)}
                                className="p-4 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white rounded-2xl transition-all">
                                <Shield className="w-5 h-5" />
                              </button>
                            ) }
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {filteredUsers.length === 0 && (
                  <div className="py-40 text-center">
                    <Users className="w-20 h-20 text-neutral-900 mx-auto mb-8" />
                    <p className="text-neutral-700 font-black uppercase tracking-[0.4em]">No Users Found</p>
                  </div>
                )}
              </motion.div>
            ) : activeTab === 'blocked' ? (
              <motion.div key="blocked" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-5xl mx-auto space-y-6">
                <div className="flex items-center justify-between mb-12">
                  <h2 className="text-4xl font-black tracking-tighter uppercase">Blocked Entities</h2>
                  <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-600">Protocol Deny List</span>
                </div>
                {blockedEmails.map(blocked => (
                  <div key={blocked.id} className="bg-neutral-900/50 border border-neutral-900 rounded-[32px] p-8 hover:border-emerald-500/30 transition-all duration-500">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-neutral-950 rounded-2xl flex items-center justify-center border border-neutral-800">
                          <Lock className="w-6 h-6 text-neutral-600" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-600 mb-1">Email Address</p>
                          <p className="text-xl font-mono text-white">{blocked.id}</p>
                        </div>
                      </div>
                      <button onClick={() => unblockEmail(blocked.id, blocked.uid)}
                        className="bg-white hover:bg-emerald-500 text-black hover:text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl">
                        Restore Access
                      </button>
                    </div>
                    <div className="mt-6 flex gap-8 pt-6 border-t border-neutral-900">
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mb-1">Blocked At</p>
                        <p className="text-[10px] font-mono text-neutral-400">{new Date(blocked.blockedAt?.toDate()).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mb-1">Reason</p>
                        <p className="text-[10px] font-mono text-neutral-400 uppercase">{blocked.reason}</p>
                      </div>
                      {blocked.uid && (
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mb-1">Internal UID</p>
                          <p className="text-[10px] font-mono text-neutral-400">{blocked.uid}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {blockedEmails.length === 0 && (
                  <div className="py-40 text-center">
                    <Globe className="w-20 h-20 text-neutral-900 mx-auto mb-8" />
                    <p className="text-neutral-700 font-black uppercase tracking-[0.4em]">Deny List is Empty</p>
                  </div>
                )}
              </motion.div>

            ) : activeTab === 'matches' ? (
              <motion.div key="matches" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-5xl mx-auto space-y-6">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-4xl font-black tracking-tighter uppercase">Live Matches</h2>
                  <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-600">Football Stream Manager</span>
                </div>

                {/* Add match form */}
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-[32px] p-8">
                  <h3 className="text-lg font-black uppercase tracking-tighter mb-6 flex items-center gap-3">
                    <Plus className="w-5 h-5 text-emerald-500" /> Add New Match
                  </h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 mb-1.5 block">Team A</label>
                      <input value={newMatch.teamA} onChange={e => setNewMatch(p => ({ ...p, teamA: e.target.value }))}
                        placeholder="e.g. Barcelona"
                        className="w-full px-4 py-3 rounded-2xl bg-neutral-950 border border-neutral-800 text-white text-sm focus:border-emerald-500/50 focus:outline-none transition-colors" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 mb-1.5 block">Team B</label>
                      <input value={newMatch.teamB} onChange={e => setNewMatch(p => ({ ...p, teamB: e.target.value }))}
                        placeholder="e.g. Real Madrid"
                        className="w-full px-4 py-3 rounded-2xl bg-neutral-950 border border-neutral-800 text-white text-sm focus:border-emerald-500/50 focus:outline-none transition-colors" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 mb-1.5 block">League</label>
                      <input value={newMatch.league} onChange={e => setNewMatch(p => ({ ...p, league: e.target.value }))}
                        placeholder="e.g. La Liga"
                        className="w-full px-4 py-3 rounded-2xl bg-neutral-950 border border-neutral-800 text-white text-sm focus:border-emerald-500/50 focus:outline-none transition-colors" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 mb-1.5 block">Stream URL</label>
                      <input value={newMatch.streamUrl} onChange={e => setNewMatch(p => ({ ...p, streamUrl: e.target.value }))}
                        placeholder="https://..."
                        className="w-full px-4 py-3 rounded-2xl bg-neutral-950 border border-neutral-800 text-white text-sm focus:border-emerald-500/50 focus:outline-none transition-colors" />
                    </div>
                  </div>
                  {matchMsg && (
                    <p className={`text-xs mb-4 font-bold ${matchMsg.includes('!') ? 'text-emerald-400' : 'text-red-400'}`}>{matchMsg}</p>
                  )}
                  <button onClick={addMatch} disabled={addingMatch}
                    className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-black uppercase tracking-widest text-sm transition-all shadow-xl shadow-emerald-500/20">
                    <Plus className="w-4 h-4" />
                    {addingMatch ? 'Adding…' : 'Add Match'}
                  </button>
                </div>

                {/* Match list */}
                {matches.map(match => (
                  <div key={match.id} className="bg-neutral-900/50 border border-neutral-900 rounded-[32px] p-8 hover:border-emerald-500/20 transition-all">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${match.live ? 'bg-red-500 animate-pulse' : 'bg-neutral-600'}`} />
                          <span className={`text-[9px] font-bold uppercase tracking-widest ${match.live ? 'text-red-400' : 'text-neutral-600'}`}>
                            {match.live ? 'LIVE' : 'OFFLINE'}
                          </span>
                          <span className="text-[9px] text-neutral-600 uppercase tracking-widest">· {match.league}</span>
                        </div>
                        <p className="text-xl font-black text-white">{match.teamA} vs {match.teamB}</p>
                        <p className="text-[10px] font-mono text-neutral-600 mt-1 truncate max-w-sm">{match.streamUrl}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleLive(match.id, match.live)}
                          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${match.live ? 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'}`}>
                          {match.live ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
                          {match.live ? 'Set Offline' : 'Set Live'}
                        </button>
                        <button onClick={() => deleteMatch(match.id)}
                          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-red-600/20">
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {matches.length === 0 && (
                  <div className="py-40 text-center">
                    <Tv2 className="w-20 h-20 text-neutral-900 mx-auto mb-8" />
                    <p className="text-neutral-700 font-black uppercase tracking-[0.4em]">No Matches Added Yet</p>
                  </div>
                )}
              </motion.div>

            ) : activeTab === 'announcements' ? (
              <motion.div key="announcements" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-3xl mx-auto space-y-6">
                <h2 className="text-4xl font-black tracking-tighter uppercase mb-8">Announcements</h2>
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-[32px] p-8 space-y-4">
                  <h3 className="text-lg font-black uppercase tracking-widest text-emerald-400">Post New Announcement</h3>
                  <input
                    value={newAnnTitle}
                    onChange={e => setNewAnnTitle(e.target.value)}
                    placeholder="Title..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl px-5 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-all"
                  />
                  <textarea
                    value={newAnnBody}
                    onChange={e => setNewAnnBody(e.target.value)}
                    placeholder="Announcement body..."
                    rows={4}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl px-5 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-all resize-none"
                  />
                  <button
                    onClick={postAnnouncement}
                    disabled={annLoading || !newAnnTitle.trim() || !newAnnBody.trim()}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    {annLoading ? 'Posting...' : 'Post Announcement'}
                  </button>
                </div>
                <div className="space-y-4">
                  {announcements.length === 0 && (
                    <div className="py-20 text-center">
                      <MessageSquare className="w-16 h-16 text-neutral-900 mx-auto mb-6" />
                      <p className="text-neutral-700 font-black uppercase tracking-[0.4em]">No Announcements Yet</p>
                    </div>
                  )}
                  {announcements.map((ann: any) => (
                    <div key={ann.id} className="bg-neutral-900/50 border border-neutral-900 rounded-[28px] p-6 hover:border-emerald-500/20 transition-all">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-white font-black text-lg mb-1">{ann.title}</p>
                          <p className="text-neutral-400 text-sm leading-relaxed whitespace-pre-wrap">{ann.body}</p>
                          <p className="text-neutral-600 text-[10px] font-mono mt-3 uppercase tracking-widest">
                            {ann.createdAt?.toDate?.()?.toLocaleString() || ''}
                          </p>
                        </div>
                        <button onClick={() => deleteAnnouncement(ann.id)}
                          className="shrink-0 p-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};