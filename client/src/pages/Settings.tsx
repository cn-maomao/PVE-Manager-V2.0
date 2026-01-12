import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Button,
  Switch,
  Select,
  Tabs,
  Space,
  message,
  Divider,
  Typography,
  Alert,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Popconfirm,
} from 'antd';
import {
  SettingOutlined,
  BellOutlined,
  SafetyCertificateOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

const { TabPane } = Tabs;
const { Option } = Select;
const { Title, Text, Paragraph } = Typography;

interface SystemStats {
  total_logs: number;
  total_users: number;
  total_tasks: number;
  total_backups: number;
  total_recordings: number;
  db_size: string;
}

interface AlertRule {
  id: string;
  name: string;
  type: string;
  threshold: number;
  enabled: boolean;
  level: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function Settings() {
  const { token, hasRole, Roles } = useAuth();
  const [generalForm] = Form.useForm();
  const [alertForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);

  useEffect(() => {
    fetchSystemStats();
    fetchAlertRules();
    loadSettings();
  }, []);

  const fetchSystemStats = async () => {
    try {
      // 这里可以从后端获取系统统计信息
      // 目前使用模拟数据
      setStats({
        total_logs: 1250,
        total_users: 5,
        total_tasks: 12,
        total_backups: 48,
        total_recordings: 156,
        db_size: '45.6 MB',
      });
    } catch (error) {
      console.error('获取系统统计失败:', error);
    }
  };

  const fetchAlertRules = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/alerts/rules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setAlertRules(data.rules || []);
      }
    } catch (error) {
      console.error('获取告警规则失败:', error);
      // 使用默认规则
      setAlertRules([
        { id: '1', name: 'CPU使用率告警', type: 'cpu', threshold: 90, enabled: true, level: 'warning' },
        { id: '2', name: '内存使用率告警', type: 'memory', threshold: 85, enabled: true, level: 'warning' },
        { id: '3', name: '磁盘使用率告警', type: 'disk', threshold: 90, enabled: true, level: 'critical' },
        { id: '4', name: '网络流量告警', type: 'network', threshold: 100, enabled: false, level: 'info' },
      ]);
    }
  };

  const loadSettings = () => {
    // 从 localStorage 加载设置
    const savedSettings = localStorage.getItem('pve_manager_settings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        generalForm.setFieldsValue(settings.general || {});
      } catch (e) {
        console.error('加载设置失败:', e);
      }
    } else {
      // 默认设置
      generalForm.setFieldsValue({
        auto_refresh: true,
        refresh_interval: 30,
        timezone: 'Asia/Shanghai',
        language: 'zh-CN',
        theme: 'light',
        recording_retention_days: 7,
        log_retention_days: 30,
        backup_retention_days: 30,
      });
    }
  };

  const handleSaveGeneral = async (values: any) => {
    setLoading(true);
    try {
      // 保存到 localStorage
      const currentSettings = JSON.parse(localStorage.getItem('pve_manager_settings') || '{}');
      currentSettings.general = values;
      localStorage.setItem('pve_manager_settings', JSON.stringify(currentSettings));
      
      message.success('设置已保存');
    } catch (error) {
      message.error('保存设置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAlertRule = async (rule: AlertRule) => {
    try {
      // 更新告警规则
      setAlertRules(prev => 
        prev.map(r => r.id === rule.id ? rule : r)
      );
      message.success('告警规则已更新');
    } catch (error) {
      message.error('更新失败');
    }
  };

  const handleCleanupLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/logs/cleanup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ days: 30 }),
      });
      const data = await response.json();
      if (data.success) {
        message.success(`已清理 ${data.deleted || 0} 条日志`);
        fetchSystemStats();
      }
    } catch (error) {
      message.error('清理日志失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCleanupRecordings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/vnc/recordings/cleanup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ days: 7 }),
      });
      const data = await response.json();
      if (data.success) {
        message.success(`已清理 ${data.deleted || 0} 条录屏记录`);
        fetchSystemStats();
      }
    } catch (error) {
      message.error('清理录屏失败');
    } finally {
      setLoading(false);
    }
  };

  const alertColumns = [
    {
      title: '规则名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const types: Record<string, string> = {
          cpu: 'CPU',
          memory: '内存',
          disk: '磁盘',
          network: '网络',
        };
        return types[type] || type;
      },
    },
    {
      title: '阈值',
      dataIndex: 'threshold',
      key: 'threshold',
      render: (value: number, record: AlertRule) => {
        if (record.type === 'network') {
          return `${value} MB/s`;
        }
        return `${value}%`;
      },
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      render: (level: string) => {
        const colors: Record<string, string> = {
          info: 'blue',
          warning: 'orange',
          critical: 'red',
        };
        return <Tag color={colors[level] || 'default'}>{level}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean, record: AlertRule) => (
        <Switch
          checked={enabled}
          onChange={(checked) => handleSaveAlertRule({ ...record, enabled: checked })}
          size="small"
        />
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <SettingOutlined />
          <span>系统设置</span>
        </Space>
      }
    >
      <Tabs defaultActiveKey="general">
        <TabPane
          tab={
            <span>
              <SettingOutlined />
              常规设置
            </span>
          }
          key="general"
        >
          <Form
            form={generalForm}
            layout="vertical"
            onFinish={handleSaveGeneral}
            style={{ maxWidth: 600 }}
          >
            <Title level={5}>显示设置</Title>
            
            <Form.Item
              name="auto_refresh"
              label="自动刷新"
              valuePropName="checked"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
            
            <Form.Item
              name="refresh_interval"
              label="刷新间隔（秒）"
            >
              <InputNumber min={5} max={300} style={{ width: 200 }} />
            </Form.Item>
            
            <Form.Item
              name="timezone"
              label="时区"
            >
              <Select style={{ width: 200 }}>
                <Option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</Option>
                <Option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</Option>
                <Option value="UTC">UTC</Option>
                <Option value="America/New_York">America/New_York (UTC-5)</Option>
              </Select>
            </Form.Item>
            
            <Form.Item
              name="language"
              label="语言"
            >
              <Select style={{ width: 200 }}>
                <Option value="zh-CN">简体中文</Option>
                <Option value="en-US">English</Option>
              </Select>
            </Form.Item>

            <Divider />
            
            <Title level={5}>数据保留设置</Title>
            
            <Form.Item
              name="recording_retention_days"
              label="VNC录屏保留天数"
            >
              <InputNumber min={1} max={90} style={{ width: 200 }} addonAfter="天" />
            </Form.Item>
            
            <Form.Item
              name="log_retention_days"
              label="操作日志保留天数"
            >
              <InputNumber min={7} max={365} style={{ width: 200 }} addonAfter="天" />
            </Form.Item>
            
            <Form.Item
              name="backup_retention_days"
              label="备份保留天数"
            >
              <InputNumber min={7} max={365} style={{ width: 200 }} addonAfter="天" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
                保存设置
              </Button>
            </Form.Item>
          </Form>
        </TabPane>

        <TabPane
          tab={
            <span>
              <BellOutlined />
              告警设置
            </span>
          }
          key="alerts"
        >
          <Alert
            message="告警规则配置"
            description="配置系统资源使用率告警阈值，当超过阈值时将触发告警通知。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <Table
            columns={alertColumns}
            dataSource={alertRules}
            rowKey="id"
            pagination={false}
            style={{ marginBottom: 24 }}
          />
          
          <Divider />
          
          <Title level={5}>通知设置</Title>
          <Form layout="vertical" style={{ maxWidth: 600 }}>
            <Form.Item label="邮件通知">
              <Switch checkedChildren="开启" unCheckedChildren="关闭" disabled />
              <Text type="secondary" style={{ marginLeft: 8 }}>（即将推出）</Text>
            </Form.Item>
            
            <Form.Item label="Webhook通知">
              <Switch checkedChildren="开启" unCheckedChildren="关闭" disabled />
              <Text type="secondary" style={{ marginLeft: 8 }}>（即将推出）</Text>
            </Form.Item>
          </Form>
        </TabPane>

        <TabPane
          tab={
            <span>
              <SafetyCertificateOutlined />
              安全设置
            </span>
          }
          key="security"
        >
          <Form layout="vertical" style={{ maxWidth: 600 }}>
            <Title level={5}>会话设置</Title>
            
            <Form.Item
              label="会话超时时间"
              initialValue={24}
            >
              <InputNumber min={1} max={168} style={{ width: 200 }} addonAfter="小时" />
            </Form.Item>
            
            <Form.Item
              label="最大同时登录设备数"
              initialValue={5}
            >
              <InputNumber min={1} max={10} style={{ width: 200 }} />
            </Form.Item>
            
            <Divider />
            
            <Title level={5}>密码策略</Title>
            
            <Form.Item
              label="最小密码长度"
              initialValue={6}
            >
              <InputNumber min={6} max={32} style={{ width: 200 }} />
            </Form.Item>
            
            <Form.Item
              label="密码有效期"
              initialValue={0}
            >
              <InputNumber min={0} max={365} style={{ width: 200 }} addonAfter="天 (0=永不过期)" />
            </Form.Item>
            
            <Form.Item>
              <Button type="primary" icon={<SaveOutlined />}>
                保存安全设置
              </Button>
            </Form.Item>
          </Form>
        </TabPane>

        <TabPane
          tab={
            <span>
              <DatabaseOutlined />
              数据维护
            </span>
          }
          key="maintenance"
        >
          {stats && (
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              <Col span={4}>
                <Card size="small">
                  <Statistic title="操作日志" value={stats.total_logs} suffix="条" />
                </Card>
              </Col>
              <Col span={4}>
                <Card size="small">
                  <Statistic title="用户数" value={stats.total_users} suffix="人" />
                </Card>
              </Col>
              <Col span={4}>
                <Card size="small">
                  <Statistic title="调度任务" value={stats.total_tasks} suffix="个" />
                </Card>
              </Col>
              <Col span={4}>
                <Card size="small">
                  <Statistic title="备份记录" value={stats.total_backups} suffix="个" />
                </Card>
              </Col>
              <Col span={4}>
                <Card size="small">
                  <Statistic title="VNC录屏" value={stats.total_recordings} suffix="个" />
                </Card>
              </Col>
              <Col span={4}>
                <Card size="small">
                  <Statistic title="数据库大小" value={stats.db_size} />
                </Card>
              </Col>
            </Row>
          )}
          
          <Alert
            message="数据清理"
            description="定期清理过期数据可以提高系统性能。清理操作不可恢复，请谨慎操作。"
            type="warning"
            showIcon
            style={{ marginBottom: 24 }}
          />
          
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Card size="small" title="清理操作日志">
              <Space>
                <Text>清理 30 天前的操作日志</Text>
                <Popconfirm
                  title="确定要清理30天前的日志吗？"
                  onConfirm={handleCleanupLogs}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button danger icon={<DeleteOutlined />} loading={loading}>
                    立即清理
                  </Button>
                </Popconfirm>
              </Space>
            </Card>
            
            <Card size="small" title="清理VNC录屏">
              <Space>
                <Text>清理 7 天前的VNC录屏文件</Text>
                <Popconfirm
                  title="确定要清理7天前的录屏吗？"
                  onConfirm={handleCleanupRecordings}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button danger icon={<DeleteOutlined />} loading={loading}>
                    立即清理
                  </Button>
                </Popconfirm>
              </Space>
            </Card>
            
            <Card size="small" title="数据库优化">
              <Space>
                <Text>优化数据库，清理碎片空间</Text>
                <Button icon={<ReloadOutlined />} disabled>
                  优化数据库（即将推出）
                </Button>
              </Space>
            </Card>
          </Space>
        </TabPane>

        <TabPane
          tab={
            <span>
              <ClockCircleOutlined />
              关于系统
            </span>
          }
          key="about"
        >
          <Card>
            <Title level={4}>PVE Manager V2.0</Title>
            <Paragraph>
              一个功能强大的 Proxmox VE 虚拟机管理系统，提供多节点管理、批量操作、流量监控等功能。
            </Paragraph>
            
            <Divider />
            
            <Row gutter={[16, 8]}>
              <Col span={8}>
                <Text strong>版本号：</Text>
                <Text>2.0.0</Text>
              </Col>
              <Col span={8}>
                <Text strong>构建时间：</Text>
                <Text>{new Date().toLocaleDateString()}</Text>
              </Col>
              <Col span={8}>
                <Text strong>Node.js：</Text>
                <Text>18.x</Text>
              </Col>
            </Row>
            
            <Divider />
            
            <Title level={5}>主要功能</Title>
            <ul>
              <li>多 PVE 节点管理</li>
              <li>虚拟机批量操作</li>
              <li>VM 分组管理</li>
              <li>实时流量监控</li>
              <li>定时任务调度</li>
              <li>备份管理</li>
              <li>VNC 远程控制</li>
              <li>操作日志审计</li>
              <li>多用户权限管理</li>
            </ul>
          </Card>
        </TabPane>
      </Tabs>
    </Card>
  );
}

export default Settings;
