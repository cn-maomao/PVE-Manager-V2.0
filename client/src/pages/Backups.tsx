import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Space, Tag, Select, Button, Row, Col, Statistic, message, 
  Modal, Form, Popconfirm, Progress, Tooltip, Input
} from 'antd';
import {
  ReloadOutlined, CloudUploadOutlined, CloudDownloadOutlined, DeleteOutlined,
  DatabaseOutlined, ClockCircleOutlined, HddOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { usePVE } from '../contexts/PVEContext';
import dayjs from 'dayjs';

const { Option } = Select;

interface BackupItem {
  volid: string;
  content: string;
  format: string;
  size: number;
  ctime: number;
  vmid: number;
  notes?: string;
  connectionId: string;
  connectionName: string;
  node: string;
  storage: string;
}

interface BackupStorage {
  storage: string;
  content: string;
  type: string;
  avail: number;
  total: number;
  used: number;
  node: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function Backups() {
  const { token } = useAuth();
  const { vms, connections } = usePVE();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [storages, setStorages] = useState<BackupStorage[]>([]);
  const [loading, setLoading] = useState(false);
  const [backupModalVisible, setBackupModalVisible] = useState(false);
  const [restoreModalVisible, setRestoreModalVisible] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupItem | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [form] = Form.useForm();
  const [restoreForm] = Form.useForm();
  
  // 筛选条件
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [selectedVmid, setSelectedVmid] = useState<number | null>(null);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedConnection) params.append('connection_id', selectedConnection);
      
      const response = await fetch(`${API_BASE_URL}/api/backups?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      
      if (response.ok) {
        let filteredBackups = data;
        if (selectedVmid) {
          filteredBackups = data.filter((b: BackupItem) => b.vmid === selectedVmid);
        }
        setBackups(filteredBackups);
      }
    } catch (error) {
      message.error('获取备份列表失败');
    } finally {
      setLoading(false);
    }
  }, [token, selectedConnection, selectedVmid]);

  const fetchStorages = useCallback(async () => {
    if (!selectedConnection) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/pve/connections/${selectedConnection}/backup-storages`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setStorages(data);
      }
    } catch (error) {
      console.error('获取存储列表失败:', error);
    }
  }, [token, selectedConnection]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  useEffect(() => {
    if (selectedConnection) {
      fetchStorages();
    }
  }, [selectedConnection, fetchStorages]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCreateBackup = async (values: any) => {
    setBackupLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/pve/connections/${values.connection_id}/vms/${values.vmid}/backup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          node: values.node,
          type: values.type,
          storage: values.storage,
          mode: values.mode,
          compress: values.compress,
          notes: values.notes,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        message.success('备份任务已启动');
        setBackupModalVisible(false);
        form.resetFields();
        setTimeout(fetchBackups, 3000);
      } else {
        message.error(data.error || '创建备份失败');
      }
    } catch (error) {
      message.error('创建备份失败');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestore = async (values: any) => {
    if (!selectedBackup) return;
    
    setBackupLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/pve/connections/${selectedBackup.connectionId}/backups/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          node: selectedBackup.node,
          volid: selectedBackup.volid,
          vmid: values.vmid || undefined,
          storage: values.storage,
          unique: values.unique,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        message.success('恢复任务已启动');
        setRestoreModalVisible(false);
        restoreForm.resetFields();
        setSelectedBackup(null);
      } else {
        message.error(data.error || '恢复备份失败');
      }
    } catch (error) {
      message.error('恢复备份失败');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleDelete = async (backup: BackupItem) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/pve/connections/${backup.connectionId}/backups/${encodeURIComponent(backup.volid)}?node=${backup.node}&storage=${backup.storage}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      if (response.ok) {
        message.success('备份已删除');
        fetchBackups();
      } else {
        const data = await response.json();
        message.error(data.error || '删除失败');
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const openRestoreModal = (backup: BackupItem) => {
    setSelectedBackup(backup);
    restoreForm.setFieldsValue({
      storage: 'local',
      unique: true,
    });
    setRestoreModalVisible(true);
  };

  const columns = [
    {
      title: 'VMID',
      dataIndex: 'vmid',
      key: 'vmid',
      width: 80,
      sorter: (a: BackupItem, b: BackupItem) => a.vmid - b.vmid,
    },
    {
      title: '文件名',
      dataIndex: 'volid',
      key: 'volid',
      ellipsis: true,
      render: (volid: string) => {
        const filename = volid.split('/').pop() || volid;
        return (
          <Tooltip title={volid}>
            <span>{filename}</span>
          </Tooltip>
        );
      },
    },
    {
      title: '格式',
      dataIndex: 'format',
      key: 'format',
      width: 80,
      render: (format: string) => <Tag>{format}</Tag>,
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: number) => formatBytes(size),
      sorter: (a: BackupItem, b: BackupItem) => a.size - b.size,
    },
    {
      title: '创建时间',
      dataIndex: 'ctime',
      key: 'ctime',
      width: 180,
      render: (ctime: number) => dayjs.unix(ctime).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a: BackupItem, b: BackupItem) => a.ctime - b.ctime,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: '存储',
      dataIndex: 'storage',
      key: 'storage',
      width: 100,
    },
    {
      title: '节点',
      dataIndex: 'node',
      key: 'node',
      width: 100,
    },
    {
      title: '连接',
      dataIndex: 'connectionName',
      key: 'connectionName',
      width: 120,
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_: any, record: BackupItem) => (
        <Space>
          <Tooltip title="恢复">
            <Button
              type="primary"
              size="small"
              icon={<CloudDownloadOutlined />}
              onClick={() => openRestoreModal(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除此备份吗？"
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
  const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
  const vmids = [...new Set(backups.map(b => b.vmid))];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {/* 统计卡片 */}
      <Row gutter={16}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="备份总数" value={backups.length} prefix={<DatabaseOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="总大小" value={formatBytes(totalSize)} prefix={<HddOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="涉及VM数" value={vmids.length} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic 
              title="最新备份" 
              value={backups.length > 0 ? dayjs.unix(backups[0]?.ctime).format('MM-DD HH:mm') : '-'}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 备份列表 */}
      <Card
        title="备份管理"
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
            <Select
              style={{ width: 150 }}
              placeholder="筛选VM"
              value={selectedVmid || undefined}
              onChange={setSelectedVmid}
              allowClear
            >
              {vmids.map(vmid => (
                <Option key={vmid} value={vmid}>VM {vmid}</Option>
              ))}
            </Select>
            <Button icon={<ReloadOutlined />} onClick={fetchBackups}>刷新</Button>
            <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setBackupModalVisible(true)}>
              创建备份
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={backups}
          rowKey="volid"
          loading={loading}
          pagination={{
            pageSize: 15,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个备份`,
          }}
          size="small"
        />
      </Card>

      {/* 创建备份弹窗 */}
      <Modal
        title="创建备份"
        open={backupModalVisible}
        onCancel={() => setBackupModalVisible(false)}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateBackup}>
          <Form.Item name="connection_id" label="连接" rules={[{ required: true }]}>
            <Select placeholder="选择PVE连接" onChange={(value) => {
              form.setFieldsValue({ vmid: undefined, node: undefined });
              setSelectedConnection(value);
            }}>
              {connections.filter(c => c.status === 'connected').map(conn => (
                <Option key={conn.id} value={conn.id}>{conn.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="vmid" label="虚拟机" rules={[{ required: true }]}>
            <Select 
              placeholder="选择虚拟机"
              onChange={(value) => {
                const vm = vms.find(v => v.vmid === value && v.connectionId === form.getFieldValue('connection_id'));
                if (vm) {
                  form.setFieldsValue({ node: vm.node, type: vm.type });
                }
              }}
            >
              {vms
                .filter(vm => vm.connectionId === form.getFieldValue('connection_id'))
                .map(vm => (
                  <Option key={vm.vmid} value={vm.vmid}>
                    {vm.name} ({vm.vmid}) - {vm.node}
                  </Option>
                ))}
            </Select>
          </Form.Item>

          <Form.Item name="node" label="节点" hidden>
            <Input />
          </Form.Item>

          <Form.Item name="type" label="类型" hidden>
            <Input />
          </Form.Item>

          <Form.Item name="storage" label="存储" rules={[{ required: true }]}>
            <Select placeholder="选择备份存储">
              {storages.map(s => (
                <Option key={s.storage} value={s.storage}>
                  {s.storage} ({formatBytes(s.avail)} 可用)
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="mode" label="备份模式" initialValue="snapshot">
            <Select>
              <Option value="snapshot">快照 (推荐)</Option>
              <Option value="suspend">挂起</Option>
              <Option value="stop">停止</Option>
            </Select>
          </Form.Item>

          <Form.Item name="compress" label="压缩" initialValue="zstd">
            <Select>
              <Option value="zstd">ZSTD (推荐)</Option>
              <Option value="lzo">LZO</Option>
              <Option value="gzip">GZIP</Option>
              <Option value="0">不压缩</Option>
            </Select>
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="备份备注（可选）" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={backupLoading}>
                开始备份
              </Button>
              <Button onClick={() => setBackupModalVisible(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 恢复备份弹窗 */}
      <Modal
        title="恢复备份"
        open={restoreModalVisible}
        onCancel={() => { setRestoreModalVisible(false); setSelectedBackup(null); }}
        footer={null}
        width={450}
      >
        <Form form={restoreForm} layout="vertical" onFinish={handleRestore}>
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
            <p style={{ margin: 0 }}><strong>备份文件:</strong> {selectedBackup?.volid?.split('/').pop()}</p>
            <p style={{ margin: '4px 0 0 0' }}><strong>原VMID:</strong> {selectedBackup?.vmid}</p>
          </div>

          <Form.Item name="vmid" label="新VMID" help="留空则使用原VMID">
            <Input type="number" placeholder="新的VMID（可选）" />
          </Form.Item>

          <Form.Item name="storage" label="目标存储" rules={[{ required: true }]}>
            <Select placeholder="选择目标存储">
              <Option value="local">local</Option>
              <Option value="local-lvm">local-lvm</Option>
            </Select>
          </Form.Item>

          <Form.Item name="unique" label="生成唯一标识" valuePropName="checked" initialValue={true}>
            <Select>
              <Option value={true}>是 - 生成新的MAC地址等</Option>
              <Option value={false}>否 - 保持原有配置</Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={backupLoading}>
                开始恢复
              </Button>
              <Button onClick={() => { setRestoreModalVisible(false); setSelectedBackup(null); }}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

export default Backups;
