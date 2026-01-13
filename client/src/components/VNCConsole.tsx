import React, { useState, useEffect, useRef } from 'react';
import { Modal, Spin, Button, Space, message, Alert, Typography, Input } from 'antd';
import { 
  ExpandOutlined, CompressOutlined, ReloadOutlined, 
  DesktopOutlined, CloseOutlined, CopyOutlined, ExportOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

const { Text, Paragraph } = Typography;

interface VNCConsoleProps {
  visible: boolean;
  onClose: () => void;
  connectionId: string;
  node: string;
  vmid: number;
  vmname: string;
  vmtype: 'qemu' | 'lxc';
}

interface VNCInfo {
  pveHost: string;
  pvePort: number;
  ticket: string;
  port: number;
  sessionId: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function VNCConsole({ visible, onClose, connectionId, node, vmid, vmname, vmtype }: VNCConsoleProps) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vncInfo, setVncInfo] = useState<VNCInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
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
        setVncInfo({
          pveHost: data.pveHost,
          pvePort: data.pvePort,
          ticket: data.ticket,
          port: data.port,
          sessionId: data.sessionId
        });
        setSessionId(data.sessionId);
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

  const handleReload = () => {
    disconnectVNC();
    setTimeout(connectVNC, 500);
  };

  const handleClose = () => {
    disconnectVNC();
    onClose();
  };

  // 构建 PVE noVNC URL
  const buildNoVncUrl = () => {
    if (!vncInfo) return null;
    // PVE 内置 noVNC 控制台 URL 格式
    return `https://${vncInfo.pveHost}:${vncInfo.pvePort}/?console=${vmtype}&novnc=1&vmid=${vmid}&vmname=${encodeURIComponent(vmname)}&node=${node}&resize=scale&cmd=`;
  };

  // 在新窗口打开 VNC
  const openInNewWindow = () => {
    const url = buildNoVncUrl();
    if (url) {
      const windowFeatures = 'width=1024,height=768,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no';
      window.open(url, `vnc_${vmid}_${Date.now()}`, windowFeatures);
      message.success(`已在新窗口打开 ${vmname} 的控制台`);
    }
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
      width={600}
      style={{ top: 100 }}
      footer={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleReload}>
            重新获取
          </Button>
          <Button type="primary" icon={<CloseOutlined />} onClick={handleClose}>
            关闭
          </Button>
        </Space>
      }
    >
      <div ref={containerRef}>
        {loading && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: 200,
            flexDirection: 'column',
            gap: 16
          }}>
            <Spin size="large" />
            <Text>正在获取控制台信息...</Text>
          </div>
        )}
        
        {error && (
          <Alert
            type="error"
            message="获取控制台信息失败"
            description={
              <div>
                <p>{error}</p>
                <p style={{ marginTop: 8 }}><strong>请确保:</strong></p>
                <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                  <li>虚拟机正在运行</li>
                  <li>PVE服务器可访问</li>
                </ul>
                <Button type="primary" onClick={handleReload} size="small">
                  重试
                </Button>
              </div>
            }
            style={{ marginBottom: 16 }}
          />
        )}
        
        {!loading && !error && vncInfo && (
          <div>
            <Alert
              type="success"
              message="控制台已就绪"
              description={`已获取 ${vmname} (VM ${vmid}) 的控制台连接信息`}
              style={{ marginBottom: 16 }}
            />
            
            <div style={{ marginBottom: 16 }}>
              <Text strong>控制台地址:</Text>
              <Input.TextArea
                value={buildNoVncUrl() || ''}
                rows={2}
                readOnly
                style={{ marginTop: 8, fontSize: 12 }}
              />
            </div>
            
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button 
                type="primary" 
                icon={<ExportOutlined />}
                onClick={openInNewWindow}
                block
                size="large"
              >
                在新窗口打开 VNC 控制台
              </Button>
              
              <Button 
                icon={<CopyOutlined />}
                onClick={() => {
                  const url = buildNoVncUrl();
                  if (url) {
                    navigator.clipboard.writeText(url);
                    message.success('已复制控制台URL');
                  }
                }}
                block
              >
                复制控制台URL
              </Button>
            </Space>
            
            <Alert
              type="info"
              message="使用提示"
              description={
                <ul style={{ margin: '8px 0', paddingLeft: 20, fontSize: 12 }}>
                  <li>点击按钮将在新窗口中打开 PVE 内置的 noVNC 控制台</li>
                  <li>如需登录 PVE，请使用您的 PVE 账号密码</li>
                  <li>支持同时打开多个虚拟机的控制台窗口</li>
                </ul>
              }
              style={{ marginTop: 16 }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

export default VNCConsole;
