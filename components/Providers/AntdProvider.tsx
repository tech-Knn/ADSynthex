'use client';

import React from 'react';
import { ConfigProvider, App } from 'antd';

export default function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#4f46e5',
          colorSuccess: '#10b981',
          colorWarning: '#f59e0b',
          colorError: '#ef4444',
          colorTextBase: '#111827',
          colorTextSecondary: '#4b5563',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#ffffff',
          borderRadius: 16,
          borderRadiusLG: 20,
          borderRadiusSM: 12,
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06)',
          boxShadowSecondary: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontSize: 14,
          lineHeight: 1.5,
        },
        components: {
          Card: {
            borderRadiusLG: 16,
            boxShadowTertiary: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
            colorBorderSecondary: 'transparent',
          },
          Button: {
            borderRadius: 12,
            paddingInline: 20,
            controlHeight: 40,
            controlHeightLG: 48,
          },
          Input: {
            borderRadius: 12,
            paddingBlock: 10,
            paddingInline: 16,
          },
          Table: {
            borderRadius: 16,
            colorBgContainer: '#ffffff',
            headerBg: '#f9fafb',
          },
          Tag: {
            borderRadius: 20,
            paddingXS: 12,
          },
          Alert: {
            borderRadius: 16,
          },
          Divider: {
            marginLG: 32,
            colorSplit: '#e5e7eb',
          },
          Typography: {
            fontWeightStrong: 600,
          }
        }
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
} 