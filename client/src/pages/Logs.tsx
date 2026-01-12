import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Space, Tag, Select, DatePicker, Input, Button, Row, Col, Statistic, message, Tooltip
} from 'antd';
import {
  ReloadOutlined, DownloadOutlined, SearchOutlined, UserOutlined,
  LoginOutlined, DesktopOutlined, DatabaseOutlined, SettingOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';

const { Option } = Select;
const { RangePicker } = DatePicker;

interface LogItem {
  id: number;
  user_id: string;
  username: string;
  action: string;
  target: string;
  details: any;
  ip: string;
  user_agent: string;
  created_at: string;
}

interface LogStats {
  actionStats: { action: string; count: number }[];
  userStats: { username: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
  loginFailures: { ip: string; count: number }[];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// 操作类型标签配置
const actionConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  login: { color: 'green', icon: <LoginOutlined />, label: '登录' },
  logout: { color: 'blue', icon: <LoginOutlined />, label: '登出' },
  login_failed: { color: 'red', icon: <LoginOutlined />, label: '登录失败' },
  create_user: { color: 'purple', icon: <UserOutlined />, label: '创建用户' },
  update_user: { color: 'orange', icon: <UserOutlined />, label: '更新用户' },
  delete_user: { color: 'red', icon: <UserOutlined />, label: '删除用户' },
  change_password: { color: 'gold', icon: <SettingOutlined />, label: '修改密码' },
  vm_start: { color: 'green', icon: <DesktopOutlined />, label: '启动VM' },
  vm_stop: { color: 'red', icon: <DesktopOutlined />, label: '停止VM' },
  vm_shutdown: { color: 'orange', icon: <DesktopOutlined />, label: '关闭VM' },
  batch_vm_action: { color: 'blue', icon: <DesktopOutlined />, label: '批量VM操作' },
  create_backup: { color: 'cyan', icon: <DatabaseOutlined />, label: '创建备份' },
  restore_backup: { color: 'geekblue', icon: <DatabaseOutlined />, label: '恢复备份' },
  delete_backup: { color: 'red', icon: <DatabaseOutlined />, label: '删除备份' },
  vnc_connect: { color: 'purple', icon: <DesktopOutlined />, label: 'VNC连接' },
  vnc_disconnect: { color: 'default', icon: <DesktopOutlined />, label: 'VNC断开' },
  create_group: { color: 'green', icon: <SettingOutlined />, label: '创建分组' },
  update_group: { color: 'orange', icon: <SettingOutlined />, label: '更新分组' },
  delete_group: { color: 'red', icon: <SettingOutlined />, label: '删除分组' },
};

function Logs() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [actions, setActions] = useState<string[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  
  // 筛选条件
  const [filters, setFilters] = useState({
    username: '',
    action: '',
    target: '',
    dateRange: null as [dayjs.Dayjs, dayjs.Dayjs] | null,
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', pageSize.toString());
      params.append('offset', ((page - 1) * pageSize).toString());
      
      if (filters.username) params.append('username', filters.username);
      if (filters.action) params.append('action', filters.action);
      if (filters.target) params.append('target', filters.target);
      if (filters.dateRange) {
        params.append('start_date', filters.dateRange[0].format('YYYY-MM-DD'));
        params.append('end_date', filters.dateRange[1].format('YYYY-MM-DD'));
      }

      const response = await fetch(`${API_BASE_URL}/api/logs?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      
      if (response.ok) {
        setLogs(data.logs);
        setTotal(data.total);
      }
    } catch (error) {
      message.error('获取日志失败');
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, filters]);

  const fetchActions = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/logs/actions`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setActions(data);
      }
    } catch (error) {
      console.error('获取操作类型失败:', error);
    }
  }, [token]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/logs/stats?days=7`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setStats(data);
      }
    } catch (error) {
      console.error('获取统计失败:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchActions();
    fetchStats();
  }, [fetchActions, fetchStats]);

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const params = new URLSearchParams();
      params.append('format', format);
      if (filters.dateRange) {
        params.append('start_date', filters.dateRange[0].format('YYYY-MM-DD'));
        params.append('end_date', filters.dateRange[1].format('YYYY-MM-DD'));
      }

      const response = await fetch(`${API_BASE_URL}/api/logs/export?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs-${dayjs().format('YYYY-MM-DD')}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      message.success('导出成功');
    } catch (error) {
      message.error('导出失败');
    }
  };

  const columns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      width: 120,
      render: (username: string) => username || '-',
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 140,
      render: (action: string) => {
        const config = actionConfig[action] || { color: 'default', icon: null, label: action };
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: '目标',
      dataIndex: 'target',
      key: 'target',
      width: 150,
      ellipsis: true,
      render: (target: string) => target || '-',
    },
    {
      title: '详情',
      dataIndex: 'details',
      key: 'details',
      ellipsis: true,
      render: (details: any) => (
        <Tooltip title={<pre style={{ margin: 0, maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(details, null, 2)}</pre>}>
          <span style={{ cursor: 'pointer' }}>
            {details ? JSON.stringify(details).slice(0, 50) + '...' : '-'}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      width: 130,
      render: (ip: string) => ip || '-',
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {/* 统计卡片 */}
      <Row gutter={16}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="今日操作" value={stats?.dailyTrend?.slice(-1)[0]?.count || 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic 
              title="7天总操作" 
              value={stats?.dailyTrend?.reduce((sum, d) => sum + d.count, 0) || 0} 
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic 
              title="活跃用户" 
              value={stats?.userStats?.length || 0} 
              suffix="人"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic 
              title="登录失败" 
              value={stats?.loginFailures?.reduce((sum, f) => sum + f.count, 0) || 0}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 日志列表 */}
      <Card
        title="操作日志"
        extra={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('csv')}>
              导出CSV
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('json')}>
              导出JSON
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchLogs}>
              刷新
            </Button>
          </Space>
        }
      >
        {/* 筛选器 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={5}>
            <Input
              placeholder="用户名"
              prefix={<SearchOutlined />}
              value={filters.username}
              onChange={(e) => setFilters({ ...filters, username: e.target.value })}
              allowClear
            />
          </Col>
          <Col span={5}>
            <Select
              style={{ width: '100%' }}
              placeholder="操作类型"
              value={filters.action || undefined}
              onChange={(value) => setFilters({ ...filters, action: value })}
              allowClear
            >
              {actions.map(action => (
                <Option key={action} value={action}>
                  {actionConfig[action]?.label || action}
                </Option>
              ))}
            </Select>
          </Col>
          <Col span={5}>
            <Input
              placeholder="目标"
              value={filters.target}
              onChange={(e) => setFilters({ ...filters, target: e.target.value })}
              allowClear
            />
          </Col>
          <Col span={6}>
            <RangePicker
              style={{ width: '100%' }}
              value={filters.dateRange}
              onChange={(dates) => setFilters({ ...filters, dateRange: dates as [dayjs.Dayjs, dayjs.Dayjs] | null })}
            />
          </Col>
          <Col span={3}>
            <Button type="primary" icon={<SearchOutlined />} onClick={fetchLogs} block>
              搜索
            </Button>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
          size="small"
        />
      </Card>
    </Space>
  );
}

export default Logs;
