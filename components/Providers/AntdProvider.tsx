'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { ConfigProvider, App } from 'antd';

// Create theme context
type ThemeType = 'light' | 'dark';
type ThemeContextType = {
  theme: ThemeType;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export default function AntdProvider({ children }: { children: React.ReactNode }) {
  // Initialize theme from localStorage if available, otherwise use light theme
  const [theme, setTheme] = useState<ThemeType>('light');
  
  // Load theme from localStorage on component mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as ThemeType;
    if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
      setTheme(savedTheme);
    }
  }, []);
  
  // Update localStorage and document class when theme changes
  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  
  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };
  
  // Define theme configs
  const lightTheme = {
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
  };
  
  const darkTheme = {
    token: {
      colorPrimary: '#6366f1',
      colorSuccess: '#10b981',
      colorWarning: '#f59e0b',
      colorError: '#ef4444',
      colorTextBase: '#e5e7eb',
      colorTextSecondary: '#9ca3af',
      colorBgContainer: '#1f2937',
      colorBgElevated: '#374151',
      borderRadius: 16,
      borderRadiusLG: 20,
      borderRadiusSM: 12,
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.15)',
      boxShadowSecondary: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.15)',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: 14,
      lineHeight: 1.5,
    },
    components: {
      Card: {
        borderRadiusLG: 16,
        boxShadowTertiary: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.15)',
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
        colorBgContainer: '#1f2937',
        headerBg: '#111827',
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
        colorSplit: '#374151',
      },
      Typography: {
        fontWeightStrong: 600,
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <ConfigProvider
        theme={theme === 'light' ? lightTheme : darkTheme}
      >
        <App>{children}</App>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
} 