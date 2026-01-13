import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Space, Tag, Select, Button, Row, Col, Input, message,
  Modal, Tabs, Alert, Checkbox, Collapse, Typography, Spin, Tooltip
} from 'antd';
import {
  PlayCircleOutlined, ReloadOutlined, DeleteOutlined, CodeOutlined,
  HistoryOutlined, ThunderboltOutlined, ClearOutlined, CopyOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { usePVE } from '../contexts/PVEContext';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;
const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface CommandTemplate {
  name: string;
  command: string;
  category: string;
}

interface ShellHistory {
  id: string;
  user_id: string;
  username: string;
  connection_id: string;
  connection_name: string;
  node: string;
  command: string;
  output: string;
  error: string;
  exit_code: number;
  duration: number;
  batch_id: string;
  created_at: string;
}

interface ExecutionResult {
  connection_id: string;
  connectionName?: string;
  node: string;
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  duration?: number;
  executionId?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function Shell() {
  const { token, hasRole } = useAuth();
  const { connections, nodes } = usePVE();
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [templates, setTemplates] = useState<CommandTemplate[]>([]);
  const [history, setHistory] = useState<ShellHistory[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  
  // 执行参数
  const [command, setCommand] = useState('');
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<string>('');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  
  // 执行结果
  const [results, setResults] = useState<ExecutionResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  // 获取模板
  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/shell/templates`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setTemplates(data);
      }
    } catch (error) {
      console.error('获取命令模板失败:', error);
    }
  }, [token]);

  // 获取历史
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/shell/history?limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setHistory(data.history || []);
        setHistoryTotal(data.total || 0);
      }
    } catch (error) {
      message.error('获取执行历史失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTemplates();
    fetchHistory();
  }, [fetchTemplates, fetchHistory]);

  // 获取可用节点
  const availableNodes = selectedConnection
    ? nodes.filter(n => n.connectionId === selectedConnection)
    : nodes;

  // 执行单个命令
  const executeCommand = async () => {
    if (!command.trim()) {
      message.warning('请输入要执行的命令');
      return;
    }

    if (batchMode) {
      if (selectedTargets.length === 0) {
        message.warning('请选择执行目标');
        return;
      }
      await executeBatch();
    } else {
      if (!selectedConnection || !selectedNode) {
        message.warning('请选择连接和节点');
        return;
      }
      await executeSingle();
    }
  };

  // 单节点执行
  const executeSingle = async () => {
    setExecuting(true);
    setResults([]);
    setShowResults(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/shell/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          connection_id: selectedConnection,
          node: selectedNode,
          command: command.trim()
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setResults([{
          connection_id: selectedConnection,
          connectionName: connections.find(c => c.id === selectedConnection)?.name,
          node: selectedNode,
          success: true,
          output: data.output,
          exitCode: data.exitCode,
          duration: data.duration,
          executionId: data.executionId
        }]);
        message.success('命令执行成功');
        fetchHistory();
      } else {
        setResults([{
          connection_id: selectedConnection,
          node: selectedNode,
          success: false,
          error: data.error
        }]);
        message.error(data.error || '执行失败');
      }
    } catch (error: any) {
      setResults([{
        connection_id: selectedConnection,
        node: selectedNode,
        success: false,
        error: error.message
      }]);
      message.error(`执行失败: ${error.message}`);
    } finally {
      setExecuting(false);
    }
  };

  // 批量执行
  const executeBatch = async () => {
    setExecuting(true);
    setResults([]);
    setShowResults(true);

    try {
      const targets = selectedTargets.map(key => {
        const [connectionId, node] = key.split('::');
        return { connection_id: connectionId, node };
      });

      const response = await fetch(`${API_BASE_URL}/api/shell/batch-execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          targets,
          command: command.trim()
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setResults(data.results);
        message.success(`批量执行完成: ${data.successCount} 成功, ${data.failCount} 失败`);
        fetchHistory();
      } else {
        message.error(data.error || '批量执行失败');
      }
    } catch (error: any) {
      message.error(`批量执行失败: ${error.message}`);
    } finally {
      setExecuting(false);
    }
  };

  // 使用模板
  const useTemplate = (template: CommandTemplate) => {
    setCommand(template.command);
    message.info(`已加载模板: ${template.name}`);
  };

  // 复制到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  };

  // 按分类分组模板
  const templatesByCategory = templates.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {} as Record<string, CommandTemplate[]>);

  // 历史表格列
  const historyColumns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (time: string) => dayjs(time).format('MM-DD HH:mm:ss'),
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      width: 100,
    },
    {
      title: '节点',
      key: 'target',
      width: 180,
      render: (_: any, record: ShellHistory) => (
        <div>
          <div>{record.connection_name}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.node}</Text>
        </div>
      ),
    },
    {
      title: '命令',
      dataIndex: 'command',
      key: 'command',
      ellipsis: true,
      render: (cmd: string) => (
        <Tooltip title={cmd}>
          <code style={{ fontSize: 12 }}>{cmd}</code>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: (_: any, record: ShellHistory) => (
        record.exit_code === 0 ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>成功</Tag>
        ) : record.exit_code === -1 ? (
          <Tag color="error" icon={<CloseCircleOutlined />}>错误</Tag>
        ) : (
          <Tag color="warning" icon={<ExclamationCircleOutlined />}>退出码: {record.exit_code}</Tag>
        )
      ),
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      width: 80,
      render: (ms: number) => `${ms}ms`,
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {/* 警告提示 */}
      <Alert
        message="Shell 命令执行"
        description="此功能允许在 PVE 节点上执行 Shell 命令。请谨慎使用，确保您了解命令的影响。危险命令将被系统自动拦截。"
        type="warning"
        showIcon
      />

      <Row gutter={16}>
        {/* 左侧：命令执行区 */}
        <Col span={16}>
          <Card title={<Space><CodeOutlined />命令执行</Space>}>
            {/* 模式选择 */}
            <div style={{ marginBottom: 16 }}>
              <Checkbox checked={batchMode} onChange={e => setBatchMode(e.target.checked)}>
                批量执行模式
              </Checkbox>
            </div>

            {/* 目标选择 */}
            {!batchMode ? (
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={12}>
                  <Select
                    style={{ width: '100%' }}
                    placeholder="选择PVE连接"
                    value={selectedConnection || undefined}
                    onChange={value => {
                      setSelectedConnection(value);
                      setSelectedNode('');
                    }}
                  >
                    {connections.filter(c => c.status === 'connected').map(conn => (
                      <Option key={conn.id} value={conn.id}>{conn.name}</Option>
                    ))}
                  </Select>
                </Col>
                <Col span={12}>
                  <Select
                    style={{ width: '100%' }}
                    placeholder="选择节点"
                    value={selectedNode || undefined}
                    onChange={setSelectedNode}
                    disabled={!selectedConnection}
                  >
                    {availableNodes.map(node => (
                      <Option key={node.node} value={node.node}>{node.node}</Option>
                    ))}
                  </Select>
                </Col>
              </Row>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <Text strong>选择执行目标:</Text>
                <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 8, border: '1px solid #d9d9d9', borderRadius: 4, padding: 8 }}>
                  <Checkbox.Group
                    value={selectedTargets}
                    onChange={values => setSelectedTargets(values as string[])}
                  >
                    <Space direction="vertical">
                      {nodes.map(node => {
                        const conn = connections.find(c => c.id === node.connectionId);
                        if (!conn || conn.status !== 'connected') return null;
                        return (
                          <Checkbox key={`${node.connectionId}::${node.node}`} value={`${node.connectionId}::${node.node}`}>
                            {conn.name} / {node.node}
                          </Checkbox>
                        );
                      })}
                    </Space>
                  </Checkbox.Group>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Button size="small" onClick={() => setSelectedTargets(nodes.filter(n => {
                    const conn = connections.find(c => c.id === n.connectionId);
                    return conn && conn.status === 'connected';
                  }).map(n => `${n.connectionId}::${n.node}`))}>全选</Button>
                  <Button size="small" style={{ marginLeft: 8 }} onClick={() => setSelectedTargets([])}>清除</Button>
                  <Text type="secondary" style={{ marginLeft: 16 }}>已选择 {selectedTargets.length} 个节点</Text>
                </div>
              </div>
            )}

            {/* 命令输入 */}
            <div style={{ marginBottom: 16 }}>
              <Text strong>命令:</Text>
              <TextArea
                value={command}
                onChange={e => setCommand(e.target.value)}
                placeholder="输入要执行的 Shell 命令..."
                rows={4}
                style={{ marginTop: 8, fontFamily: 'monospace' }}
              />
            </div>

            {/* 执行按钮 */}
            <Space>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={executeCommand}
                loading={executing}
                disabled={!command.trim()}
              >
                {batchMode ? '批量执行' : '执行'}
              </Button>
              <Button icon={<ClearOutlined />} onClick={() => setCommand('')}>
                清空
              </Button>
            </Space>

            {/* 执行结果 */}
            {showResults && (
              <div style={{ marginTop: 24 }}>
                <Text strong>执行结果:</Text>
                {executing ? (
                  <div style={{ textAlign: 'center', padding: 40 }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16 }}>正在执行命令...</div>
                  </div>
                ) : (
                  <Collapse style={{ marginTop: 8 }} defaultActiveKey={results.map((_, i) => i.toString())}>
                    {results.map((result, index) => (
                      <Panel
                        key={index}
                        header={
                          <Space>
                            {result.success ? (
                              <CheckCircleOutlined style={{ color: '#52c41a' }} />
                            ) : (
                              <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                            )}
                            <span>{result.connectionName || result.connection_id} / {result.node}</span>
                            {result.success && <Tag color="success">成功</Tag>}
                            {!result.success && <Tag color="error">失败</Tag>}
                            {result.duration && <Tag>{result.duration}ms</Tag>}
                          </Space>
                        }
                      >
                        {result.success ? (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                              <Text type="secondary">输出:</Text>
                              <Button 
                                size="small" 
                                icon={<CopyOutlined />}
                                onClick={() => copyToClipboard(typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2))}
                              >
                                复制
                              </Button>
                            </div>
                            <pre style={{ 
                              background: '#1e1e1e', 
                              color: '#d4d4d4', 
                              padding: 12, 
                              borderRadius: 4,
                              maxHeight: 300,
                              overflow: 'auto',
                              fontSize: 12,
                              margin: 0
                            }}>
                              {typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2)}
                            </pre>
                          </div>
                        ) : (
                          <Alert type="error" message={result.error} />
                        )}
                      </Panel>
                    ))}
                  </Collapse>
                )}
              </div>
            )}
          </Card>
        </Col>

        {/* 右侧：模板区 */}
        <Col span={8}>
          <Card 
            title={<Space><ThunderboltOutlined />常用命令</Space>}
            size="small"
            style={{ height: 'fit-content' }}
          >
            <Collapse size="small" ghost>
              {Object.entries(templatesByCategory).map(([category, cmds]) => (
                <Panel header={category} key={category}>
                  <Space direction="vertical" style={{ width: '100%' }} size={4}>
                    {cmds.map((t, i) => (
                      <Button 
                        key={i}
                        size="small" 
                        block 
                        style={{ textAlign: 'left', height: 'auto', whiteSpace: 'normal' }}
                        onClick={() => useTemplate(t)}
                      >
                        {t.name}
                      </Button>
                    ))}
                  </Space>
                </Panel>
              ))}
            </Collapse>
          </Card>
        </Col>
      </Row>

      {/* 执行历史 */}
      <Card 
        title={<Space><HistoryOutlined />执行历史</Space>}
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchHistory} loading={loading}>
            刷新
          </Button>
        }
      >
        <Table
          columns={historyColumns}
          dataSource={history}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            total: historyTotal,
            pageSize: 20,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          expandable={{
            expandedRowRender: record => (
              <div style={{ padding: 8 }}>
                {record.output && (
                  <div style={{ marginBottom: 8 }}>
                    <Text strong>输出:</Text>
                    <pre style={{ 
                      background: '#f5f5f5', 
                      padding: 8, 
                      borderRadius: 4, 
                      maxHeight: 200, 
                      overflow: 'auto',
                      fontSize: 12,
                      margin: '4px 0 0 0'
                    }}>
                      {record.output}
                    </pre>
                  </div>
                )}
                {record.error && (
                  <Alert type="error" message={record.error} size="small" />
                )}
              </div>
            ),
          }}
        />
      </Card>
    </Space>
  );
}

export default Shell;
