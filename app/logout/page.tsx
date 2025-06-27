'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin, Typography } from 'antd';
import AntdProvider from '../../components/Providers/AntdProvider';

const { Text } = Typography;

export default function LogoutPage() {
  const router = useRouter();
  
  useEffect(() => {
    const performLogout = async () => {
      try {
        // Call the logout API endpoint
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        // Redirect to login page after a short delay
        setTimeout(() => {
          router.push('/login');
        }, 1500);
      } catch (error) {
        console.error('Logout error:', error);
        // Redirect to login page even if there's an error
        setTimeout(() => {
          router.push('/login');
        }, 1500);
      }
    };
    
    performLogout();
  }, [router]);
  
  return (
    <AntdProvider>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #f6f9fc 0%, #edf2f7 100%)'
      }}>
        <Spin size="large" />
        <Text style={{ marginTop: '16px' }}>Logging out...</Text>
      </div>
    </AntdProvider>
  );
} 