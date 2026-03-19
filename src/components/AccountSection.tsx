import React, { useEffect, useState } from 'react';
import { useFirebase } from '../FirebaseContext';

interface AccountSectionProps {
  onClose: () => void;
}

export const AccountSection: React.FC<AccountSectionProps> = ({ onClose }) => {
  const { user } = useFirebase();
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [remainingTime, setRemainingTime] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/user/blocked?uid=${user.uid}`)
      .then(res => res.json())
      .then(setBlockedUsers);
    fetch(`/api/user/stats?uid=${user.uid}`)
      .then(res => res.json())
      .then(data => setRemainingTime(data.remaining));
  }, [user]);

  const unblockUser = (blockedId: string) => {
    fetch(`/api/user/blocked/${blockedId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid })
    }).then(() => {
      setBlockedUsers(blockedUsers.filter(id => id !== blockedId));
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-lg max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Account Center</h2>
        <p className="mb-4">Remaining Video Chat Time: {remainingTime} minutes</p>
        
        <h3 className="font-semibold mb-2">Blocked Users</h3>
        <ul className="space-y-2">
          {blockedUsers.map(id => (
            <li key={id} className="flex justify-between items-center">
              <span>{id}</span>
              <button onClick={() => unblockUser(id)} className="text-red-500">Unblock</button>
            </li>
          ))}
        </ul>
        
        <button onClick={onClose} className="mt-6 w-full bg-blue-500 text-white py-2 rounded">Close</button>
      </div>
    </div>
  );
};
