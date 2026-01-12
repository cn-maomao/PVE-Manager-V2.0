import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input, Select, message, 
  Popconfirm, Tooltip, Row, Col, Statistic, ColorPicker
} from 'antd';
import type { Color } from 'antd/es/color-picker';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  PlayCircleOutlined, PoweroffOutlined, StopOutlined, FolderOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { usePVE } from '../contexts/PVEContext';

const { Option } = Select;
const { TextArea } = Input;

interface VMGroup {
  id: string;
  name: string;
  description: string;
  color: string;
  member_count: number;
  created_at: string;
  members?: any[];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function VMGroups() {
  const { token, hasPermission } = useAuth();
  const { vms, connections } = usePVE();
  const [groups, setGroups] = useState<VMGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<VMGroup | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<VMGroup | null>(null);
  const [selectedVMs, setSelectedVMs] = useState<string[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/groups`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setGroups(data);
      }
    } catch (error) {
      message.error('获取分组列表失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchGroupDetails = useCallback(async (groupId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setSelectedGroup(data);
      }
    } catch (error) {
      message.error('获取分组详情失败');
    }
  }, [token]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleCreate = () => {
    setEditingGroup(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (group: VMGroup) => {
    setEditingGroup(group);
    form.setFieldsValue({
      name: group.name,
      description: group.description,
      color: group.color,
    });
    setModalVisible(true);
  };

  const handleDelete = async (groupId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        message.success('分组已删除');
        fetchGroups();
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const color = typeof values.color === 'string' ? values.color : 
        (values.color as Color)?.toHexString?.() || '#1890ff';
      
      const url = editingGroup 
        ? `${API_BASE_URL}/api/groups/${editingGroup.id}`
        : `${API_BASE_URL}/api/groups`;
      
      const response = await fetch(url, {
        method: editingGroup ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ ...values, color }),
      });

      if (response.ok) {
        message.success(editingGroup ? '分组已更新' : '分组已创建');
        setModalVisible(false);
        fetchGroups();
      }
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleManageMembers = async (group: VMGroup) => {
    await fetchGroupDetails(group.id);
    setMembersModalVisible(true);
  };

  const handleAddMembers = async () => {
    if (!selectedGroup || selectedVMs.length === 0) return;
    
    const members = selectedVMs.map(key => {
      // key 格式: connectionId::node::vmid (使用 :: 作为分隔符避免 connectionId 中的 - 影响)
      const parts = key.split('::');
      return { connection_id: parts[0], node: parts[1], vmid: parseInt(parts[2]) };
    });

    try {
      const response = await fetch(`${API_BASE_URL}/api/groups/${selectedGroup.id}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ members }),
      });

      if (response.ok) {
        message.success('虚拟机已添加到分组');
        fetchGroupDetails(selectedGroup.id);
        fetchGroups();
        setSelectedVMs([]);
      }
    } catch (error) {
      message.error('添加失败');
    }
  };

  const handleRemoveMember = async (member: any) => {
    if (!selectedGroup) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/groups/${selectedGroup.id}/members`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          members: [{ connection_id: member.connection_id, node: member.node, vmid: member.vmid }] 
        }),
      });

      if (response.ok) {
        message.success('已从分组移除');
        fetchGroupDetails(selectedGroup.id);
        fetchGroups();
      }
    } catch (error) {
      message.error('移除失败');
    }
  };

  const handleBatchAction = async (groupId: string, action: string) => {
    setBatchLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/batch-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();
      if (response.ok) {
        message.success(`批量${action}操作已执行: 成功 ${data.successCount}, 失败 ${data.failCount}`);
        fetchGroupDetails(groupId);
      } else {
        message.error(data.error || '操作失败');
      }
    } catch (error) {
      message.error('操作失败');
    } finally {
      setBatchLoading(false);
    }
  };

  const columns = [
    {
      title: '分组名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: VMGroup) => (
        <Space>
          <FolderOutlined style={{ color: record.color }} />
          <span style={{ color: record.color, fontWeight: 500 }}>{name}</span>
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '虚拟机数量',
      dataIndex: 'member_count',
      key: 'member_count',
      render: (count: number) => <Tag color="blue">{count} 台</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: '批量操作',
      key: 'batch',
      render: (_: any, record: VMGroup) => (
        <Space>
          <Tooltip title="批量启动">
            <Button
              type="primary"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => handleBatchAction(record.id, 'start')}
              loading={batchLoading}
              disabled={record.member_count === 0}
            />
          </Tooltip>
          <Tooltip title="批量关机">
            <Button
              size="small"
              icon={<PoweroffOutlined />}
              onClick={() => handleBatchAction(record.id, 'shutdown')}
              loading={batchLoading}
              disabled={record.member_count === 0}
            />
          </Tooltip>
          <Tooltip title="批量强制停止">
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => handleBatchAction(record.id, 'stop')}
              loading={batchLoading}
              disabled={record.member_count === 0}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: VMGroup) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleManageMembers(record)}>
            管理成员
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定要删除此分组吗？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const memberColumns = [
    { title: 'VMID', dataIndex: 'vmid', key: 'vmid', width: 80 },
    { title: '名称', dataIndex: 'vmname', key: 'vmname' },
    { title: '节点', dataIndex: 'node', key: 'node' },
    { title: '连接', dataIndex: 'connectionName', key: 'connectionName' },
    {
      title: '状态',
      dataIndex: 'vmstatus',
      key: 'vmstatus',
      render: (status: string) => (
        <Tag color={status === 'running' ? 'success' : status === 'stopped' ? 'default' : 'warning'}>
          {status}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Popconfirm title="确定要从分组移除此虚拟机吗？" onConfirm={() => handleRemoveMember(record)}>
          <Button type="link" size="small" danger>移除</Button>
        </Popconfirm>
      ),
    },
  ];

  // 获取可添加的虚拟机列表（排除已在分组中的）
  const availableVMs = vms.filter(vm => {
    if (!selectedGroup?.members) return true;
    return !selectedGroup.members.some(
      m => m.connection_id === vm.connectionId && m.node === vm.node && m.vmid === vm.vmid
    );
  });

  return (
    <>
      <Card
        title="虚拟机分组"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchGroups}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              创建分组
            </Button>
          </Space>
        }
      >
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="分组总数" value={groups.length} prefix={<FolderOutlined />} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic 
                title="管理的虚拟机" 
                value={groups.reduce((sum, g) => sum + g.member_count, 0)} 
              />
            </Card>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={groups}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 创建/编辑分组弹窗 */}
      <Modal
        title={editingGroup ? '编辑分组' : '创建分组'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="分组名称" rules={[{ required: true }]}>
            <Input placeholder="输入分组名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="分组描述（可选）" />
          </Form.Item>
          <Form.Item name="color" label="颜色" initialValue="#1890ff">
            <ColorPicker />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingGroup ? '保存' : '创建'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 管理成员弹窗 */}
      <Modal
        title={`管理分组成员 - ${selectedGroup?.name}`}
        open={membersModalVisible}
        onCancel={() => { setMembersModalVisible(false); setSelectedGroup(null); }}
        width={800}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Card size="small" title="添加虚拟机">
            <Space style={{ width: '100%' }}>
              <Select
                mode="multiple"
                style={{ width: 500 }}
                placeholder="选择要添加的虚拟机"
                value={selectedVMs}
                onChange={setSelectedVMs}
              >
              {availableVMs.map(vm => (
                  <Option key={`${vm.connectionId}::${vm.node}::${vm.vmid}`} value={`${vm.connectionId}::${vm.node}::${vm.vmid}`}>
                    {vm.name} ({vm.vmid}) - {vm.connectionName}
                  </Option>
                ))}
              </Select>
              <Button type="primary" onClick={handleAddMembers} disabled={selectedVMs.length === 0}>
                添加
              </Button>
            </Space>
          </Card>

          <Card size="small" title={`已添加的虚拟机 (${selectedGroup?.members?.length || 0})`}>
            <Table
              columns={memberColumns}
              dataSource={selectedGroup?.members || []}
              rowKey={(r) => `${r.connection_id}-${r.vmid}`}
              size="small"
              pagination={false}
            />
          </Card>

          <Card size="small" title="批量操作">
            <Space>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => selectedGroup && handleBatchAction(selectedGroup.id, 'start')}
                loading={batchLoading}
              >
                全部启动
              </Button>
              <Button
                icon={<PoweroffOutlined />}
                onClick={() => selectedGroup && handleBatchAction(selectedGroup.id, 'shutdown')}
                loading={batchLoading}
              >
                全部关机
              </Button>
              <Button
                danger
                icon={<StopOutlined />}
                onClick={() => selectedGroup && handleBatchAction(selectedGroup.id, 'stop')}
                loading={batchLoading}
              >
                全部强制停止
              </Button>
            </Space>
          </Card>
        </Space>
      </Modal>
    </>
  );
}

export default VMGroups;
