import React from 'react';
import { Layout, Typography, Space, Badge, Avatar, Dropdown, Button, Tag } from 'antd';
import type { MenuProps } from 'antd';
import { 
  CloudServerOutlined, 
  LinkOutlined, 
  PlayCircleOutlined, 
  DesktopOutlined,
  ThunderboltOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { usePVE } from '../../contexts/PVEContext';
import { useAuth, Roles } from '../../contexts/AuthContext';

const { Header: AntHeader } = Layout;
const { Title } = Typography;

function Header() {
  const { connections, vms, nodes } = usePVE();
  const { user, logout } = useAuth();
  
  const connectedCount = connections.filter(conn => conn.status === 'connected').length;
  const runningVMsCount = vms.filter(vm => vm.status === 'running').length;
  const onlineNodesCount = nodes.filter(node => node.status === 'online').length;

  const roleLabels: Record<string, string> = {
    admin: '管理员',
    operator: '操作员',
    user: '普通用户',
    viewer: '只读用户',
  };

  const roleColors: Record<string, string> = {
    admin: 'red',
    operator: 'blue',
    user: 'green',
    viewer: 'default',
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'user-info',
      label: (
        <div style={{ padding: '8px 0' }}>
          <div style={{ fontWeight: 500 }}>{user?.username}</div>
          <Tag color={roleColors[user?.role || 'user']} style={{ marginTop: 4 }}>
            {roleLabels[user?.role || 'user']}
          </Tag>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: logout,
    },
  ];

  return (
    <AntHeader style={{ 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      borderBottom: 'none',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      padding: '0 24px',
      height: '64px',
      lineHeight: '64px',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      width: '100%'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        width: '100%', 
        height: '100%'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Avatar 
            size="large" 
            style={{ 
              background: 'rgba(255,255,255,0.2)', 
              marginRight: '12px'
            }}
            icon={<ThunderboltOutlined />}
          />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Title level={3} style={{ 
              color: 'white', 
              margin: 0, 
              fontSize: '20px',
              lineHeight: '24px',
              marginBottom: '2px'
            }}>
              PVE Manager
            </Title>
            <div style={{ 
              color: 'rgba(255,255,255,0.8)', 
              fontSize: '12px',
              lineHeight: '14px'
            }}>
              Proxmox VE 管理平台
            </div>
          </div>
        </div>
        
        <Space size="large">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            background: 'rgba(255,255,255,0.1)', 
            padding: '8px 12px', 
            borderRadius: '8px' 
          }}>
            <LinkOutlined style={{ color: 'white', marginRight: '6px' }} />
            <Badge 
              count={connectedCount} 
              showZero
              style={{ backgroundColor: connectedCount > 0 ? '#52c41a' : '#ff4d4f' }}
            >
              <span style={{ color: 'white', fontSize: '14px' }}>连接</span>
            </Badge>
          </div>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            background: 'rgba(255,255,255,0.1)', 
            padding: '8px 12px', 
            borderRadius: '8px' 
          }}>
            <CloudServerOutlined style={{ color: 'white', marginRight: '6px' }} />
            <Badge 
              count={onlineNodesCount} 
              showZero
              style={{ backgroundColor: onlineNodesCount > 0 ? '#52c41a' : '#ff4d4f' }}
            >
              <span style={{ color: 'white', fontSize: '14px' }}>节点</span>
            </Badge>
          </div>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            background: 'rgba(255,255,255,0.1)', 
            padding: '8px 12px', 
            borderRadius: '8px' 
          }}>
            <PlayCircleOutlined style={{ color: 'white', marginRight: '6px' }} />
            <Badge 
              count={runningVMsCount} 
              showZero
              style={{ backgroundColor: '#52c41a' }}
            >
              <span style={{ color: 'white', fontSize: '14px' }}>运行中</span>
            </Badge>
          </div>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            background: 'rgba(255,255,255,0.1)', 
            padding: '8px 12px', 
            borderRadius: '8px' 
          }}>
            <DesktopOutlined style={{ color: 'white', marginRight: '6px' }} />
            <Badge 
              count={vms.length} 
              showZero
              style={{ backgroundColor: '#1890ff' }}
            >
              <span style={{ color: 'white', fontSize: '14px' }}>总VM</span>
            </Badge>
          </div>

          {user && (
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                background: 'rgba(255,255,255,0.15)', 
                padding: '6px 12px', 
                borderRadius: '20px',
                cursor: 'pointer'
              }}>
                <Avatar 
                  size="small" 
                  icon={<UserOutlined />} 
                  style={{ marginRight: 8, backgroundColor: '#1890ff' }}
                />
                <span style={{ color: 'white', fontSize: '14px' }}>{user.username}</span>
              </div>
            </Dropdown>
          )}
        </Space>
      </div>
    </AntHeader>
  );
}

export default Header;