'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, Input, Typography, Form, Tabs, message, App } from 'antd';
import { 
  UserOutlined, 
  LockOutlined, 
  KeyOutlined,
  LineChartOutlined 
} from '@ant-design/icons';
import AntdProvider from '../../components/Providers/AntdProvider';

const { Title, Text } = Typography;

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('user');
  const { message: antdMessage } = App.useApp();

  const loginAsAdmin = async (values: { adminKey: string }) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': values.adminKey
        },
        body: JSON.stringify({ type: 'admin' })
      });

      if (response.ok) {
        antdMessage.success('Login successful!');
        router.push('/dashboard');
      } else {
        antdMessage.error('Invalid admin key');
      }
    } catch (error) {
      console.error('Login error:', error);
      antdMessage.error('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loginAsUser = async (values: { accountId: string }) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'user',
          accountId: values.accountId
        })
      });

      if (response.ok) {
        const data = await response.json();
        antdMessage.success('Login successful!');

        // Redirect based on allowed feeds for this account
        const { allowedFeeds, accountId } = data;

        if (allowedFeeds && allowedFeeds.length > 0) {
          // Redirect to the first allowed feed
          const firstFeed = allowedFeeds[0];

          if (firstFeed === 'compado') {
            router.push('/compado');
          } else if (firstFeed === 'inuvo') {
            router.push('/inuvo-dashboard');
          } else if (firstFeed === 'adsense') {
            router.push('/adsense');
          } else if (firstFeed === 'predicto') {
            router.push('/predicto');
          } else if (firstFeed === 'carhp') {
            router.push('/carhp');
          } else if (firstFeed === 'thefactrelay') {
            router.push('/thefactrelay');
          } else if (firstFeed === 'androidadvice') {
            router.push('/androidadvice');
          } else {
            // Fallback — only feed currently active
            router.push('/androidadvice');
          }
        } else {
          // No feeds allowed — send to login (middleware will keep them out)
          router.push('/androidadvice');
        }
      } else {
        antdMessage.error('Invalid account ID');
      }
    } catch (error) {
      console.error('Login error:', error);
      antdMessage.error('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Define tab items for the Tabs component
  const tabItems = [
    {
      key: 'user',
      label: 'User Login',
      children: (
        <Form
          name="user_login"
          layout="vertical"
          onFinish={loginAsUser}
        >
          <Form.Item
            name="accountId"
            rules={[{ required: true, message: 'Please enter your account ID' }]}
          >
            <Input.Password 
              prefix={<UserOutlined />} 
              placeholder="Enter your Account ID" 
              size="large"
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              block 
              size="large"
              className="login-button"
              loading={loading && activeTab === 'user'}
            >
              Login as User
            </Button>
          </Form.Item>
        </Form>
      )
    },
    {
      key: 'admin',
      label: 'Admin Login',
      children: (
        <Form
          name="admin_login"
          layout="vertical"
          onFinish={loginAsAdmin}
        >
          <Form.Item
            name="adminKey"
            rules={[{ required: true, message: 'Please enter admin key' }]}
          >
            <Input.Password 
              prefix={<KeyOutlined />} 
              placeholder="Enter Admin Key" 
              size="large"
            />
          </Form.Item>
          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              block 
              size="large"
              className="login-button"
              loading={loading && activeTab === 'admin'}
            >
              Login as Admin
            </Button>
          </Form.Item>
        </Form>
      )
    }
  ];

  return (
    <AntdProvider>
      <App>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: '#fff',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Top wave shape */}
          <div className="login-bg-wave" style={{
            position: 'absolute',
            width: '100%',
            height: '50vh',
            background: 'var(--primary-gradient)',
            top: 0,
            left: 0,
            borderBottomLeftRadius: '50%',
            borderBottomRightRadius: '50%',
            transform: 'scaleX(1.5)',
            zIndex: 0
          }}></div>
          
          <Card 
            style={{ 
              width: 420,
              borderRadius: '20px',
              boxShadow: '0 15px 35px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
              border: 'none',
              animation: 'fadeIn 0.6s ease-out',
              position: 'relative',
              zIndex: 1
            }}
            variant="outlined"
            bodyStyle={{ padding: '36px' }}
          >
            <div style={{ 
              textAlign: 'center', 
              marginBottom: 32,
              position: 'relative'
            }}>
              {/* Brand Logo/Icon */}
              <div style={{ 
                width: '80px', 
                height: '80px', 
                borderRadius: '50%',
                background: 'var(--primary-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
                boxShadow: '0 10px 20px rgba(106, 61, 232, 0.2)'
              }}>
                <LineChartOutlined style={{ fontSize: '38px', color: 'white' }} />
              </div>
              
              <div style={{ position: 'relative', zIndex: 1 }}>
                <Title level={2} style={{ 
                  marginBottom: 8, 
                  background: 'var(--primary-gradient)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  fontWeight: '600'
                }}>
                  Welcome to AdSyntheX
                </Title>
                <Text type="secondary" style={{ fontSize: '15px' }}>Please login to continue</Text>
              </div>
            </div>
            
            <Tabs 
              activeKey={activeTab} 
              onChange={setActiveTab}
              centered
              style={{ marginBottom: 24 }}
              items={tabItems}
            />
          </Card>
        </div>
      </App>
    </AntdProvider>
  );
} 