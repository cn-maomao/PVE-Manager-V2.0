import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Progress,
  Modal,
  message,
  Tooltip,
  Select,
  Dropdown,
  Alert,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  PlayCircleOutlined,
  PoweroffOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  DeleteOutlined,
  StopOutlined,
  DesktopOutlined,
  DownOutlined,
  CheckSquareOutlined,
  BorderOutlined,
  CloudUploadOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { usePVE } from '../contexts/PVEContext';
import { useAuth } from '../contexts/AuthContext';
import VNCConsole from '../components/VNCConsole';

const { Option } = Select;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface VMRecord {
  vmid: number;
  name: string;
  type: 'qemu' | 'lxc';
  status: string;
  node: string;
  connectionId: string;
  connectionName: string;
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  uptime: number;
}

function VirtualMachines() {
  const { vms, connections, vmAction, refreshVMs } = usePVE();
  const { token, hasPermission } = useAuth();
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<string>('all');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [vncVisible, setVncVisible] = useState(false);
  const [vncTarget, setVncTarget] = useState<VMRecord | null>(null);
  const [batchVncVisible, setBatchVncVisible] = useState(false);
  const [batchVncTargets, setBatchVncTargets] = useState<VMRecord[]>([]);
  const [backupModalVisible, setBackupModalVisible] = useState(false);
  const [backupStorage, setBackupStorage] = useState<string>('local');

  const filteredVMs = selectedConnection === 'all' 
    ? vms 
    : vms.filter(vm => vm.connectionId === selectedConnection);

  const selectedVMs = filteredVMs.filter(vm => 
    selectedRowKeys.includes(`${vm.connectionId}-${vm.vmid}`)
  );

  const handleVMAction = async (
    vm: any,
    action: string
  ) => {
    setLoading(true);
    try {
      await vmAction(vm.connectionId, vm.vmid, vm.node, vm.type, action);
      message.success(`${action}操作已发送`);
      // 延迟刷新以等待操作完成
      setTimeout(() => {
        refreshVMs();
      }, 2000);
    } catch (error: any) {
      message.error(`操作失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const showDeleteConfirm = (vm: any) => {
    Modal.confirm({
      title: '确认删除虚拟机',
      content: `确定要删除虚拟机 ${vm.name} (ID: ${vm.vmid}) 吗？此操作不可恢复！`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk() {
        handleVMAction(vm, 'delete');
      },
    });
  };

  // 批量操作
  const handleBatchAction = async (action: string) => {
    if (selectedVMs.length === 0) {
      message.warning('请先选择虚拟机');
      return;
    }

    const actionNames: Record<string, string> = {
      start: '启动',
      stop: '强制关机',
      shutdown: '正常关机',
      reboot: '重启',
    };

    Modal.confirm({
      title: `批量${actionNames[action] || action}`,
      content: `确定要对选中的 ${selectedVMs.length} 台虚拟机执行 ${actionNames[action] || action} 操作吗？`,
      okText: '确认',
      cancelText: '取消',
      async onOk() {
        setBatchLoading(true);
        try {
          const vmList = selectedVMs.map(vm => ({
            connectionId: vm.connectionId,
            node: vm.node,
            vmid: vm.vmid,
            type: vm.type,
          }));

          const response = await fetch(`${API_BASE_URL}/api/batch/vms/action`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ action, vms: vmList }),
          });

          const data = await response.json();
          
          if (data.success) {
            const successCount = data.results.filter((r: any) => r.success).length;
            const failCount = data.results.filter((r: any) => !r.success).length;
            
            if (failCount > 0) {
              message.warning(`操作完成: ${successCount} 成功, ${failCount} 失败`);
            } else {
              message.success(`批量操作成功: ${successCount} 台虚拟机`);
            }
            
            setSelectedRowKeys([]);
            setTimeout(refreshVMs, 2000);
          } else {
            message.error(data.error || '批量操作失败');
          }
        } catch (error: any) {
          message.error(`批量操作失败: ${error.message}`);
        } finally {
          setBatchLoading(false);
        }
      },
    });
  };

  // 打开 VNC 控制台
  const openVNCConsole = (vm: VMRecord) => {
    if (vm.status !== 'running') {
      message.warning('虚拟机未运行，无法打开控制台');
      return;
    }
    setVncTarget(vm);
    setVncVisible(true);
  };

  // 批量打开VNC控制台
  const openBatchVNC = () => {
    const runningVMs = selectedVMs.filter(vm => vm.status === 'running');
    if (runningVMs.length === 0) {
      message.warning('选中的虚拟机都未运行');
      return;
    }
    setBatchVncTargets(runningVMs);
    setBatchVncVisible(true);
  };

  // 处理批量备份
  const handleBatchBackup = async () => {
    if (selectedVMs.length === 0) {
      message.warning('请先选择虚拟机');
      return;
    }

    Modal.confirm({
      title: '批量备份',
      content: (
        <div>
          <p>确定要对选中的 {selectedVMs.length} 台虚拟机创建备份吗？</p>
          <p style={{ marginTop: 8 }}>备份存储: {backupStorage}</p>
        </div>
      ),
      okText: '开始备份',
      cancelText: '取消',
      async onOk() {
        setBatchLoading(true);
        try {
          const vmList = selectedVMs.map(vm => ({
            connection_id: vm.connectionId,
            node: vm.node,
            vmid: vm.vmid,
            type: vm.type,
          }));

          const response = await fetch(`${API_BASE_URL}/api/batch/backups`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ 
              vms: vmList, 
              storage: backupStorage,
              mode: 'snapshot',
              compress: 'zstd'
            }),
          });

          const data = await response.json();
          
          if (data.success) {
            const successCount = data.results.filter((r: any) => r.success).length;
            const failCount = data.results.filter((r: any) => !r.success).length;
            
            if (failCount > 0) {
              message.warning(`备份任务已启动: ${successCount} 成功, ${failCount} 失败`);
            } else {
              message.success(`批量备份任务已启动: ${successCount} 台虚拟机`);
            }
            
            setSelectedRowKeys([]);
          } else {
            message.error(data.error || '批量备份失败');
          }
        } catch (error: any) {
          message.error(`批量备份失败: ${error.message}`);
        } finally {
          setBatchLoading(false);
        }
      },
    });
  };

  // 批量操作菜单
  const batchMenuItems: MenuProps['items'] = [
    {
      key: 'start',
      icon: <PlayCircleOutlined />,
      label: '批量启动',
      onClick: () => handleBatchAction('start'),
    },
    {
      key: 'shutdown',
      icon: <PoweroffOutlined />,
      label: '批量关机',
      onClick: () => handleBatchAction('shutdown'),
    },
    {
      key: 'stop',
      icon: <StopOutlined />,
      label: '批量强制关机',
      danger: true,
      onClick: () => handleBatchAction('stop'),
    },
    {
      key: 'reboot',
      icon: <ReloadOutlined />,
      label: '批量重启',
      onClick: () => handleBatchAction('reboot'),
    },
    { type: 'divider' },
    {
      key: 'vnc',
      icon: <AppstoreOutlined />,
      label: '批量打开控制台',
      onClick: openBatchVNC,
    },
    {
      key: 'backup',
      icon: <CloudUploadOutlined />,
      label: '批量备份',
      onClick: handleBatchBackup,
    },
  ];

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
    getCheckboxProps: (record: VMRecord) => ({
      disabled: !hasPermission('vm:start'),
    }),
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedRowKeys.length === filteredVMs.length) {
      setSelectedRowKeys([]);
    } else {
      setSelectedRowKeys(filteredVMs.map(vm => `${vm.connectionId}-${vm.vmid}`));
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    if (!seconds) return '-';
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}天 ${hours}小时`;
    } else if (hours > 0) {
      return `${hours}小时 ${minutes}分钟`;
    } else {
      return `${minutes}分钟`;
    }
  };

  const columns = [
    {
      title: 'VMID',
      dataIndex: 'vmid',
      key: 'vmid',
      width: 80,
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type: string) => (
        <Tag color={type === 'qemu' ? 'blue' : 'green'}>
          {type.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const configs = {
          running: { color: 'success', text: '运行中' },
          stopped: { color: 'default', text: '已停止' },
          suspended: { color: 'warning', text: '挂起' },
        };
        const config = configs[status as keyof typeof configs] || configs.stopped;
        return <Tag color={config.color}>{config.text}</Tag>;
      },
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
      title: 'CPU',
      key: 'cpu',
      width: 120,
      render: (record: any) => {
        const usage = record.maxcpu > 0 ? (record.cpu / record.maxcpu * 100) : 0;
        return (
          <div>
            <Progress percent={Math.round(usage)} size="small" />
            <small>{record.cpu} / {record.maxcpu} 核</small>
          </div>
        );
      },
    },
    {
      title: '内存',
      key: 'memory',
      width: 120,
      render: (record: any) => {
        const usage = record.maxmem > 0 ? (record.mem / record.maxmem * 100) : 0;
        return (
          <div>
            <Progress percent={Math.round(usage)} size="small" />
            <small>{formatBytes(record.mem)} / {formatBytes(record.maxmem)}</small>
          </div>
        );
      },
    },
    {
      title: '运行时间',
      dataIndex: 'uptime',
      key: 'uptime',
      width: 120,
      render: (uptime: number) => formatUptime(uptime),
    },
    {
      title: '操作',
      key: 'actions',
      width: 250,
      fixed: 'right' as const,
      render: (record: VMRecord) => (
        <Space size="small">
          {/* VNC 控制台 */}
          {record.status === 'running' && hasPermission('vm:console') && (
            <Tooltip title="控制台">
              <Button
                size="small"
                icon={<DesktopOutlined />}
                onClick={() => openVNCConsole(record)}
              />
            </Tooltip>
          )}
          
          {record.status === 'stopped' && hasPermission('vm:start') && (
            <Tooltip title="启动">
              <Button
                type="primary"
                size="small"
                icon={<PlayCircleOutlined />}
                onClick={() => handleVMAction(record, 'start')}
                loading={loading}
              />
            </Tooltip>
          )}
          
          {record.status === 'running' && hasPermission('vm:stop') && (
            <>
              <Tooltip title="关闭">
                <Button
                  size="small"
                  icon={<PoweroffOutlined />}
                  onClick={() => handleVMAction(record, 'shutdown')}
                  loading={loading}
                />
              </Tooltip>
              
              <Tooltip title="强制停止">
                <Button
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  onClick={() => handleVMAction(record, 'stop')}
                  loading={loading}
                />
              </Tooltip>
              
              {record.type === 'qemu' && (
                <Tooltip title="挂起">
                  <Button
                    size="small"
                    icon={<PauseCircleOutlined />}
                    onClick={() => handleVMAction(record, 'suspend')}
                    loading={loading}
                  />
                </Tooltip>
              )}
            </>
          )}
          
          {record.status === 'suspended' && record.type === 'qemu' && hasPermission('vm:start') && (
            <Tooltip title="恢复">
              <Button
                type="primary"
                size="small"
                icon={<PlayCircleOutlined />}
                onClick={() => handleVMAction(record, 'resume')}
                loading={loading}
              />
            </Tooltip>
          )}
          
          {record.status === 'stopped' && hasPermission('vm:delete') && (
            <Tooltip title="删除">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => showDeleteConfirm(record)}
                loading={loading}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title="虚拟机管理"
        extra={
          <Space>
            <Select
              style={{ width: 200 }}
              placeholder="选择连接"
              value={selectedConnection}
              onChange={setSelectedConnection}
            >
              <Option value="all">所有连接</Option>
              {connections.map(conn => (
                <Option key={conn.id} value={conn.id}>
                  {conn.name}
                </Option>
              ))}
            </Select>
            
            {hasPermission('vm:start') && (
              <>
                <Button
                  icon={selectedRowKeys.length === filteredVMs.length ? <CheckSquareOutlined /> : <BorderOutlined />}
                  onClick={handleSelectAll}
                >
                  {selectedRowKeys.length === filteredVMs.length ? '取消全选' : '全选'}
                </Button>
                
                <Dropdown 
                  menu={{ items: batchMenuItems }} 
                  disabled={selectedRowKeys.length === 0}
                >
                  <Button loading={batchLoading}>
                    批量操作 ({selectedRowKeys.length}) <DownOutlined />
                  </Button>
                </Dropdown>
              </>
            )}
            
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={refreshVMs}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        }
      >
        {selectedRowKeys.length > 0 && (
          <Alert
            message={`已选择 ${selectedRowKeys.length} 台虚拟机`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            action={
              <Button size="small" onClick={() => setSelectedRowKeys([])}>
                清除选择
              </Button>
            }
          />
        )}
        
        <Table
          rowSelection={hasPermission('vm_control') ? rowSelection : undefined}
          columns={columns}
          dataSource={filteredVMs}
          rowKey={(record) => `${record.connectionId}-${record.vmid}`}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
          }}
          scroll={{ x: 1300 }}
          size="small"
        />
      </Card>
      
      {/* VNC 控制台 Modal */}
      {vncTarget && (
        <VNCConsole
          visible={vncVisible}
          onClose={() => {
            setVncVisible(false);
            setVncTarget(null);
          }}
          connectionId={vncTarget.connectionId}
          node={vncTarget.node}
          vmid={vncTarget.vmid}
          vmname={vncTarget.name}
          vmtype={vncTarget.type}
        />
      )}

      {/* 批量 VNC 控制台 Modal */}
      <Modal
        title={`批量控制台 (${batchVncTargets.length} 台虚拟机)`}
        open={batchVncVisible}
        onCancel={() => {
          setBatchVncVisible(false);
          setBatchVncTargets([]);
        }}
        width={1200}
        footer={null}
        styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
      >
        <Alert
          message="批量远程控制"
          description="点击下方按钮在新窗口中打开各虚拟机的控制台"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {batchVncTargets.map(vm => (
            <Card 
              key={`${vm.connectionId}-${vm.vmid}`}
              size="small" 
              style={{ width: 280 }}
              title={`${vm.name} (${vm.vmid})`}
            >
              <p>节点: {vm.node}</p>
              <p>连接: {vm.connectionName}</p>
              <Button
                type="primary"
                icon={<DesktopOutlined />}
                onClick={() => openVNCConsole(vm)}
                block
              >
                打开控制台
              </Button>
            </Card>
          ))}
        </div>
      </Modal>
    </>
  );
}

export default VirtualMachines;