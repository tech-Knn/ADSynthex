'use client';

import React, { useState } from 'react';
import { Button, Input, Typography, Form, App } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import AntdProvider from '../../components/Providers/AntdProvider';
import AsxLogo from '../../components/AppShell/AsxLogo';
import '../../components/AppShell/appshell.css';
import './login.css';

const { Title, Text } = Typography;
const DEFAULT_LANDING = '/dashboard';

function LoginForm() {
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
    <div
      className="asx-login"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 24,
        background: '#f8faff',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div className="asx-login-blob asx-login-blob-1" />
      <div className="asx-login-blob asx-login-blob-2" />

      <div
        className="asx-login-card"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 420,
          background: '#ffffff',
          border: '1px solid #e8ecf6',
          borderRadius: 18,
          padding: '36px 32px 28px',
          boxShadow: '0 20px 50px -20px rgba(79, 70, 229, 0.18)',
        }}
      >
        <div className="asx-login-head">
          <div className="asx-login-logo">
            <AsxLogo size={56} />
          </div>
          <Title level={3} className="asx-login-title">
            Welcome to AdSynthe<span className="brand-x">X</span>
          </Title>
          <Text type="secondary" className="asx-login-sub">Sign in to your workspace to continue</Text>
        </div>

        <Form name="login" layout="vertical" onFinish={onLogin} requiredMark={false}>
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Enter a valid email' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="you@company.com" size="large" autoComplete="email" />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Enter your password" size="large" autoComplete="current-password" />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              className="btn-primary-gradient"
              loading={loading}
            >
              Sign in
            </Button>
          </Form.Item>
        </Form>

        <div className="asx-login-foot">
          <Text type="secondary" style={{ fontSize: 12 }}>
            © {new Date().getFullYear()} AdSyntheX
          </Text>
        </div>
      </div>
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
