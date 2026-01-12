import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  message,
  Tooltip,
  Popconfirm,
  Tabs,
  Badge,
  Typography,
  TimePicker,
  Checkbox,
  Descriptions,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  HistoryOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '../contexts/AuthContext';
import { usePVE } from '../contexts/PVEContext';

const { Option } = Select;
const { Text } = Typography;
const { TabPane } = Tabs;

interface ScheduledTask {
  id: string;
  name: string;
  task_type: string;
  action: string;
  target_type: string;
  target_id: string;
  target_details: string;
  schedule_type: string;
  cron_expression: string;
  scheduled_time: string;
  timezone: string;
  enabled: number;
  last_run: string;
  last_status: string;
  last_error: string;
  next_run: string;
  run_count: number;
  created_at: string;
}

interface TaskHistory {
  id: number;
  task_id: string;
  task_name: string;
  action: string;
  status: string;
  details: string;
  error: string;
  started_at: string;
  completed_at: string;
  duration: number;
}

interface VMGroup {
  id: string;
  name: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function ScheduledTasks() {
  const { token, hasPermission } = useAuth();
  const { vms, connections } = usePVE();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [history, setHistory] = useState<TaskHistory[]>([]);
  const [vmGroups, setVMGroups] = useState<VMGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [targetType, setTargetType] = useState<string>('vm');
  const [taskType, setTaskType] = useState<string>('power');
  const [scheduleType, setScheduleType] = useState<string>('daily');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // 周一到周五

  useEffect(() => {
    fetchTasks();
    fetchVMGroups();
    fetchHistory();
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/scheduler/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setTasks(data.tasks);
      }
    } catch (error: any) {
      message.error('获取任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/scheduler/history?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setHistory(data.history);
      }
    } catch (error) {
      console.error('获取历史记录失败:', error);
    }
  };

  const fetchVMGroups = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setVMGroups(data.groups);
      }
    } catch (error) {
      console.error('获取分组失败:', error);
    }
  };

  const handleCreate = () => {
    setEditingTask(null);
    form.resetFields();
    setTargetType('vm');
    setTaskType('power');
    setScheduleType('daily');
    setSelectedDays([1, 2, 3, 4, 5]);
    setModalVisible(true);
  };

  const handleEdit = (task: ScheduledTask) => {
    setEditingTask(task);
    setTargetType(task.target_type);
    setTaskType(task.task_type);
    setScheduleType(task.schedule_type);
    
    // 解析 cron 表达式中的星期几
    if (task.cron_expression) {
      const parts = task.cron_expression.split(' ');
      if (parts.length >= 5 && parts[4] !== '*') {
        setSelectedDays(parts[4].split(',').map(Number));
      }
    }
    
    const targetDetails = task.target_details ? JSON.parse(task.target_details) : {};
    
    form.setFieldsValue({
      name: task.name,
      task_type: task.task_type,
      action: task.action,
      target_type: task.target_type,
      target_id: task.target_id,
      schedule_type: task.schedule_type,
      scheduled_time: task.scheduled_time ? dayjs(task.scheduled_time, 'HH:mm') : null,
      enabled: task.enabled === 1,
      ...targetDetails,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/scheduler/tasks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        message.success('任务已删除');
        fetchTasks();
      } else {
        message.error(data.error || '删除失败');
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/scheduler/tasks/${id}/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        message.success(data.task.enabled ? '任务已启用' : '任务已禁用');
        fetchTasks();
      } else {
        message.error(data.error || '操作失败');
      }
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/scheduler/tasks/${id}/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        if (data.result.status === 'success') {
          message.success('任务执行成功');
        } else if (data.result.status === 'partial') {
          message.warning('任务部分执行成功');
        } else {
          message.error(`任务执行失败: ${data.result.error}`);
        }
        fetchTasks();
        fetchHistory();
      } else {
        message.error(data.error || '执行失败');
      }
    } catch (error) {
      message.error('执行失败');
    }
  };

  const handleViewHistory = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setHistoryModalVisible(true);
  };

  const handleSubmit = async (values: any) => {
    try {
      // 构建 cron 表达式
      let cron_expression = '0 0 * * *';
      if (values.scheduled_time) {
        const time = values.scheduled_time.format('HH:mm');
        const [hour, minute] = time.split(':');
        
        if (scheduleType === 'daily') {
          cron_expression = `${minute} ${hour} * * *`;
        } else if (scheduleType === 'weekly') {
          cron_expression = `${minute} ${hour} * * ${selectedDays.join(',')}`;
        } else if (scheduleType === 'once') {
          cron_expression = `${minute} ${hour} * * *`;
        }
      }

      // 构建目标详情
      let target_details: any = {};
      if (targetType === 'vm') {
        const selectedVM = vms.find(vm => `${vm.connectionId}-${vm.vmid}` === values.target_id);
        if (selectedVM) {
          target_details = {
            connectionId: selectedVM.connectionId,
            node: selectedVM.node,
            vmid: selectedVM.vmid,
            type: selectedVM.type,
          };
        }
      } else if (targetType === 'backup' && values.target_id) {
        const selectedVM = vms.find(vm => `${vm.connectionId}-${vm.vmid}` === values.target_id);
        if (selectedVM) {
          target_details = {
            connectionId: selectedVM.connectionId,
            node: selectedVM.node,
            vmid: selectedVM.vmid,
            type: selectedVM.type,
            storage: values.storage || 'local',
            mode: values.mode || 'snapshot',
            compress: values.compress || 'zstd',
          };
        }
      }

      const payload = {
        name: values.name,
        task_type: taskType,
        action: values.action,
        target_type: targetType,
        target_id: values.target_id,
        target_details,
        schedule_type: scheduleType,
        cron_expression,
        scheduled_time: values.scheduled_time?.format('HH:mm'),
        enabled: values.enabled !== false,
      };

      const url = editingTask 
        ? `${API_BASE_URL}/api/scheduler/tasks/${editingTask.id}`
        : `${API_BASE_URL}/api/scheduler/tasks`;
      
      const response = await fetch(url, {
        method: editingTask ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (data.success) {
        message.success(editingTask ? '任务已更新' : '任务已创建');
        setModalVisible(false);
        fetchTasks();
      } else {
        message.error(data.error || '操作失败');
      }
    } catch (error) {
      message.error('操作失败');
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return dayjs(dateStr).format('YYYY-MM-DD HH:mm:ss');
  };

  const getStatusTag = (status: string) => {
    const configs: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
      success: { color: 'success', text: '成功', icon: <CheckCircleOutlined /> },
      partial: { color: 'warning', text: '部分成功', icon: <ExclamationCircleOutlined /> },
      failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
    };
    const config = configs[status] || { color: 'default', text: status, icon: null };
    return <Tag color={config.color} icon={config.icon}>{config.text}</Tag>;
  };

  const taskColumns = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
    },
    {
      title: '类型',
      dataIndex: 'task_type',
      key: 'task_type',
      width: 100,
      render: (type: string) => {
        const types: Record<string, { color: string; text: string }> = {
          power: { color: 'blue', text: '电源操作' },
          backup: { color: 'green', text: '备份' },
        };
        const config = types[type] || { color: 'default', text: type };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (action: string) => {
        const actions: Record<string, string> = {
          start: '启动',
          stop: '强制关机',
          shutdown: '关机',
          reboot: '重启',
          backup: '备份',
        };
        return actions[action] || action;
      },
    },
    {
      title: '目标',
      key: 'target',
      width: 150,
      render: (record: ScheduledTask) => {
        if (record.target_type === 'group') {
          const group = vmGroups.find(g => g.id === record.target_id);
          return <Tag color="purple">分组: {group?.name || record.target_id}</Tag>;
        }
        return <Tag color="cyan">VM: {record.target_id}</Tag>;
      },
    },
    {
      title: '调度',
      key: 'schedule',
      width: 150,
      render: (record: ScheduledTask) => {
        const scheduleTypes: Record<string, string> = {
          once: '一次性',
          daily: '每天',
          weekly: '每周',
        };
        return (
          <Space direction="vertical" size={0}>
            <Text>{scheduleTypes[record.schedule_type] || record.schedule_type}</Text>
            {record.scheduled_time && <Text type="secondary">{record.scheduled_time}</Text>}
          </Space>
        );
      },
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (record: ScheduledTask) => (
        <Switch 
          checked={record.enabled === 1}
          onChange={() => handleToggle(record.id)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      ),
    },
    {
      title: '下次执行',
      dataIndex: 'next_run',
      key: 'next_run',
      width: 160,
      render: (value: string) => value ? formatDate(value) : '-',
    },
    {
      title: '上次执行',
      key: 'last_run',
      width: 180,
      render: (record: ScheduledTask) => (
        <Space direction="vertical" size={0}>
          <Text>{record.last_run ? formatDate(record.last_run) : '-'}</Text>
          {record.last_status && getStatusTag(record.last_status)}
        </Space>
      ),
    },
    {
      title: '执行次数',
      dataIndex: 'run_count',
      key: 'run_count',
      width: 80,
      render: (count: number) => <Badge count={count} showZero color="#1890ff" />,
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right' as const,
      render: (record: ScheduledTask) => (
        <Space size="small">
          <Tooltip title="立即执行">
            <Button
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => handleRunNow(record.id)}
            />
          </Tooltip>
          <Tooltip title="历史记录">
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => handleViewHistory(record.id)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除此任务吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const historyColumns = [
    {
      title: '任务名称',
      dataIndex: 'task_name',
      key: 'task_name',
      width: 150,
    },
    {
      title: '执行操作',
      dataIndex: 'action',
      key: 'action',
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: '开始时间',
      dataIndex: 'started_at',
      key: 'started_at',
      width: 160,
      render: (value: string) => formatDate(value),
    },
    {
      title: '完成时间',
      dataIndex: 'completed_at',
      key: 'completed_at',
      width: 160,
      render: (value: string) => formatDate(value),
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      width: 100,
      render: (ms: number) => ms ? `${(ms / 1000).toFixed(2)}秒` : '-',
    },
    {
      title: '错误信息',
      dataIndex: 'error',
      key: 'error',
      ellipsis: true,
      render: (error: string) => error ? <Text type="danger">{error}</Text> : '-',
    },
  ];

  const weekDays = [
    { label: '周日', value: 0 },
    { label: '周一', value: 1 },
    { label: '周二', value: 2 },
    { label: '周三', value: 3 },
    { label: '周四', value: 4 },
    { label: '周五', value: 5 },
    { label: '周六', value: 6 },
  ];

  const filteredHistory = selectedTaskId 
    ? history.filter(h => h.task_id === selectedTaskId)
    : history;

  return (
    <Card
      title={
        <Space>
          <ClockCircleOutlined />
          <span>调度任务管理</span>
        </Space>
      }
      extra={
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => { fetchTasks(); fetchHistory(); }}
          >
            刷新
          </Button>
          {hasPermission('manage_tasks') && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreate}
            >
              创建任务
            </Button>
          )}
        </Space>
      }
    >
      <Tabs defaultActiveKey="tasks">
        <TabPane tab="调度任务" key="tasks">
          <Table
            columns={taskColumns}
            dataSource={tasks}
            rowKey="id"
            loading={loading}
            scroll={{ x: 1500 }}
            pagination={{ pageSize: 10 }}
          />
        </TabPane>
        <TabPane tab="执行历史" key="history">
          <Table
            columns={historyColumns}
            dataSource={history}
            rowKey="id"
            scroll={{ x: 1000 }}
            pagination={{ pageSize: 20 }}
          />
        </TabPane>
      </Tabs>

      {/* 创建/编辑任务 Modal */}
      <Modal
        title={editingTask ? '编辑任务' : '创建任务'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            enabled: true,
            task_type: 'power',
            target_type: 'vm',
            schedule_type: 'daily',
          }}
        >
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="例如: 每日关机" />
          </Form.Item>

          <Form.Item label="任务类型">
            <Select value={taskType} onChange={setTaskType}>
              <Option value="power">电源操作</Option>
              <Option value="backup">备份任务</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="action"
            label="执行操作"
            rules={[{ required: true, message: '请选择操作' }]}
          >
            <Select placeholder="选择操作">
              {taskType === 'power' && (
                <>
                  <Option value="start">启动</Option>
                  <Option value="shutdown">关机</Option>
                  <Option value="stop">强制关机</Option>
                  <Option value="reboot">重启</Option>
                </>
              )}
              {taskType === 'backup' && (
                <Option value="backup">创建备份</Option>
              )}
            </Select>
          </Form.Item>

          <Form.Item label="目标类型">
            <Select value={targetType} onChange={setTargetType}>
              <Option value="vm">单个虚拟机</Option>
              <Option value="group">虚拟机分组</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="target_id"
            label="选择目标"
            rules={[{ required: true, message: '请选择目标' }]}
          >
            <Select
              placeholder={targetType === 'vm' ? '选择虚拟机' : '选择分组'}
              showSearch
              optionFilterProp="children"
            >
              {targetType === 'vm' && vms.map(vm => (
                <Option key={`${vm.connectionId}-${vm.vmid}`} value={`${vm.connectionId}-${vm.vmid}`}>
                  {vm.name} (ID: {vm.vmid}) - {vm.connectionName}
                </Option>
              ))}
              {targetType === 'group' && vmGroups.map(group => (
                <Option key={group.id} value={group.id}>
                  {group.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {taskType === 'backup' && (
            <>
              <Form.Item name="storage" label="存储位置" initialValue="local">
                <Input placeholder="存储ID，例如: local" />
              </Form.Item>
              <Form.Item name="mode" label="备份模式" initialValue="snapshot">
                <Select>
                  <Option value="snapshot">快照 (推荐)</Option>
                  <Option value="suspend">挂起</Option>
                  <Option value="stop">停止</Option>
                </Select>
              </Form.Item>
            </>
          )}

          <Form.Item label="调度类型">
            <Select value={scheduleType} onChange={setScheduleType}>
              <Option value="once">一次性</Option>
              <Option value="daily">每天</Option>
              <Option value="weekly">每周</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="scheduled_time"
            label="执行时间"
            rules={[{ required: true, message: '请选择执行时间' }]}
          >
            <TimePicker format="HH:mm" style={{ width: '100%' }} />
          </Form.Item>

          {scheduleType === 'weekly' && (
            <Form.Item label="执行日期">
              <Checkbox.Group
                options={weekDays}
                value={selectedDays}
                onChange={(values) => setSelectedDays(values as number[])}
              />
            </Form.Item>
          )}

          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">
                {editingTask ? '保存' : '创建'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 历史记录 Modal */}
      <Modal
        title="任务执行历史"
        open={historyModalVisible}
        onCancel={() => {
          setHistoryModalVisible(false);
          setSelectedTaskId(null);
        }}
        footer={null}
        width={900}
      >
        <Table
          columns={historyColumns}
          dataSource={filteredHistory}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          scroll={{ x: 800 }}
        />
      </Modal>
    </Card>
  );
}

export default ScheduledTasks;
