import { Express, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { PVEManager } from '../services/pve-manager';
import { authMiddleware, requirePermission, AuthRequest, Permissions, logUserAction } from './auth';
import * as fs from 'fs';
import * as path from 'path';

const database = require('../db/database');

// 活跃的VNC会话
const activeSessions: Map<string, {
  userId: string;
  username: string;
  connectionId: string;
  node: string;
  vmid: number;
  vmname: string;
  startTime: Date;
  recordingId?: string;
}> = new Map();

// 生成录屏ID
function generateRecordingId(): string {
  return `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function setupVNCRoutes(app: Express, pveManager: PVEManager, io: SocketIOServer) {
  
  // 获取VNC连接信息
  app.post('/api/pve/connections/:id/vms/:vmid/vnc', authMiddleware, requirePermission(Permissions.VM_CONSOLE), async (req: AuthRequest, res: Response) => {
    try {
      const { id, vmid } = req.params;
      const { node, type } = req.body;
      
      if (!node || !type) {
        return res.status(400).json({ error: '缺少参数: node, type' });
      }
      
      const connection = pveManager.getConnection(id);
      if (!connection || connection.status !== 'connected') {
        return res.status(404).json({ error: '连接不可用' });
      }
      
      // 获取VNC ticket
      const vncInfo = await pveManager.executeOnConnection(id, async (client) => {
        const endpoint = type === 'lxc' 
          ? `/nodes/${node}/lxc/${vmid}/vncproxy`
          : `/nodes/${node}/qemu/${vmid}/vncproxy`;
        
        const response = await (client as any).client.post(endpoint, {
          websocket: 1
        });
        return response.data.data;
      });
      
      // 获取VM名称
      const vmStatus = await pveManager.executeOnConnection(id,
        (client) => client.getVMStatus(node, parseInt(vmid), type as 'qemu' | 'lxc')
      );
      
      // 创建录屏记录
      const recordingId = generateRecordingId();
      const recordingDir = path.join(__dirname, '../../data/recordings');
      if (!fs.existsSync(recordingDir)) {
        fs.mkdirSync(recordingDir, { recursive: true });
      }
      
      const filename = `${recordingId}-${vmid}-${Date.now()}.webm`;
      const filePath = path.join(recordingDir, filename);
      
      await database.run(`
        INSERT INTO vnc_recordings (id, user_id, username, connection_id, connection_name, node, vmid, vmname, filename, file_path, start_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [recordingId, req.user!.id, req.user!.username, id, connection.name, node, parseInt(vmid), vmStatus.name, filename, filePath]);
      
      // 记录会话
      const sessionId = `${id}-${vmid}-${Date.now()}`;
      activeSessions.set(sessionId, {
        userId: req.user!.id,
        username: req.user!.username,
        connectionId: id,
        node,
        vmid: parseInt(vmid),
        vmname: vmStatus.name,
        startTime: new Date(),
        recordingId
      });
      
      await logUserAction(req.user!.id, req.user!.username, 'vnc_connect', `VM ${vmid}`,
        { connectionId: id, node, vmid, vmname: vmStatus.name, sessionId, recordingId },
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({
        success: true,
        ticket: vncInfo.ticket,
        port: vncInfo.port,
        user: vncInfo.user,
        // 返回 PVE 主机信息供前端构建 noVNC URL
        pveHost: connection.config.host,
        pvePort: connection.config.port,
        sessionId,
        recordingId,
        vmname: vmStatus.name
      });
    } catch (error: any) {
      console.error('获取VNC连接信息失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取SPICE连接信息 (另一种远程控制方式)
  app.post('/api/pve/connections/:id/vms/:vmid/spice', authMiddleware, requirePermission(Permissions.VM_CONSOLE), async (req: AuthRequest, res: Response) => {
    try {
      const { id, vmid } = req.params;
      const { node } = req.body;
      
      if (!node) {
        return res.status(400).json({ error: '缺少参数: node' });
      }
      
      const connection = pveManager.getConnection(id);
      if (!connection || connection.status !== 'connected') {
        return res.status(404).json({ error: '连接不可用' });
      }
      
      // 获取SPICE配置
      const spiceInfo = await pveManager.executeOnConnection(id, async (client) => {
        const response = await (client as any).client.post(
          `/nodes/${node}/qemu/${vmid}/spiceproxy`
        );
        return response.data.data;
      });
      
      await logUserAction(req.user!.id, req.user!.username, 'spice_connect', `VM ${vmid}`,
        { connectionId: id, node, vmid },
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({
        success: true,
        ...spiceInfo
      });
    } catch (error: any) {
      console.error('获取SPICE连接信息失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 关闭VNC会话
  app.post('/api/vnc/sessions/:sessionId/close', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { duration } = req.body;
      
      const session = activeSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ error: '会话不存在' });
      }
      
      // 更新录屏记录
      if (session.recordingId) {
        await database.run(`
          UPDATE vnc_recordings 
          SET end_time = CURRENT_TIMESTAMP, duration = ?, status = 'completed'
          WHERE id = ?
        `, [duration || Math.floor((Date.now() - session.startTime.getTime()) / 1000), session.recordingId]);
      }
      
      activeSessions.delete(sessionId);
      
      await logUserAction(req.user!.id, req.user!.username, 'vnc_disconnect', `VM ${session.vmid}`,
        { connectionId: session.connectionId, node: session.node, vmid: session.vmid, sessionId, duration },
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, message: '会话已关闭' });
    } catch (error: any) {
      console.error('关闭VNC会话失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 保存录屏数据
  app.post('/api/vnc/recordings/:recordingId/data', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { recordingId } = req.params;
      const { data, fileSize } = req.body;
      
      const recording = await database.get('SELECT * FROM vnc_recordings WHERE id = ?', [recordingId]);
      if (!recording) {
        return res.status(404).json({ error: '录屏记录不存在' });
      }
      
      // 更新文件大小
      if (fileSize) {
        await database.run(`
          UPDATE vnc_recordings SET file_size = ? WHERE id = ?
        `, [fileSize, recordingId]);
      }
      
      // 这里可以保存录屏数据到文件
      // 实际实现中，前端会通过WebSocket流式传输录屏数据
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('保存录屏数据失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取录屏列表
  app.get('/api/vnc/recordings', authMiddleware, requirePermission(Permissions.LOG_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const { user_id, vmid, connection_id, limit = 50, offset = 0 } = req.query;
      
      let query = 'SELECT * FROM vnc_recordings WHERE 1=1';
      let countQuery = 'SELECT COUNT(*) as total FROM vnc_recordings WHERE 1=1';
      const params: any[] = [];
      const countParams: any[] = [];
      
      if (user_id) {
        query += ' AND user_id = ?';
        countQuery += ' AND user_id = ?';
        params.push(user_id);
        countParams.push(user_id);
      }
      
      if (vmid) {
        query += ' AND vmid = ?';
        countQuery += ' AND vmid = ?';
        params.push(parseInt(vmid as string));
        countParams.push(parseInt(vmid as string));
      }
      
      if (connection_id) {
        query += ' AND connection_id = ?';
        countQuery += ' AND connection_id = ?';
        params.push(connection_id);
        countParams.push(connection_id);
      }
      
      query += ' ORDER BY start_time DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit as string), parseInt(offset as string));
      
      const recordings = await database.query(query, params);
      const totalResult = await database.get(countQuery, countParams);
      
      res.json({
        recordings,
        total: totalResult.total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      });
    } catch (error: any) {
      console.error('获取录屏列表失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 删除录屏
  app.delete('/api/vnc/recordings/:recordingId', authMiddleware, requirePermission(Permissions.LOG_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const { recordingId } = req.params;
      
      const recording = await database.get('SELECT * FROM vnc_recordings WHERE id = ?', [recordingId]);
      if (!recording) {
        return res.status(404).json({ error: '录屏记录不存在' });
      }
      
      // 删除文件
      if (recording.file_path && fs.existsSync(recording.file_path)) {
        fs.unlinkSync(recording.file_path);
      }
      
      // 删除数据库记录
      await database.run('DELETE FROM vnc_recordings WHERE id = ?', [recordingId]);
      
      await logUserAction(req.user!.id, req.user!.username, 'delete_recording', recordingId,
        { vmid: recording.vmid, filename: recording.filename },
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, message: '录屏已删除' });
    } catch (error: any) {
      console.error('删除录屏失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取活跃VNC会话
  app.get('/api/vnc/sessions', authMiddleware, requirePermission(Permissions.LOG_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const sessions = Array.from(activeSessions.entries()).map(([id, session]) => ({
        id,
        ...session,
        duration: Math.floor((Date.now() - session.startTime.getTime()) / 1000)
      }));
      
      res.json(sessions);
    } catch (error: any) {
      console.error('获取活跃VNC会话失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 清理过期录屏 (7天)
  const cleanupOldRecordings = async () => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      
      // 获取要删除的录屏
      const oldRecordings = await database.query(`
        SELECT * FROM vnc_recordings 
        WHERE start_time < ? AND status = 'completed'
      `, [cutoffDate.toISOString()]);
      
      for (const recording of oldRecordings) {
        // 删除文件
        if (recording.file_path && fs.existsSync(recording.file_path)) {
          fs.unlinkSync(recording.file_path);
        }
      }
      
      // 删除数据库记录
      const result = await database.run(`
        DELETE FROM vnc_recordings 
        WHERE start_time < ? AND status = 'completed'
      `, [cutoffDate.toISOString()]);
      
      if (result.changes > 0) {
        console.log(`已清理 ${result.changes} 条过期录屏记录`);
      }
    } catch (error) {
      console.error('清理过期录屏失败:', error);
    }
  };

  // 每天执行一次清理
  setInterval(cleanupOldRecordings, 24 * 60 * 60 * 1000);
  
  // 启动时也执行一次
  setTimeout(cleanupOldRecordings, 10000);
}

// 导出活跃会话供WebSocket使用
export { activeSessions };
