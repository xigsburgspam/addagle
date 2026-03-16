import React, { useState } from 'react';
import ConfirmationScreen from './components/ConfirmationScreen';
import VideoChat from './components/VideoChat';

export default function App() {
  const [isConfirmed, setIsConfirmed] = useState(false);

  return (
    <>
      {!isConfirmed ? (
        <ConfirmationScreen onConfirm={() => setIsConfirmed(true)} />
      ) : (
        <VideoChat />
      )}
    </>
  );
}
