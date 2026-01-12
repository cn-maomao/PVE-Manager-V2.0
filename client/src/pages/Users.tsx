import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input, Select, message, Popconfirm, Typography
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth, Roles } from '../contexts/AuthContext';

const { Option } = Select;
const { Title } = Typography;

interface UserItem {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  last_login: string;
  last_login_ip: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function Users() {
  const { token, hasRole } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [form] = Form.useForm();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setUsers(data.users);
      } else {
        message.error(data.error || '获取用户列表失败');
      }
    } catch (error) {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (hasRole(Roles.ADMIN)) {
      fetchUsers();
    }
  }, [fetchUsers, hasRole]);

  const handleCreate = () => {
    setEditingUser(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (user: UserItem) => {
    setEditingUser(user);
    form.setFieldsValue({
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
    });
    setModalVisible(true);
  };

  const handleDelete = async (userId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        message.success('用户已删除');
        fetchUsers();
      } else {
        message.error(data.error || '删除失败');
      }
    } catch (error) {
      message.error('网络错误');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const url = editingUser 
        ? `${API_BASE_URL}/api/users/${editingUser.id}`
        : `${API_BASE_URL}/api/users`;
      
      const response = await fetch(url, {
        method: editingUser ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      });

      const data = await response.json();
      if (response.ok) {
        message.success(editingUser ? '用户已更新' : '用户已创建');
        setModalVisible(false);
        fetchUsers();
      } else {
        message.error(data.error || '操作失败');
      }
    } catch (error) {
      message.error('网络错误');
    }
  };

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (text: string) => (
        <Space>
          <UserOutlined />
          {text}
        </Space>
      ),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => {
        const colors: Record<string, string> = {
          admin: 'red',
          operator: 'blue',
          user: 'green',
          viewer: 'default',
        };
        const labels: Record<string, string> = {
          admin: '管理员',
          operator: '操作员',
          user: '普通用户',
          viewer: '只读用户',
        };
        return <Tag color={colors[role] || 'default'}>{labels[role] || role}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'success' : 'error'}>
          {status === 'active' ? '正常' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '最后登录',
      dataIndex: 'last_login',
      key: 'last_login',
      render: (time: string, record: UserItem) => (
        time ? (
          <span>
            {new Date(time).toLocaleString()}
            <br />
            <small style={{ color: '#999' }}>{record.last_login_ip}</small>
          </span>
        ) : '-'
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: UserItem) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除此用户吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!hasRole(Roles.ADMIN)) {
    return (
      <Card>
        <Title level={4}>权限不足</Title>
        <p>只有管理员可以访问用户管理页面</p>
      </Card>
    );
  }

  return (
    <Card
      title="用户管理"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchUsers}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            添加用户
          </Button>
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingUser ? '编辑用户' : '添加用户'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input disabled={!!editingUser} />
          </Form.Item>

          {!editingUser && (
            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6位' },
              ]}
            >
              <Input.Password />
            </Form.Item>
          )}

          {editingUser && (
            <Form.Item
              name="password"
              label="新密码"
              rules={[{ min: 6, message: '密码至少6位' }]}
              help="留空则不修改密码"
            >
              <Input.Password />
            </Form.Item>
          )}

          <Form.Item name="email" label="邮箱">
            <Input type="email" />
          </Form.Item>

          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
            initialValue="user"
          >
            <Select>
              <Option value="admin">管理员</Option>
              <Option value="operator">操作员</Option>
              <Option value="user">普通用户</Option>
              <Option value="viewer">只读用户</Option>
            </Select>
          </Form.Item>

          {editingUser && (
            <Form.Item name="status" label="状态">
              <Select>
                <Option value="active">正常</Option>
                <Option value="disabled">禁用</Option>
              </Select>
            </Form.Item>
          )}

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingUser ? '保存' : '创建'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

export default Users;
