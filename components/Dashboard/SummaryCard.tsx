import React from 'react';
import { Card } from 'antd';
import { 
  DollarOutlined, 
  EyeOutlined, 
  PercentageOutlined, 
  RiseOutlined,
  FundOutlined,
  WarningOutlined
} from '@ant-design/icons';

interface SummaryCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, icon, color }) => {
  // Determine which icon to display
  const renderIcon = () => {
    switch (icon) {
      case 'dollar':
        return <DollarOutlined />;
      case 'eye':
        return <EyeOutlined />;
      case 'percentage':
        return <PercentageOutlined />;
      case 'rise':
        return <RiseOutlined />;
      case 'fund':
        return <FundOutlined />;
      case 'warning':
        return <WarningOutlined />;
      case 'click':
        return (
          <svg viewBox="0 0 1024 1024" width="1em" height="1em" fill="currentColor">
            <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z" />
            <path d="M623.6 316.7C593.6 290.4 554 276 512 276s-81.6 14.5-111.6 40.7C369.2 344 352 380.7 352 420v7.6c0 4.4 3.6 8 8 8h48c4.4 0 8-3.6 8-8V420c0-44.1 43.1-80 96-80s96 35.9 96 80c0 31.1-22 59.6-56.1 72.7-21.2 8.1-39.2 22.3-52.1 40.9-13.1 19-19.9 41.8-19.9 64.9V620c0 4.4 3.6 8 8 8h48c4.4 0 8-3.6 8-8v-22.7a48.3 48.3 0 0130.9-44.8c59-22.7 97.1-74.7 97.1-132.5.1-39.3-17.1-76-48.3-103.3zM472 732a40 40 0 1080 0 40 40 0 10-80 0z" />
          </svg>
        );
      default:
        return <DollarOutlined />;
    }
  };

  return (
    <Card 
      style={{ 
        borderRadius: '8px',
        overflow: 'hidden',
        height: '100%',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        border: '1px solid rgba(0,0,0,0.05)'
      }}
      bodyStyle={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}
    >
      <div style={{ marginBottom: '8px', color: '#8c8c8c', fontSize: '14px' }}>
        {title}
      </div>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ 
          fontSize: '24px', 
          fontWeight: 600,
          color: color
        }}>
          {value}
        </div>
        <div style={{ 
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          backgroundColor: `${color}20`,
          color: color,
          fontSize: '18px'
        }}>
          {renderIcon()}
        </div>
      </div>
    </Card>
  );
};

export default SummaryCard; 