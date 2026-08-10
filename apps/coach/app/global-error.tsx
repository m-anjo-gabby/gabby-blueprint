'use client';

import { useEffect } from 'react';
import { logClientError } from '@gabby/lib/logger/actions';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    logClientError({
      service: 'coach',
      digest: error.digest,
      message: `[FATAL] Global Layout Crash: ${error.message}`,
      stack: error.stack,
    }).catch((err) => console.error(err));
  }, [error]);

  return (
    <html lang="en">
      <body style={{ backgroundColor: '#f8fafc', fontFamily: 'sans-serif', margin: 0, padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', background: 'white', padding: '3rem', borderRadius: '2rem', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', maxWidth: '400px' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0f172a', margin: '0 0 1rem 0' }}>The system is temporarily unavailable</h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: '1.5', marginBottom: '2rem' }}>A critical error occurred in the application&apos;s base layout. Please refresh your browser or try again later.</p>
          <button
            onClick={() => window.location.href = '/dashboard'}
            style={{ backgroundColor: '#0f172a', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '1rem', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}
          >
            Reload System
          </button>
        </div>
      </body>
    </html>
  );
}
