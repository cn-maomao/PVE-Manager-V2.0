import { Express, Response } from 'express';
import { PVEManager } from '../services/pve-manager';
import { authMiddleware, optionalAuthMiddleware, requirePermission, AuthRequest, Permissions, logUserAction } from './auth';

const database = require('../db/database');

// 生成分组ID
function generateGroupId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function setupGroupRoutes(app: Express, pveManager: PVEManager) {
  
  // 获取所有分组
  app.get('/api/groups', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const groups = await database.query(`
        SELECT g.*, 
          (SELECT COUNT(*) FROM vm_group_members WHERE group_id = g.id) as member_count
        FROM vm_groups g
        ORDER BY g.created_at DESC
      `);
      
      res.json(groups);
    } catch (error: any) {
      console.error('获取分组列表失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取分组详情（包含成员）
  app.get('/api/groups/:id', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      const group = await database.get('SELECT * FROM vm_groups WHERE id = ?', [id]);
      if (!group) {
        return res.status(404).json({ error: '分组不存在' });
      }
      
      const members = await database.query(`
        SELECT * FROM vm_group_members WHERE group_id = ?
      `, [id]);
      
      // 获取成员VM的详细信息
      const memberDetails = [];
      for (const member of members) {
        try {
          const connection = pveManager.getConnection(member.connection_id);
          if (connection && connection.status === 'connected') {
            const vms = await pveManager.executeOnConnection(member.connection_id, 
              (client) => client.getVMs(member.node)
            );
            const vm = vms.find((v: any) => v.vmid === member.vmid);
            if (vm) {
              memberDetails.push({
                ...member,
                vmname: vm.name,
                vmstatus: vm.status,
                vmtype: vm.type,
                connectionName: connection.name
              });
            } else {
              memberDetails.push({
                ...member,
                vmname: 'Unknown',
                vmstatus: 'unknown',
                vmtype: 'unknown',
                connectionName: connection.name
              });
            }
          } else {
            memberDetails.push({
              ...member,
              vmname: 'Unknown',
              vmstatus: 'disconnected',
              vmtype: 'unknown',
              connectionName: 'Disconnected'
            });
          }
        } catch (err) {
          memberDetails.push({
            ...member,
            vmname: 'Error',
            vmstatus: 'error',
            vmtype: 'unknown',
            connectionName: 'Error'
          });
        }
      }
      
      res.json({
        ...group,
        members: memberDetails
      });
    } catch (error: any) {
      console.error('获取分组详情失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 创建分组
  app.post('/api/groups', authMiddleware, requirePermission(Permissions.GROUP_CREATE), async (req: AuthRequest, res: Response) => {
    try {
      const { name, description, color } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: '分组名称不能为空' });
      }
      
      const groupId = generateGroupId();
      
      await database.run(`
        INSERT INTO vm_groups (id, name, description, color, user_id)
        VALUES (?, ?, ?, ?, ?)
      `, [groupId, name, description || null, color || '#1890ff', req.user!.id]);
      
      await logUserAction(req.user!.id, req.user!.username, 'create_group', name,
        { groupId }, req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, id: groupId, message: '分组创建成功' });
    } catch (error: any) {
      console.error('创建分组失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 更新分组
  app.put('/api/groups/:id', authMiddleware, requirePermission(Permissions.GROUP_EDIT), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, color } = req.body;
      
      const group = await database.get('SELECT * FROM vm_groups WHERE id = ?', [id]);
      if (!group) {
        return res.status(404).json({ error: '分组不存在' });
      }
      
      await database.run(`
        UPDATE vm_groups SET name = ?, description = ?, color = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [name || group.name, description !== undefined ? description : group.description, 
          color || group.color, id]);
      
      await logUserAction(req.user!.id, req.user!.username, 'update_group', group.name,
        { groupId: id, changes: { name, description, color } },
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, message: '分组更新成功' });
    } catch (error: any) {
      console.error('更新分组失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 删除分组
  app.delete('/api/groups/:id', authMiddleware, requirePermission(Permissions.GROUP_DELETE), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      const group = await database.get('SELECT * FROM vm_groups WHERE id = ?', [id]);
      if (!group) {
        return res.status(404).json({ error: '分组不存在' });
      }
      
      await database.run('DELETE FROM vm_groups WHERE id = ?', [id]);
      
      await logUserAction(req.user!.id, req.user!.username, 'delete_group', group.name,
        { groupId: id }, req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, message: '分组删除成功' });
    } catch (error: any) {
      console.error('删除分组失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 添加VM到分组
  app.post('/api/groups/:id/members', authMiddleware, requirePermission(Permissions.GROUP_EDIT), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { members } = req.body; // [{connection_id, node, vmid}, ...]
      
      const group = await database.get('SELECT * FROM vm_groups WHERE id = ?', [id]);
      if (!group) {
        return res.status(404).json({ error: '分组不存在' });
      }
      
      if (!members || !Array.isArray(members) || members.length === 0) {
        return res.status(400).json({ error: '请提供要添加的虚拟机列表' });
      }
      
      let added = 0;
      let skipped = 0;
      
      for (const member of members) {
        try {
          await database.run(`
            INSERT OR IGNORE INTO vm_group_members (group_id, connection_id, node, vmid)
            VALUES (?, ?, ?, ?)
          `, [id, member.connection_id, member.node, member.vmid]);
          added++;
        } catch (err) {
          skipped++;
        }
      }
      
      await logUserAction(req.user!.id, req.user!.username, 'add_group_members', group.name,
        { groupId: id, added, skipped }, req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, added, skipped, message: `已添加 ${added} 个虚拟机到分组` });
    } catch (error: any) {
      console.error('添加分组成员失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 从分组移除VM
  app.delete('/api/groups/:id/members', authMiddleware, requirePermission(Permissions.GROUP_EDIT), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { members } = req.body; // [{connection_id, node, vmid}, ...]
      
      const group = await database.get('SELECT * FROM vm_groups WHERE id = ?', [id]);
      if (!group) {
        return res.status(404).json({ error: '分组不存在' });
      }
      
      if (!members || !Array.isArray(members) || members.length === 0) {
        return res.status(400).json({ error: '请提供要移除的虚拟机列表' });
      }
      
      let removed = 0;
      
      for (const member of members) {
        const result = await database.run(`
          DELETE FROM vm_group_members 
          WHERE group_id = ? AND connection_id = ? AND node = ? AND vmid = ?
        `, [id, member.connection_id, member.node, member.vmid]);
        removed += result.changes;
      }
      
      await logUserAction(req.user!.id, req.user!.username, 'remove_group_members', group.name,
        { groupId: id, removed }, req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, removed, message: `已从分组移除 ${removed} 个虚拟机` });
    } catch (error: any) {
      console.error('移除分组成员失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 批量操作分组内的VM
  app.post('/api/groups/:id/batch-action', authMiddleware, requirePermission(Permissions.VM_START, Permissions.VM_STOP), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { action } = req.body; // start, stop, shutdown, restart
      
      const group = await database.get('SELECT * FROM vm_groups WHERE id = ?', [id]);
      if (!group) {
        return res.status(404).json({ error: '分组不存在' });
      }
      
      const members = await database.query(`
        SELECT * FROM vm_group_members WHERE group_id = ?
      `, [id]);
      
      if (members.length === 0) {
        return res.status(400).json({ error: '分组内没有虚拟机' });
      }
      
      const results: any[] = [];
      
      for (const member of members) {
        try {
          const connection = pveManager.getConnection(member.connection_id);
          if (!connection || connection.status !== 'connected') {
            results.push({
              connection_id: member.connection_id,
              node: member.node,
              vmid: member.vmid,
              success: false,
              error: '连接不可用'
            });
            continue;
          }
          
          // 获取VM信息
          const vms = await pveManager.executeOnConnection(member.connection_id, 
            (client) => client.getVMs(member.node)
          );
          const vm = vms.find((v: any) => v.vmid === member.vmid);
          
          if (!vm) {
            results.push({
              connection_id: member.connection_id,
              node: member.node,
              vmid: member.vmid,
              success: false,
              error: '虚拟机不存在'
            });
            continue;
          }
          
          // 执行操作
          let taskId: string | null = null;
          
          switch (action) {
            case 'start':
              if (vm.status === 'stopped') {
                taskId = await pveManager.executeOnConnection(member.connection_id,
                  (client) => client.startVM(member.node, member.vmid, vm.type)
                );
              }
              break;
            case 'stop':
              if (vm.status === 'running') {
                taskId = await pveManager.executeOnConnection(member.connection_id,
                  (client) => client.stopVM(member.node, member.vmid, vm.type)
                );
              }
              break;
            case 'shutdown':
              if (vm.status === 'running') {
                taskId = await pveManager.executeOnConnection(member.connection_id,
                  (client) => client.shutdownVM(member.node, member.vmid, vm.type)
                );
              }
              break;
            case 'restart':
              if (vm.status === 'running') {
                // 先关机再开机
                await pveManager.executeOnConnection(member.connection_id,
                  (client) => client.shutdownVM(member.node, member.vmid, vm.type)
                );
                // 等待一段时间后启动
                setTimeout(async () => {
                  try {
                    await pveManager.executeOnConnection(member.connection_id,
                      (client) => client.startVM(member.node, member.vmid, vm.type)
                    );
                  } catch (e) {
                    console.error('重启虚拟机失败:', e);
                  }
                }, 10000);
                taskId = 'restart-scheduled';
              }
              break;
          }
          
          results.push({
            connection_id: member.connection_id,
            node: member.node,
            vmid: member.vmid,
            vmname: vm.name,
            success: true,
            taskId,
            previousStatus: vm.status
          });
          
        } catch (err: any) {
          results.push({
            connection_id: member.connection_id,
            node: member.node,
            vmid: member.vmid,
            success: false,
            error: err.message
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      await logUserAction(req.user!.id, req.user!.username, 'batch_action_group', group.name,
        { groupId: id, action, successCount, failCount },
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({
        success: true,
        action,
        total: members.length,
        successCount,
        failCount,
        results
      });
    } catch (error: any) {
      console.error('批量操作分组失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取VM所属的分组
  app.get('/api/vm-groups', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { connection_id, node, vmid } = req.query;
      
      if (!connection_id || !vmid) {
        return res.status(400).json({ error: '缺少参数: connection_id, vmid' });
      }
      
      const groups = await database.query(`
        SELECT g.* FROM vm_groups g
        INNER JOIN vm_group_members m ON g.id = m.group_id
        WHERE m.connection_id = ? AND m.node = ? AND m.vmid = ?
      `, [connection_id, node, parseInt(vmid as string)]);
      
      res.json(groups);
    } catch (error: any) {
      console.error('获取VM分组失败:', error);
      res.status(500).json({ error: error.message });
    }
  });
}
