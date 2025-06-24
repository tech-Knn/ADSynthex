import React, { ReactNode, useState, useEffect } from 'react';
import { Layout, Menu, Typography, Select, Divider, Space } from 'antd';
import {
  DashboardOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  TeamOutlined
} from '@ant-design/icons';
import Link from 'next/link';

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
    id: 'CID_3146253756',
    name: 'Ads.com - RSOC - UTC - 04',
    value: '3146253756'
  },
  {
    id: 'CID_5723554317',
    name: 'Ads.com - RSOC - UTC - 03',
    value: '5723554317'
  },
  {
    id: 'CID_9071440966',
    name: 'Ads.com - RSOC - UTC - 02',
    value: '9071440966'
  },
  {
    id: 'CID_8677814915',
    name: 'Ads.com - RSOC - IST',
    value: '8677814915'
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
    id: 'CID_4277350349',
    name: 'RSOC - UTC - Ads.com',
    value: '4277350349'
  }
];

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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        collapsible 
        collapsed={collapsed} 
        onCollapse={(value) => setCollapsed(value)}
        theme="light"
        width={280}
      >
        <div style={{ 
          height: 64, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '0 16px'
        }}>
          <Title level={4} style={{ margin: 0, color: '#1890ff' }}>
            {collapsed ? 'ASX' : 'AdSyntheX'}
          </Title>
        </div>
        
        {!collapsed && (
          <div style={{ padding: '12px 16px' }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: '8px' }}>
              <UserOutlined style={{ marginRight: 6 }} />Select Account
            </Text>
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
              {CUSTOMER_ACCOUNTS.map(account => (
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
          </div>
        )}
        
        <Divider style={{ margin: '12px 0' }} />
        
        <Menu
          theme="light"
          defaultSelectedKeys={['1']}
          mode="inline"
          items={[
            {
              key: '1',
              icon: <DashboardOutlined />,
              label: <Link href="/dashboard">Dashboard</Link>,
            }
          ]}
        />
      </Sider>
      <Layout>
        <Header style={{ 
          padding: '0 16px', 
          background: '#fff', 
          display: 'flex', 
          alignItems: 'center',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
        }}>
          {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
            className: 'trigger',
            onClick: () => setCollapsed(!collapsed),
            style: { fontSize: '18px', marginRight: '24px' }
          })}
          <Title level={4} style={{ margin: 0 }}>
            Ads.com Revenue & Google Ads Cost Dashboard
          </Title>
        </Header>
        <Content style={{ margin: '24px', overflow: 'initial' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default DashboardLayout; 