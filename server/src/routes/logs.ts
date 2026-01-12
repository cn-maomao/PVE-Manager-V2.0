import { Express, Response } from 'express';
import { authMiddleware, requireRole, requirePermission, AuthRequest, UserRoles, Permissions } from './auth';

const database = require('../db/database');

export function setupLogRoutes(app: Express) {
  
  // 获取操作日志列表
  app.get('/api/logs', authMiddleware, requirePermission(Permissions.LOG_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const { 
        user_id, 
        username,
        action, 
        target,
        start_date, 
        end_date, 
        limit = 100, 
        offset = 0 
      } = req.query;
      
      let query = 'SELECT * FROM user_logs WHERE 1=1';
      let countQuery = 'SELECT COUNT(*) as total FROM user_logs WHERE 1=1';
      const params: any[] = [];
      const countParams: any[] = [];
      
      if (user_id) {
        query += ' AND user_id = ?';
        countQuery += ' AND user_id = ?';
        params.push(user_id);
        countParams.push(user_id);
      }
      
      if (username) {
        query += ' AND username LIKE ?';
        countQuery += ' AND username LIKE ?';
        params.push(`%${username}%`);
        countParams.push(`%${username}%`);
      }
      
      if (action) {
        query += ' AND action = ?';
        countQuery += ' AND action = ?';
        params.push(action);
        countParams.push(action);
      }
      
      if (target) {
        query += ' AND target LIKE ?';
        countQuery += ' AND target LIKE ?';
        params.push(`%${target}%`);
        countParams.push(`%${target}%`);
      }
      
      if (start_date) {
        query += ' AND created_at >= ?';
        countQuery += ' AND created_at >= ?';
        params.push(start_date);
        countParams.push(start_date);
      }
      
      if (end_date) {
        query += ' AND created_at <= ?';
        countQuery += ' AND created_at <= ?';
        params.push(end_date);
        countParams.push(end_date);
      }
      
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit as string), parseInt(offset as string));
      
      const logs = await database.query(query, params);
      const totalResult = await database.get(countQuery, countParams);
      
      // 解析 details JSON
      const formattedLogs = logs.map((log: any) => ({
        ...log,
        details: log.details ? JSON.parse(log.details) : null
      }));
      
      res.json({ 
        logs: formattedLogs, 
        total: totalResult.total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      });
    } catch (error: any) {
      console.error('获取操作日志失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取日志统计
  app.get('/api/logs/stats', authMiddleware, requirePermission(Permissions.LOG_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const { days = 7 } = req.query;
      
      // 获取各类操作统计
      const actionStats = await database.query(`
        SELECT action, COUNT(*) as count 
        FROM user_logs 
        WHERE created_at >= datetime('now', '-${days} days')
        GROUP BY action 
        ORDER BY count DESC
      `);
      
      // 获取活跃用户统计
      const userStats = await database.query(`
        SELECT username, COUNT(*) as count 
        FROM user_logs 
        WHERE created_at >= datetime('now', '-${days} days') AND username IS NOT NULL
        GROUP BY username 
        ORDER BY count DESC 
        LIMIT 10
      `);
      
      // 获取每日操作趋势
      const dailyTrend = await database.query(`
        SELECT date(created_at) as date, COUNT(*) as count 
        FROM user_logs 
        WHERE created_at >= datetime('now', '-${days} days')
        GROUP BY date(created_at) 
        ORDER BY date
      `);
      
      // 获取登录失败统计
      const loginFailures = await database.query(`
        SELECT ip, COUNT(*) as count 
        FROM user_logs 
        WHERE action = 'login_failed' AND created_at >= datetime('now', '-${days} days')
        GROUP BY ip 
        ORDER BY count DESC 
        LIMIT 10
      `);
      
      res.json({
        actionStats,
        userStats,
        dailyTrend,
        loginFailures,
        days: parseInt(days as string)
      });
    } catch (error: any) {
      console.error('获取日志统计失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取操作类型列表
  app.get('/api/logs/actions', authMiddleware, requirePermission(Permissions.LOG_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const actions = await database.query(`
        SELECT DISTINCT action FROM user_logs ORDER BY action
      `);
      
      res.json(actions.map((a: any) => a.action));
    } catch (error: any) {
      console.error('获取操作类型列表失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 导出日志 (仅管理员)
  app.get('/api/logs/export', authMiddleware, requireRole(UserRoles.ADMIN), async (req: AuthRequest, res: Response) => {
    try {
      const { start_date, end_date, format = 'json' } = req.query;
      
      let query = 'SELECT * FROM user_logs WHERE 1=1';
      const params: any[] = [];
      
      if (start_date) {
        query += ' AND created_at >= ?';
        params.push(start_date);
      }
      
      if (end_date) {
        query += ' AND created_at <= ?';
        params.push(end_date);
      }
      
      query += ' ORDER BY created_at DESC';
      
      const logs = await database.query(query, params);
      
      // 解析 details JSON
      const formattedLogs = logs.map((log: any) => ({
        ...log,
        details: log.details ? JSON.parse(log.details) : null
      }));
      
      if (format === 'csv') {
        // 生成 CSV
        const headers = ['ID', '用户ID', '用户名', '操作', '目标', '详情', 'IP', '用户代理', '时间'];
        const rows = formattedLogs.map((log: any) => [
          log.id,
          log.user_id || '',
          log.username || '',
          log.action,
          log.target || '',
          JSON.stringify(log.details) || '',
          log.ip || '',
          log.user_agent || '',
          log.created_at
        ]);
        
        const csv = [headers.join(','), ...rows.map((r: any[]) => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=logs-${new Date().toISOString().slice(0,10)}.csv`);
        res.send('\uFEFF' + csv); // 添加 BOM 以支持 Excel 打开中文
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=logs-${new Date().toISOString().slice(0,10)}.json`);
        res.json(formattedLogs);
      }
    } catch (error: any) {
      console.error('导出日志失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 清理旧日志 (仅管理员)
  app.delete('/api/logs/cleanup', authMiddleware, requireRole(UserRoles.ADMIN), async (req: AuthRequest, res: Response) => {
    try {
      const { days = 90 } = req.body;
      
      const result = await database.run(`
        DELETE FROM user_logs WHERE created_at < datetime('now', '-${days} days')
      `);
      
      res.json({ 
        success: true, 
        deleted: result.changes,
        message: `已删除 ${result.changes} 条 ${days} 天前的日志` 
      });
    } catch (error: any) {
      console.error('清理旧日志失败:', error);
      res.status(500).json({ error: error.message });
    }
  });
}
