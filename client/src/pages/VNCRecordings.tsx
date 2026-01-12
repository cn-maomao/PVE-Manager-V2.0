import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Space, Tag, Select, Button, Row, Col, Statistic, message,
  Modal, Popconfirm, Tooltip, Badge, Typography
} from 'antd';
import {
  ReloadOutlined, DeleteOutlined, PlayCircleOutlined, VideoCameraOutlined,
  ClockCircleOutlined, UserOutlined, DesktopOutlined, CloudServerOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { usePVE } from '../contexts/PVEContext';
import dayjs from 'dayjs';

const { Option } = Select;
const { Text } = Typography;

interface VNCRecording {
  id: string;
  user_id: string;
  username: string;
  connection_id: string;
  connection_name: string;
  node: string;
  vmid: number;
  vmname: string;
  filename: string;
  file_path: string;
  file_size: number;
  start_time: string;
  end_time: string;
  duration: number;
  status: string;
}

interface VNCSession {
  id: string;
  userId: string;
  username: string;
  connectionId: string;
  node: string;
  vmid: number;
  vmname: string;
  startTime: string;
  duration: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function VNCRecordings() {
  const { token } = useAuth();
  const { connections } = usePVE();
  const [recordings, setRecordings] = useState<VNCRecording[]>([]);
  const [sessions, setSessions] = useState<VNCSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  
  // 筛选条件
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<string>('');

  const fetchRecordings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedConnection) params.append('connection_id', selectedConnection);
      if (selectedUser) params.append('user_id', selectedUser);
      params.append('limit', pagination.pageSize.toString());
      params.append('offset', ((pagination.current - 1) * pagination.pageSize).toString());
      
      const response = await fetch(`${API_BASE_URL}/api/vnc/recordings?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      
      if (response.ok) {
        setRecordings(data.recordings || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      message.error('获取录屏列表失败');
    } finally {
      setLoading(false);
    }
  }, [token, selectedConnection, selectedUser, pagination]);

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/vnc/sessions`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      
      if (response.ok) {
        setSessions(data || []);
      }
    } catch (error) {
      console.error('获取活跃会话失败:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchRecordings();
    fetchSessions();
    
    // 定时刷新活跃会话
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, [fetchRecordings, fetchSessions]);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}小时 ${minutes}分钟`;
    } else if (minutes > 0) {
      return `${minutes}分钟 ${secs}秒`;
    } else {
      return `${secs}秒`;
    }
  };

  const handleDelete = async (recording: VNCRecording) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/vnc/recordings/${recording.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        message.success('录屏已删除');
        fetchRecordings();
      } else {
        const data = await response.json();
        message.error(data.error || '删除失败');
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const columns = [
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      width: 100,
      render: (username: string) => (
        <Space>
          <UserOutlined />
          <span>{username}</span>
        </Space>
      ),
    },
    {
      title: '虚拟机',
      key: 'vm',
      width: 150,
      render: (_: any, record: VNCRecording) => (
        <div>
          <div>{record.vmname}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>VM {record.vmid}</Text>
        </div>
      ),
    },
    {
      title: '节点',
      dataIndex: 'node',
      key: 'node',
      width: 100,
    },
    {
      title: '连接',
      dataIndex: 'connection_name',
      key: 'connection_name',
      width: 120,
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      key: 'start_time',
      width: 170,
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
      sorter: true,
    },
    {
      title: '时长',
      dataIndex: 'duration',
      key: 'duration',
      width: 100,
      render: (duration: number) => formatDuration(duration),
    },
    {
      title: '文件大小',
      dataIndex: 'file_size',
      key: 'file_size',
      width: 100,
      render: (size: number) => formatBytes(size),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const configs: Record<string, { color: string; text: string }> = {
          recording: { color: 'processing', text: '录制中' },
          completed: { color: 'success', text: '已完成' },
          failed: { color: 'error', text: '失败' },
        };
        const config = configs[status] || configs.completed;
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_: any, record: VNCRecording) => (
        <Space>
          <Popconfirm
            title="确定要删除此录屏记录吗？"
            onConfirm={() => handleDelete(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 统计
  const totalSize = recordings.reduce((sum, r) => sum + (r.file_size || 0), 0);
  const totalDuration = recordings.reduce((sum, r) => sum + (r.duration || 0), 0);
  const uniqueUsers = [...new Set(recordings.map(r => r.username))];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {/* 活跃会话 */}
      {sessions.length > 0 && (
        <Card 
          title={
            <Space>
              <Badge status="processing" />
              <span>活跃VNC会话 ({sessions.length})</span>
            </Space>
          }
          size="small"
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {sessions.map(session => (
              <Card 
                key={session.id}
                size="small" 
                style={{ width: 250 }}
                title={
                  <Space>
                    <DesktopOutlined />
                    <span>{session.vmname}</span>
                  </Space>
                }
              >
                <p><UserOutlined /> 用户: {session.username}</p>
                <p><CloudServerOutlined /> VM {session.vmid} @ {session.node}</p>
                <p><ClockCircleOutlined /> 已连接: {formatDuration(session.duration)}</p>
              </Card>
            ))}
          </div>
        </Card>
      )}

      {/* 统计卡片 */}
      <Row gutter={16}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="录屏总数" value={total} prefix={<VideoCameraOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="总时长" value={formatDuration(totalDuration)} prefix={<ClockCircleOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="总大小" value={formatBytes(totalSize)} prefix={<CloudServerOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="涉及用户" value={uniqueUsers.length} prefix={<UserOutlined />} />
          </Card>
        </Col>
      </Row>

      {/* 录屏列表 */}
      <Card
        title="VNC录屏记录"
        extra={
          <Space>
            <Select
              style={{ width: 180 }}
              placeholder="选择连接"
              value={selectedConnection || undefined}
              onChange={setSelectedConnection}
              allowClear
            >
              {connections.map(conn => (
                <Option key={conn.id} value={conn.id}>{conn.name}</Option>
              ))}
            </Select>
            <Button icon={<ReloadOutlined />} onClick={() => { fetchRecordings(); fetchSessions(); }}>
              刷新
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={recordings}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
          }}
          size="small"
        />
      </Card>
    </Space>
  );
}

export default VNCRecordings;
