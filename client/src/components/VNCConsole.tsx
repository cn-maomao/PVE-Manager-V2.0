import React, { useState, useEffect, useRef } from 'react';
import { Modal, Spin, Button, Space, message, Alert, Typography } from 'antd';
import { 
  ExpandOutlined, CompressOutlined, ReloadOutlined, 
  DesktopOutlined, CloseOutlined 
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

const { Text } = Typography;

interface VNCConsoleProps {
  visible: boolean;
  onClose: () => void;
  connectionId: string;
  node: string;
  vmid: number;
  vmname: string;
  vmtype: 'qemu' | 'lxc';
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function VNCConsole({ visible, onClose, connectionId, node, vmid, vmname, vmtype }: VNCConsoleProps) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vncUrl, setVncUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startTime = useRef<Date | null>(null);

  useEffect(() => {
    if (visible) {
      connectVNC();
      startTime.current = new Date();
    } else {
      disconnectVNC();
    }
    
    return () => {
      disconnectVNC();
    };
  }, [visible, connectionId, vmid]);

  const connectVNC = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/pve/connections/${connectionId}/vms/${vmid}/vnc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ node, type: vmtype }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setVncUrl(data.wsUrl);
        setSessionId(data.sessionId);
        
        // 使用 PVE 内置的 noVNC
        // 构建 noVNC URL - 直接访问 PVE 的 noVNC 页面
        const pveNoVncUrl = `https://${new URL(data.wsUrl).host}/?console=${vmtype}&vmid=${vmid}&vmname=${encodeURIComponent(vmname)}&node=${node}&resize=scale&novnc=1`;
        setVncUrl(pveNoVncUrl);
        
        setLoading(false);
      } else {
        throw new Error(data.error || 'Failed to get VNC connection');
      }
    } catch (err: any) {
      console.error('VNC connection error:', err);
      setError(err.message || '连接VNC失败');
      setLoading(false);
    }
  };

  const disconnectVNC = async () => {
    if (sessionId && startTime.current) {
      const duration = Math.floor((Date.now() - startTime.current.getTime()) / 1000);
      
      try {
        await fetch(`${API_BASE_URL}/api/vnc/sessions/${sessionId}/close`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ duration }),
        });
      } catch (err) {
        console.error('Failed to close VNC session:', err);
      }
    }
    
    setVncUrl(null);
    setSessionId(null);
    setLoading(true);
    startTime.current = null;
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleReload = () => {
    disconnectVNC();
    setTimeout(connectVNC, 500);
  };

  const handleClose = () => {
    disconnectVNC();
    onClose();
  };

  return (
    <Modal
      title={
        <Space>
          <DesktopOutlined />
          <span>控制台 - {vmname} (VM {vmid})</span>
        </Space>
      }
      open={visible}
      onCancel={handleClose}
      width={1024}
      style={{ top: 20 }}
      styles={{ body: { padding: 0, height: '70vh' } }}
      footer={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleReload}>
            重新连接
          </Button>
          <Button icon={isFullscreen ? <CompressOutlined /> : <ExpandOutlined />} onClick={handleFullscreen}>
            {isFullscreen ? '退出全屏' : '全屏'}
          </Button>
          <Button type="primary" icon={<CloseOutlined />} onClick={handleClose}>
            关闭
          </Button>
        </Space>
      }
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#000' }}>
        {loading && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100%',
            flexDirection: 'column',
            gap: 16
          }}>
            <Spin size="large" />
            <Text style={{ color: '#fff' }}>正在连接控制台...</Text>
          </div>
        )}
        
        {error && (
          <div style={{ padding: 24 }}>
            <Alert
              type="error"
              message="连接失败"
              description={
                <div>
                  <p>{error}</p>
                  <p style={{ marginTop: 8 }}>
                    <strong>提示:</strong> 请确保:
                  </p>
                  <ul>
                    <li>虚拟机正在运行</li>
                    <li>PVE服务器可访问</li>
                    <li>浏览器允许访问HTTPS站点</li>
                  </ul>
                  <Button type="primary" onClick={handleReload} style={{ marginTop: 16 }}>
                    重试连接
                  </Button>
                </div>
              }
            />
          </div>
        )}
        
        {!loading && !error && vncUrl && (
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <Alert
              type="info"
              message="VNC 控制台"
              description={
                <div>
                  <p>由于浏览器安全限制，无法直接嵌入 PVE 的 noVNC 页面。</p>
                  <p>请点击下方按钮在新窗口中打开控制台:</p>
                  <Button 
                    type="primary" 
                    icon={<DesktopOutlined />}
                    onClick={() => window.open(vncUrl, '_blank', 'width=1024,height=768')}
                    style={{ marginTop: 8 }}
                  >
                    打开 VNC 控制台
                  </Button>
                  <p style={{ marginTop: 16, fontSize: 12, color: '#666' }}>
                    提示: 如果需要使用 SPICE 协议（性能更好），请在 PVE 中配置虚拟机显示为 SPICE。
                  </p>
                </div>
              }
              style={{ margin: 24 }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

export default VNCConsole;
