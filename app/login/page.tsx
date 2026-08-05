'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, Input, Typography, Form, App } from 'antd';
import { MailOutlined, LockOutlined, LineChartOutlined } from '@ant-design/icons';
import AntdProvider from '../../components/Providers/AntdProvider';

const { Title, Text } = Typography;
const DEFAULT_LANDING = '/androidadvice';

function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { message: antdMessage } = App.useApp();

  const onLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email, password: values.password }),
      });

      const data = await response.json();

      if (response.ok) {
        antdMessage.success('Login successful!');
        window.location.href = DEFAULT_LANDING;
      } else {
        antdMessage.error(data.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      antdMessage.error('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#fff',
      position: 'relative',
      overflow: 'hidden',
    }}>
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
        zIndex: 0,
      }} />

      <Card
        style={{
          width: 420,
          borderRadius: '20px',
          boxShadow: '0 15px 35px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          border: 'none',
          position: 'relative',
          zIndex: 1,
        }}
        styles={{ body: { padding: '36px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'var(--primary-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 10px 20px rgba(106, 61, 232, 0.2)',
          }}>
            <LineChartOutlined style={{ fontSize: '38px', color: 'white' }} />
          </div>

          <Title level={2} style={{
            marginBottom: 8,
            background: 'var(--primary-gradient)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontWeight: '600',
          }}>
            Welcome to AdSyntheX
          </Title>
          <Text type="secondary" style={{ fontSize: '15px' }}>Please login to continue</Text>
        </div>

        <Form name="login" layout="vertical" onFinish={onLogin}>
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Enter a valid email' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="Email" size="large" autoComplete="email" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" autoComplete="current-password" />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              className="login-button"
              loading={loading}
            >
              Login
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AntdProvider>
      <App>
        <LoginForm />
      </App>
    </AntdProvider>
  );
}