import { Express, Response } from 'express';
import { PVEManager } from '../services/pve-manager';
import { authMiddleware, requireRole, AuthRequest, UserRoles, logUserAction } from './auth';

const database = require('../db/database');

// 危险命令黑名单
const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'mkfs',
  'dd if=',
  ':(){:|:&};:',
  '> /dev/sda',
  'chmod -R 777 /',
  'chown -R',
  'shutdown',
  'reboot',
  'init 0',
  'init 6',
  'halt',
  'poweroff'
];

// 检查命令是否安全
function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  const lowerCmd = command.toLowerCase().trim();
  
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (lowerCmd.includes(dangerous.toLowerCase())) {
      return { safe: false, reason: `命令包含危险操作: ${dangerous}` };
    }
  }
  
  // 检查是否尝试删除根目录
  if (/rm\s+(-[a-z]*\s+)*\/($|\s)/.test(lowerCmd)) {
    return { safe: false, reason: '不允许删除根目录' };
  }
  
  return { safe: true };
}

// 生成执行ID
function generateExecutionId(): string {
  return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function setupShellRoutes(app: Express, pveManager: PVEManager) {
  
  // 在单个PVE节点上执行命令
  app.post('/api/shell/execute', authMiddleware, requireRole(UserRoles.ADMIN, UserRoles.OPERATOR), async (req: AuthRequest, res: Response) => {
    try {
      const { connection_id, node, command, timeout = 30000 } = req.body;
      
      if (!connection_id || !node || !command) {
        return res.status(400).json({ error: '缺少参数: connection_id, node, command' });
      }
      
      // 安全检查
      const safetyCheck = isCommandSafe(command);
      if (!safetyCheck.safe) {
        await logUserAction(req.user!.id, req.user!.username, 'shell_blocked', command,
          { connection_id, node, reason: safetyCheck.reason },
          req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
        return res.status(403).json({ error: safetyCheck.reason });
      }
      
      const connection = pveManager.getConnection(connection_id);
      if (!connection || connection.status !== 'connected') {
        return res.status(404).json({ error: '连接不可用' });
      }
      
      const executionId = generateExecutionId();
      const startTime = Date.now();
      
      try {
        // 通过PVE API执行命令
        // 注意: PVE 标准 API 不直接支持执行shell命令
        // 这里使用 /nodes/{node}/execute 端点 (如果可用) 或者需要通过 qemu-agent
        // 实际上更安全的方式是使用 SSH
        const result = await pveManager.executeOnConnection(connection_id, async (client) => {
          // 尝试使用 PVE 的 shell 端点
          try {
            const response = await (client as any).client.post(
              `/nodes/${node}/execute`,
              { 
                command: command,
                'timeout': Math.floor(timeout / 1000)
              }
            );
            return response.data.data;
          } catch (err: any) {
            // 如果 execute 端点不可用，返回错误
            if (err.response?.status === 501 || err.response?.status === 404) {
              throw new Error('PVE 节点不支持远程命令执行。请通过 SSH 连接执行命令，或在 PVE 节点上启用 pve-shell 功能。');
            }
            throw err;
          }
        });
        
        const duration = Date.now() - startTime;
        
        // 记录执行历史
        await database.run(`
          INSERT INTO shell_history (id, user_id, username, connection_id, connection_name, node, command, output, exit_code, duration, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [executionId, req.user!.id, req.user!.username, connection_id, connection.name, node, command, 
            JSON.stringify(result), result?.exitcode || 0, duration]);
        
        await logUserAction(req.user!.id, req.user!.username, 'shell_execute', command,
          { connection_id, node, executionId, duration, exitCode: result?.exitcode },
          req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
        
        res.json({
          success: true,
          executionId,
          output: result?.output || result,
          exitCode: result?.exitcode || 0,
          duration
        });
      } catch (execError: any) {
        const duration = Date.now() - startTime;
        
        // 记录失败的执行
        await database.run(`
          INSERT INTO shell_history (id, user_id, username, connection_id, connection_name, node, command, error, exit_code, duration, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [executionId, req.user!.id, req.user!.username, connection_id, connection.name, node, command, 
            execError.message, -1, duration]);
        
        throw execError;
      }
    } catch (error: any) {
      console.error('执行命令失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 批量在多个PVE节点上执行命令
  app.post('/api/shell/batch-execute', authMiddleware, requireRole(UserRoles.ADMIN), async (req: AuthRequest, res: Response) => {
    try {
      const { targets, command, timeout = 30000 } = req.body;
      // targets: [{connection_id, node}, ...]
      
      if (!targets || !Array.isArray(targets) || targets.length === 0) {
        return res.status(400).json({ error: '请提供执行目标列表' });
      }
      
      if (!command) {
        return res.status(400).json({ error: '请提供要执行的命令' });
      }
      
      // 安全检查
      const safetyCheck = isCommandSafe(command);
      if (!safetyCheck.safe) {
        await logUserAction(req.user!.id, req.user!.username, 'batch_shell_blocked', command,
          { targetCount: targets.length, reason: safetyCheck.reason },
          req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
        return res.status(403).json({ error: safetyCheck.reason });
      }
      
      const batchId = generateExecutionId();
      const results: any[] = [];
      
      for (const target of targets) {
        const executionId = generateExecutionId();
        const startTime = Date.now();
        
        try {
          const connection = pveManager.getConnection(target.connection_id);
          if (!connection || connection.status !== 'connected') {
            results.push({
              connection_id: target.connection_id,
              node: target.node,
              success: false,
              error: '连接不可用',
              executionId
            });
            continue;
          }
          
          const result = await pveManager.executeOnConnection(target.connection_id, async (client) => {
            try {
              const response = await (client as any).client.post(
                `/nodes/${target.node}/execute`,
                { 
                  command: command,
                  'timeout': Math.floor(timeout / 1000)
                }
              );
              return response.data.data;
            } catch (err: any) {
              if (err.response?.status === 501 || err.response?.status === 404) {
                throw new Error('节点不支持远程命令执行');
              }
              throw err;
            }
          });
          
          const duration = Date.now() - startTime;
          
          // 记录执行历史
          await database.run(`
            INSERT INTO shell_history (id, user_id, username, connection_id, connection_name, node, command, output, exit_code, duration, batch_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `, [executionId, req.user!.id, req.user!.username, target.connection_id, connection.name, target.node, 
              command, JSON.stringify(result), result?.exitcode || 0, duration, batchId]);
          
          results.push({
            connection_id: target.connection_id,
            connectionName: connection.name,
            node: target.node,
            success: true,
            executionId,
            output: result?.output || result,
            exitCode: result?.exitcode || 0,
            duration
          });
        } catch (err: any) {
          const duration = Date.now() - startTime;
          
          results.push({
            connection_id: target.connection_id,
            node: target.node,
            success: false,
            error: err.message,
            executionId,
            duration
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      await logUserAction(req.user!.id, req.user!.username, 'batch_shell_execute', command,
        { batchId, targetCount: targets.length, successCount, failCount },
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({
        success: true,
        batchId,
        command,
        total: targets.length,
        successCount,
        failCount,
        results
      });
    } catch (error: any) {
      console.error('批量执行命令失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取命令执行历史
  app.get('/api/shell/history', authMiddleware, requireRole(UserRoles.ADMIN, UserRoles.OPERATOR), async (req: AuthRequest, res: Response) => {
    try {
      const { connection_id, node, limit = 50, offset = 0 } = req.query;
      
      let query = 'SELECT * FROM shell_history WHERE 1=1';
      let countQuery = 'SELECT COUNT(*) as total FROM shell_history WHERE 1=1';
      const params: any[] = [];
      const countParams: any[] = [];
      
      // 非管理员只能看自己的历史
      if (req.user!.role !== UserRoles.ADMIN) {
        query += ' AND user_id = ?';
        countQuery += ' AND user_id = ?';
        params.push(req.user!.id);
        countParams.push(req.user!.id);
      }
      
      if (connection_id) {
        query += ' AND connection_id = ?';
        countQuery += ' AND connection_id = ?';
        params.push(connection_id);
        countParams.push(connection_id);
      }
      
      if (node) {
        query += ' AND node = ?';
        countQuery += ' AND node = ?';
        params.push(node);
        countParams.push(node);
      }
      
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit as string), parseInt(offset as string));
      
      const history = await database.query(query, params);
      const totalResult = await database.get(countQuery, countParams);
      
      res.json({
        history,
        total: totalResult.total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      });
    } catch (error: any) {
      console.error('获取执行历史失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取常用命令模板
  app.get('/api/shell/templates', authMiddleware, async (req: AuthRequest, res: Response) => {
    const templates = [
      { name: '系统信息', command: 'uname -a && cat /etc/os-release', category: '系统' },
      { name: 'CPU信息', command: 'lscpu', category: '硬件' },
      { name: '内存使用', command: 'free -h', category: '资源' },
      { name: '磁盘使用', command: 'df -h', category: '资源' },
      { name: '磁盘IO', command: 'iostat -x 1 3', category: '资源' },
      { name: '网络信息', command: 'ip addr', category: '网络' },
      { name: '网络连接', command: 'ss -tunlp', category: '网络' },
      { name: '进程列表', command: 'ps aux --sort=-%mem | head -20', category: '进程' },
      { name: 'PVE版本', command: 'pveversion -v', category: 'PVE' },
      { name: 'PVE存储状态', command: 'pvesm status', category: 'PVE' },
      { name: 'PVE集群状态', command: 'pvecm status', category: 'PVE' },
      { name: 'VM列表', command: 'qm list', category: 'PVE' },
      { name: 'LXC列表', command: 'pct list', category: 'PVE' },
      { name: '系统日志', command: 'journalctl -n 50 --no-pager', category: '日志' },
      { name: '系统负载', command: 'uptime && cat /proc/loadavg', category: '资源' },
      { name: '温度信息', command: 'sensors 2>/dev/null || echo "sensors not installed"', category: '硬件' },
    ];
    
    res.json(templates);
  });

  // 删除执行历史
  app.delete('/api/shell/history/:id', authMiddleware, requireRole(UserRoles.ADMIN), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      const result = await database.run('DELETE FROM shell_history WHERE id = ?', [id]);
      
      if (result.changes > 0) {
        res.json({ success: true, message: '记录已删除' });
      } else {
        res.status(404).json({ error: '记录不存在' });
      }
    } catch (error: any) {
      console.error('删除执行历史失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 清理旧的执行历史
  app.post('/api/shell/cleanup', authMiddleware, requireRole(UserRoles.ADMIN), async (req: AuthRequest, res: Response) => {
    try {
      const { days = 30 } = req.body;
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const result = await database.run(
        'DELETE FROM shell_history WHERE created_at < ?',
        [cutoffDate.toISOString()]
      );
      
      await logUserAction(req.user!.id, req.user!.username, 'shell_cleanup', null,
        { days, deleted: result.changes },
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, deleted: result.changes });
    } catch (error: any) {
      console.error('清理执行历史失败:', error);
      res.status(500).json({ error: error.message });
    }
  });
}
