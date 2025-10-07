import React, { ReactNode, useState, useEffect } from 'react';
import { Layout, Menu, Typography, Select, Divider, Space, Button, Tooltip, App, Switch } from 'antd';
import {
  DashboardOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  TeamOutlined,
  LogoutOutlined,
  LockOutlined,
  BulbOutlined,
  BulbFilled,
  DollarOutlined,
  ApiOutlined,
  RocketOutlined
} from '@ant-design/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '../Providers/AntdProvider';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

// Define customer accounts
const CUSTOMER_ACCOUNTS = [
  {
    id: 'all',
    name: 'All Accounts',
    value: null
  },
  {
    id: 'CID_8677814915',
    name: 'Ads.com - RSOC - IST',
    value: '8677814915'
  },
  {
    id: 'CID_9071440966',
    name: 'Ads.com - RSOC - UTC - 02',
    value: '9071440966'
  },
  {
    id: 'CID_5723554317',
    name: 'Ads.com - RSOC - UTC - 03',
    value: '5723554317'
  },
  {
    id: 'CID_3146253756',
    name: 'Ads.com - RSOC - UTC - 04',
    value: '3146253756'
  },
  {
    id: 'CID_5857090949',
    name: 'Ads.com - RSOC - UTC - 05',
    value: '5857090949'
  },
  {
    id: 'CID_6201189752',
    name: 'Ads.com - RSOC - UTC - 06',
    value: '6201189752'
  },
  {
    id: 'CID_4071621621',
    name: 'Ads.com - RSOC - UTC - 07',
    value: '4071621621'
  },
  {
    id: 'CID_7579121709',
    name: 'Ads.com - RSOC - UTC - 08',
    value: '7579121709'
  },
  {
    id: 'CID_1918795911',
    name: 'Ads.com - RSOC - UTC - 09',
    value: '1918795911'
  },
  {
    id: 'CID_2849704713',
    name: 'Ads.com - RSOC - UTC - 10',
    value: '2849704713'
  },
  {
    id: 'CID_7605096292',
    name: 'Ads.com - RSOC - UTC - 11',
    value: '7605096292'
  },
  {
    id: 'CID_5719842337',
    name: 'Ads.com - RSOC - UTC - 12',
    value: '5719842337'
  },
  {
    id: 'CID_9341614254',
    name: 'Ads.com - RSOC - UTC - 13',
    value: '9341614254'
  },
  {
    id: 'CID_9790364217',
    name: 'Ads.com - UTC - 14',
    value: '9790364217'
  },
  {
    id: 'CID_2420687578',
    name: 'Ads.com - UTC - 16',
    value: '2420687578'
  },
  {
    id: 'CID_6324595978',
    name: 'Ads.com - RSOC - UTC - 17',
    value: '6324595978'
  },
  {
    id: 'CID_5133038944',
    name: 'Ads.com - RSOC - UTC - 18',
    value: '5133038944'
  },
  {
    id: 'CID_9084731648',
    name: 'Ads.com - RSOC - UTC - 19',
    value: '9084731648'
  },
  {
    id: 'CID_5109995931',
    name: 'Ads.com - RSOC - UTC - 20',
    value: '5109995931'
  },
  {
    id: 'CID_3218250684',
    name: 'Ads.com - UTC - 21',
    value: '3218250684'
  },
  {
    id: 'CID_7035336235',
    name: 'Ads.com - UTC - 22',
    value: '7035336235'
  },
  {
    id: 'CID_5343981146',
    name: 'Ads.com - UTC - 23',
    value: '5343981146'
  },
  {
    id: 'CID_1908857409',
    name: 'Ads.com - UTC - 24',
    value: '1908857409'
  },
  {
    id: 'CID_3848887282',
    name: 'Ads.com - UTC - 25',
    value: '3848887282'
  },
  {
    id: 'CID_4213092623',
    name: 'Ads.com - UTC - 26',
    value: '4213092623'
  },
  {
    id: 'CID_8807720960',
    name: 'Ads.com - RSOC - UTC - Yahoo',
    value: '8807720960'
  },
  {
    id: 'CID_4277350349',
    name: 'RSOC - UTC - Ads.com',
    value: '4277350349'
  }
];

// Helper to sort accounts
const sortAccounts = (accounts: typeof CUSTOMER_ACCOUNTS) => {
  return accounts.slice().sort((a, b) => {
    // Move IST account to the very end
    if (a.id === 'CID_8677814915') return 1;
    if (b.id === 'CID_8677814915') return -1;

    // Extract UTC number if present
    const getUtcNum = (name: string): number | null => {
      const match = name.match(/UTC\s*-\s*(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    };

    const numA = getUtcNum(a.name);
    const numB = getUtcNum(b.name);

    // If both have numbers, compare numerically
    if (numA !== null && numB !== null) {
      return numA - numB;
    }

    // Keep original order if numbers not found
    return 0;
  });
};

// Pre-sorted list for rendering
const DISPLAY_ACCOUNTS = sortAccounts(CUSTOMER_ACCOUNTS);

interface DashboardLayoutProps {
  children: ReactNode;
  onAccountChange?: (accountId: string | null) => void;
  selectedAccountId?: string | null;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ 
  children, 
  onAccountChange,
  selectedAccountId = 'all'
}) => {
  const [collapsed, setCollapsed] = React.useState(false);
  const [accountSelectOpen, setAccountSelectOpen] = useState(false);
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userAccountId, setUserAccountId] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();
  
  // Get current active menu key based on pathname
  const getActiveMenuKey = () => {
    if (typeof window === 'undefined') return '1';
    const pathname = window.location.pathname;
    if (pathname === '/inuvo-dashboard') return '2';
    if (pathname === '/analytics') return '3';
    return '1'; // Default to dashboard
  };
  
  // Helper function to get cookie value
  const getCookie = (name: string): string | null => {
    if (typeof document === 'undefined') return null;
    
    const cookieValue = document.cookie
      .split('; ')
      .find(row => row.startsWith(name + '='));
      
    return cookieValue ? cookieValue.split('=')[1] : null;
  };
  
  // Check if user is admin on component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Get auth type from cookie
      const authType = getCookie('auth_type');
      const accountId = getCookie('account_id');
      
      setIsAdmin(authType === 'admin');
      setUserAccountId(accountId);
      
      // If not admin and we have an account ID, select it by default
      if (authType !== 'admin' && accountId && onAccountChange) {
        // Get the numeric customer ID
        const account = CUSTOMER_ACCOUNTS.find(acc => acc.id === accountId);
        if (account) {
          onAccountChange(account.value);
        }
      }
    }
  }, [onAccountChange]);

  const handleAccountClick = (accountId: string) => {
    console.log('Account selected in DashboardLayout:', accountId);
    
    // Find the selected account
    const account = CUSTOMER_ACCOUNTS.find(acc => acc.id === accountId);
    
    if (onAccountChange) {
      const customerId = account?.value || null;
      console.log('Calling onAccountChange with customerId:', customerId);
      onAccountChange(customerId);
    }
  };

  // Log the current selected account ID for debugging
  useEffect(() => {
    console.log('DashboardLayout selectedAccountId:', selectedAccountId);
  }, [selectedAccountId]);

  // Handle logout
  const handleLogout = () => {
    router.push('/logout');
  };

  // Get account name from ID
  const getAccountName = (accountId: string | null) => {
    if (!accountId || accountId === 'all') return 'All Accounts';
    const account = CUSTOMER_ACCOUNTS.find(acc => acc.id === accountId);
    return account ? account.name : accountId;
  };

  return (
    <App>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider 
          collapsible 
          collapsed={collapsed} 
          onCollapse={(value) => setCollapsed(value)}
          theme={theme === 'dark' ? 'dark' : 'light'}
          width={280}
        >
          <div style={{ 
            height: 64, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '0 16px'
          }}>
            <Title level={4} style={{ 
              margin: 0, 
              background: 'var(--primary-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              {collapsed ? 'ASX' : 'AdSyntheX'}
            </Title>
          </div>
          
          {!collapsed && (
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <UserOutlined style={{ marginRight: 6 }} />
                <Text type="secondary">
                  {isAdmin ? 'Admin Access' : 'User Account'}
                  {isAdmin && <LockOutlined style={{ marginLeft: 6, color: '#52c41a' }} />}
                </Text>
              </div>
              
              {/* Show selector for admins, static text for users */}
              {isAdmin ? (
                <Select
                  style={{ width: '100%' }}
                  placeholder="Select Account"
                  value={selectedAccountId}
                  open={accountSelectOpen}
                  onDropdownVisibleChange={setAccountSelectOpen}
                  onSelect={handleAccountClick}
                  optionLabelProp="label"
                  popupMatchSelectWidth={false}
                  dropdownStyle={{ width: 280 }}
                >
                  {DISPLAY_ACCOUNTS.map(account => (
                    <Option key={account.id} value={account.id} label={account.id === 'all' ? 'All Accounts' : account.name}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <TeamOutlined style={{ marginRight: 8, fontSize: 16, color: '#1890ff' }} />
                        <div>
                          <div style={{ fontWeight: 'bold' }}>{account.name}</div>
                          {account.id !== 'all' && (
                            <div style={{ fontSize: 12, opacity: 0.8 }}>{account.id}</div>
                          )}
                        </div>
                      </div>
                    </Option>
                  ))}
                </Select>
              ) : (
                <div style={{ 
                  padding: '8px 12px',
                  border: '1px solid #f0f0f0',
                  borderRadius: '8px',
                  background: '#fafafa'
                }}>
                  <div style={{ fontWeight: 'bold' }}>{getAccountName(userAccountId)}</div>
                  {userAccountId && userAccountId !== 'all' && (
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{userAccountId}</div>
                  )}
                </div>
              )}
            </div>
          )}
          
          <Divider style={{ margin: '12px 0' }} />
          
          <Menu
            theme="light"
            selectedKeys={[getActiveMenuKey()]}
            mode="inline"
            items={[
              {
                key: '1',
                icon: <DashboardOutlined />,
                label: <Link href="/dashboard">Dashboard</Link>,
              },
              {
                key: '2',
                icon: <DollarOutlined />,
                label: <Link href="/inuvo-dashboard">Cost vs Revenue</Link>,
              },
              {
                key: '3',
                icon: <ApiOutlined />,
                label: <Link href="/analytics">Analytics</Link>,
              },
              // {
              //   key: '4',
              //   icon: <RocketOutlined />,
              //   label: <Link href="/google-ads-launcher">🚀 Google Ads Launcher</Link>,
              // }
            ]}
          />
        </Sider>
        <Layout>
          <Header style={{ 
            padding: '0 16px', 
            background: theme === 'dark' ? '#1f2937' : '#fff', 
            display: 'flex', 
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
            position: 'sticky',
            top: 0,
            zIndex: 1000
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
                className: 'trigger',
                onClick: () => setCollapsed(!collapsed),
                style: { fontSize: '18px', marginRight: '24px' }
              })}
              <Title level={4} style={{ margin: 0 }}>
                Revenue & Cost Dashboard
              </Title>
            </div>
            
            <Space>
              <Tooltip title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
                <Button
                  type="text"
                  icon={theme === 'dark' ? <BulbFilled /> : <BulbOutlined />}
                  onClick={toggleTheme}
                  style={{ fontSize: '16px' }}
                />
              </Tooltip>
              <Tooltip title="Logout">
                <Button 
                  type="primary" 
                  icon={<LogoutOutlined />} 
                  onClick={handleLogout}
                  shape="round"
                  className="logout-button"
                >
                  Logout
                </Button>
              </Tooltip>
            </Space>
          </Header>
          <Content style={{ margin: '24px', overflow: 'initial' }}>
            {children}
          </Content>
        </Layout>
      </Layout>
    </App>
  );
};

export default DashboardLayout; 