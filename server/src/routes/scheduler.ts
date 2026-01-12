import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// 内存中的定时器管理
const taskTimers: Map<string, NodeJS.Timeout> = new Map();

// 辅助函数：解析 cron 表达式获取下次执行时间
function getNextRunTime(cronExpression: string, scheduledTime?: string): Date {
  const now = new Date();
  
  // 简化的 cron 解析，支持常见模式
  // 格式: minute hour dayOfMonth month dayOfWeek
  const parts = cronExpression.split(' ');
  
  if (parts.length !== 5) {
    // 如果有指定时间，使用指定时间
    if (scheduledTime) {
      const [hours, minutes] = scheduledTime.split(':').map(Number);
      const next = new Date(now);
      next.setHours(hours, minutes, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    }
    // 默认下一分钟
    return new Date(now.getTime() + 60000);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const next = new Date(now);
  
  // 解析小时和分钟
  const targetMinute = minute === '*' ? now.getMinutes() : parseInt(minute);
  const targetHour = hour === '*' ? now.getHours() : parseInt(hour);
  
  next.setHours(targetHour, targetMinute, 0, 0);
  
  // 如果时间已过，设置为明天
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  
  // 处理星期几
  if (dayOfWeek !== '*') {
    const targetDays = dayOfWeek.split(',').map(d => parseInt(d));
    while (!targetDays.includes(next.getDay())) {
      next.setDate(next.getDate() + 1);
    }
  }
  
  return next;
}

// 执行任务
async function executeTask(db: any, pveService: any, task: any) {
  const startTime = new Date();
  let status = 'success';
  let error = null;
  let details: any = { results: [] };

  try {
    const targetDetails = JSON.parse(task.target_details || '{}');
    
    if (task.target_type === 'vm') {
      // 单个虚拟机操作
      const { connectionId, node, vmid, type } = targetDetails;
      const connection = await db.get('SELECT * FROM pve_connections WHERE id = ?', [connectionId]);
      
      if (connection) {
        await pveService.vmAction(connection, vmid, node, type, task.action);
        details.results.push({ vmid, status: 'success' });
      }
    } else if (task.target_type === 'group') {
      // 分组操作
      const members = await db.query(
        `SELECT m.*, c.host, c.port, c.username, c.token_id, c.token_secret, c.name as connection_name
         FROM vm_group_members m
         JOIN pve_connections c ON m.connection_id = c.id
         WHERE m.group_id = ?`,
        [task.target_id]
      );
      
      for (const member of members) {
        try {
          const connection = {
            id: member.connection_id,
            host: member.host,
            port: member.port,
            username: member.username,
            token_id: member.token_id,
            token_secret: member.token_secret,
          };
          await pveService.vmAction(connection, member.vmid, member.node, 'qemu', task.action);
          details.results.push({ vmid: member.vmid, node: member.node, status: 'success' });
        } catch (err: any) {
          details.results.push({ vmid: member.vmid, node: member.node, status: 'failed', error: err.message });
        }
      }
    } else if (task.target_type === 'backup') {
      // 备份任务
      const { connectionId, node, vmid, storage, mode, compress } = targetDetails;
      const connection = await db.get('SELECT * FROM pve_connections WHERE id = ?', [connectionId]);
      
      if (connection) {
        await pveService.createBackup(connection, node, vmid, storage, mode, compress);
        details.results.push({ vmid, status: 'success', action: 'backup' });
      }
    }

    // 检查是否有失败的
    const failedCount = details.results.filter((r: any) => r.status === 'failed').length;
    if (failedCount > 0) {
      status = 'partial';
    }
  } catch (err: any) {
    status = 'failed';
    error = err.message;
    console.error(`Task ${task.id} execution failed:`, err);
  }

  const endTime = new Date();
  const duration = endTime.getTime() - startTime.getTime();

  // 记录执行历史
  await db.run(
    `INSERT INTO task_history (task_id, task_name, action, status, details, error, started_at, completed_at, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [task.id, task.name, task.action, status, JSON.stringify(details), error, startTime.toISOString(), endTime.toISOString(), duration]
  );

  // 更新任务状态
  const nextRun = task.schedule_type === 'once' ? null : getNextRunTime(task.cron_expression, task.scheduled_time);
  await db.run(
    `UPDATE scheduled_tasks 
     SET last_run = ?, last_status = ?, last_error = ?, next_run = ?, run_count = run_count + 1, updated_at = ?
     WHERE id = ?`,
    [startTime.toISOString(), status, error, nextRun?.toISOString(), new Date().toISOString(), task.id]
  );

  // 如果是一次性任务，禁用它
  if (task.schedule_type === 'once') {
    await db.run('UPDATE scheduled_tasks SET enabled = 0 WHERE id = ?', [task.id]);
  }

  return { status, error, details };
}

// 调度单个任务
function scheduleTask(db: any, pveService: any, task: any) {
  // 取消现有定时器
  if (taskTimers.has(task.id)) {
    clearTimeout(taskTimers.get(task.id));
    taskTimers.delete(task.id);
  }

  if (!task.enabled) return;

  const nextRun = task.next_run ? new Date(task.next_run) : getNextRunTime(task.cron_expression, task.scheduled_time);
  const delay = nextRun.getTime() - Date.now();

  if (delay < 0) {
    // 已过期，计算下一次
    const newNextRun = getNextRunTime(task.cron_expression, task.scheduled_time);
    db.run('UPDATE scheduled_tasks SET next_run = ? WHERE id = ?', [newNextRun.toISOString(), task.id]);
    scheduleTask(db, pveService, { ...task, next_run: newNextRun.toISOString() });
    return;
  }

  // 设置定时器（最长24小时，超过的话每天重新检查）
  const maxDelay = 24 * 60 * 60 * 1000;
  const actualDelay = Math.min(delay, maxDelay);

  const timer = setTimeout(async () => {
    if (delay > maxDelay) {
      // 还没到时间，重新调度
      scheduleTask(db, pveService, task);
    } else {
      // 执行任务
      await executeTask(db, pveService, task);
      
      // 重新调度（如果是周期性任务）
      if (task.schedule_type !== 'once') {
        const updatedTask = await db.get('SELECT * FROM scheduled_tasks WHERE id = ?', [task.id]);
        if (updatedTask && updatedTask.enabled) {
          scheduleTask(db, pveService, updatedTask);
        }
      }
    }
  }, actualDelay);

  taskTimers.set(task.id, timer);
  console.log(`Task ${task.name} scheduled for ${nextRun.toISOString()}`);
}

// 初始化调度器
export async function initScheduler(db: any, pveService: any) {
  try {
    const tasks = await db.query('SELECT * FROM scheduled_tasks WHERE enabled = 1');
    
    for (const task of tasks) {
      scheduleTask(db, pveService, task);
    }
    
    console.log(`Scheduler initialized with ${tasks.length} active tasks`);
  } catch (error) {
    console.error('Failed to initialize scheduler:', error);
  }
}

// 路由处理函数
export function createSchedulerRoutes(db: any, authenticateToken: any, requirePermission: any, logAction: any, pveService: any) {
  
  // 获取所有调度任务
  router.get('/tasks', authenticateToken, async (req: Request, res: Response) => {
    try {
      const { status, type } = req.query;
      let sql = 'SELECT * FROM scheduled_tasks';
      const params: any[] = [];
      const conditions: string[] = [];
      
      if (status === 'enabled') {
        conditions.push('enabled = 1');
      } else if (status === 'disabled') {
        conditions.push('enabled = 0');
      }
      
      if (type) {
        conditions.push('task_type = ?');
        params.push(type);
      }
      
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      
      sql += ' ORDER BY created_at DESC';
      
      const tasks = await db.query(sql, params);
      res.json({ success: true, tasks });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 获取单个任务
  router.get('/tasks/:id', authenticateToken, async (req: Request, res: Response) => {
    try {
      const task = await db.get('SELECT * FROM scheduled_tasks WHERE id = ?', [req.params.id]);
      
      if (!task) {
        return res.status(404).json({ success: false, error: '任务不存在' });
      }
      
      res.json({ success: true, task });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 创建调度任务
  router.post('/tasks', authenticateToken, requirePermission('manage_tasks'), async (req: Request, res: Response) => {
    try {
      const {
        name,
        task_type,
        action,
        target_type,
        target_id,
        target_details,
        schedule_type,
        cron_expression,
        scheduled_time,
        timezone,
      } = req.body;
      
      if (!name || !task_type || !action || !target_type || !target_id || !schedule_type) {
        return res.status(400).json({ success: false, error: '缺少必要参数' });
      }
      
      const id = uuidv4();
      const now = new Date().toISOString();
      const nextRun = getNextRunTime(cron_expression || '0 0 * * *', scheduled_time);
      
      await db.run(
        `INSERT INTO scheduled_tasks 
         (id, name, task_type, action, target_type, target_id, target_details, schedule_type, cron_expression, scheduled_time, timezone, next_run, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, task_type, action, target_type, target_id, JSON.stringify(target_details), schedule_type, cron_expression, scheduled_time, timezone || 'Asia/Shanghai', nextRun.toISOString(), (req as any).user.id, now, now]
      );
      
      const task = await db.get('SELECT * FROM scheduled_tasks WHERE id = ?', [id]);
      
      // 调度任务
      scheduleTask(db, pveService, task);
      
      await logAction(req, 'create_task', task.name, { taskId: id, type: task_type, action });
      
      res.json({ success: true, task });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 更新调度任务
  router.put('/tasks/:id', authenticateToken, requirePermission('manage_tasks'), async (req: Request, res: Response) => {
    try {
      const {
        name,
        task_type,
        action,
        target_type,
        target_id,
        target_details,
        schedule_type,
        cron_expression,
        scheduled_time,
        timezone,
        enabled,
      } = req.body;
      
      const existingTask = await db.get('SELECT * FROM scheduled_tasks WHERE id = ?', [req.params.id]);
      if (!existingTask) {
        return res.status(404).json({ success: false, error: '任务不存在' });
      }
      
      const nextRun = getNextRunTime(cron_expression || existingTask.cron_expression, scheduled_time || existingTask.scheduled_time);
      
      await db.run(
        `UPDATE scheduled_tasks SET
         name = COALESCE(?, name),
         task_type = COALESCE(?, task_type),
         action = COALESCE(?, action),
         target_type = COALESCE(?, target_type),
         target_id = COALESCE(?, target_id),
         target_details = COALESCE(?, target_details),
         schedule_type = COALESCE(?, schedule_type),
         cron_expression = COALESCE(?, cron_expression),
         scheduled_time = COALESCE(?, scheduled_time),
         timezone = COALESCE(?, timezone),
         enabled = COALESCE(?, enabled),
         next_run = ?,
         updated_at = ?
         WHERE id = ?`,
        [name, task_type, action, target_type, target_id, target_details ? JSON.stringify(target_details) : null, schedule_type, cron_expression, scheduled_time, timezone, enabled, nextRun.toISOString(), new Date().toISOString(), req.params.id]
      );
      
      const task = await db.get('SELECT * FROM scheduled_tasks WHERE id = ?', [req.params.id]);
      
      // 重新调度
      scheduleTask(db, pveService, task);
      
      await logAction(req, 'update_task', task.name, { taskId: req.params.id });
      
      res.json({ success: true, task });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 删除调度任务
  router.delete('/tasks/:id', authenticateToken, requirePermission('manage_tasks'), async (req: Request, res: Response) => {
    try {
      const task = await db.get('SELECT * FROM scheduled_tasks WHERE id = ?', [req.params.id]);
      if (!task) {
        return res.status(404).json({ success: false, error: '任务不存在' });
      }
      
      // 取消定时器
      if (taskTimers.has(req.params.id)) {
        clearTimeout(taskTimers.get(req.params.id));
        taskTimers.delete(req.params.id);
      }
      
      await db.run('DELETE FROM scheduled_tasks WHERE id = ?', [req.params.id]);
      
      await logAction(req, 'delete_task', task.name, { taskId: req.params.id });
      
      res.json({ success: true, message: '任务已删除' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 启用/禁用任务
  router.post('/tasks/:id/toggle', authenticateToken, requirePermission('manage_tasks'), async (req: Request, res: Response) => {
    try {
      const task = await db.get('SELECT * FROM scheduled_tasks WHERE id = ?', [req.params.id]);
      if (!task) {
        return res.status(404).json({ success: false, error: '任务不存在' });
      }
      
      const newEnabled = task.enabled ? 0 : 1;
      const nextRun = newEnabled ? getNextRunTime(task.cron_expression, task.scheduled_time) : null;
      
      await db.run(
        'UPDATE scheduled_tasks SET enabled = ?, next_run = ?, updated_at = ? WHERE id = ?',
        [newEnabled, nextRun?.toISOString(), new Date().toISOString(), req.params.id]
      );
      
      const updatedTask = await db.get('SELECT * FROM scheduled_tasks WHERE id = ?', [req.params.id]);
      
      // 重新调度或取消
      if (newEnabled) {
        scheduleTask(db, pveService, updatedTask);
      } else if (taskTimers.has(req.params.id)) {
        clearTimeout(taskTimers.get(req.params.id));
        taskTimers.delete(req.params.id);
      }
      
      await logAction(req, newEnabled ? 'enable_task' : 'disable_task', task.name, { taskId: req.params.id });
      
      res.json({ success: true, task: updatedTask });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 手动执行任务
  router.post('/tasks/:id/run', authenticateToken, requirePermission('manage_tasks'), async (req: Request, res: Response) => {
    try {
      const task = await db.get('SELECT * FROM scheduled_tasks WHERE id = ?', [req.params.id]);
      if (!task) {
        return res.status(404).json({ success: false, error: '任务不存在' });
      }
      
      const result = await executeTask(db, pveService, task);
      
      await logAction(req, 'run_task', task.name, { taskId: req.params.id, result });
      
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 获取任务执行历史
  router.get('/tasks/:id/history', authenticateToken, async (req: Request, res: Response) => {
    try {
      const { limit = 20, offset = 0 } = req.query;
      
      const history = await db.query(
        `SELECT * FROM task_history WHERE task_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
        [req.params.id, parseInt(limit as string), parseInt(offset as string)]
      );
      
      const countResult = await db.get('SELECT COUNT(*) as total FROM task_history WHERE task_id = ?', [req.params.id]);
      
      res.json({ success: true, history, total: countResult.total });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 获取所有执行历史
  router.get('/history', authenticateToken, async (req: Request, res: Response) => {
    try {
      const { limit = 50, offset = 0, status } = req.query;
      
      let sql = 'SELECT h.*, t.name as task_name FROM task_history h LEFT JOIN scheduled_tasks t ON h.task_id = t.id';
      const params: any[] = [];
      
      if (status) {
        sql += ' WHERE h.status = ?';
        params.push(status);
      }
      
      sql += ' ORDER BY h.started_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit as string), parseInt(offset as string));
      
      const history = await db.query(sql, params);
      
      let countSql = 'SELECT COUNT(*) as total FROM task_history';
      if (status) {
        countSql += ' WHERE status = ?';
      }
      const countResult = await db.get(countSql, status ? [status] : []);
      
      res.json({ success: true, history, total: countResult.total });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

export default router;
