import { Express, Response } from 'express';
import { PVEManager } from '../services/pve-manager';
import { authMiddleware, requirePermission, AuthRequest, Permissions, logUserAction } from './auth';

export function setupBackupRoutes(app: Express, pveManager: PVEManager) {
  
  // 获取所有备份列表
  app.get('/api/backups', authMiddleware, requirePermission(Permissions.BACKUP_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const { connection_id, storage } = req.query;
      
      const allBackups: any[] = [];
      const connections = connection_id 
        ? [pveManager.getConnection(connection_id as string)].filter(Boolean)
        : pveManager.getAllConnections();
      
      for (const connection of connections) {
        if (!connection || connection.status !== 'connected') continue;
        
        try {
          // 获取节点列表
          const nodes = await pveManager.executeOnConnection(connection.id,
            (client) => client.getNodes()
          );
          
          for (const node of nodes) {
            try {
              // 获取存储列表
              const storages = await pveManager.executeOnConnection(connection.id,
                (client) => client.getStorages(node.node)
              );
              
              // 筛选支持备份的存储
              const backupStorages = storages.filter((s: any) => 
                s.content && s.content.includes('backup')
              );
              
              for (const store of backupStorages) {
                if (storage && store.storage !== storage) continue;
                
                try {
                  // 获取备份内容
                  const contents = await pveManager.executeOnConnection(connection.id,
                    async (client) => {
                      const response = await (client as any).client.get(
                        `/nodes/${node.node}/storage/${store.storage}/content`,
                        { params: { content: 'backup' } }
                      );
                      return response.data.data;
                    }
                  );
                  
                  for (const backup of contents) {
                    allBackups.push({
                      ...backup,
                      connectionId: connection.id,
                      connectionName: connection.name,
                      node: node.node,
                      storage: store.storage
                    });
                  }
                } catch (err) {
                  console.error(`获取存储 ${store.storage} 备份失败:`, err);
                }
              }
            } catch (err) {
              console.error(`获取节点 ${node.node} 存储失败:`, err);
            }
          }
        } catch (err) {
          console.error(`获取连接 ${connection.id} 备份失败:`, err);
        }
      }
      
      // 按创建时间排序
      allBackups.sort((a, b) => (b.ctime || 0) - (a.ctime || 0));
      
      res.json(allBackups);
    } catch (error: any) {
      console.error('获取备份列表失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取特定连接的备份存储列表
  app.get('/api/pve/connections/:id/backup-storages', authMiddleware, requirePermission(Permissions.BACKUP_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      const connection = pveManager.getConnection(id);
      if (!connection || connection.status !== 'connected') {
        return res.status(404).json({ error: '连接不可用' });
      }
      
      const nodes = await pveManager.executeOnConnection(id, (client) => client.getNodes());
      const result: any[] = [];
      
      for (const node of nodes) {
        const storages = await pveManager.executeOnConnection(id,
          (client) => client.getStorages(node.node)
        );
        
        const backupStorages = storages.filter((s: any) => 
          s.content && s.content.includes('backup')
        );
        
        for (const storage of backupStorages) {
          result.push({
            ...storage,
            node: node.node
          });
        }
      }
      
      res.json(result);
    } catch (error: any) {
      console.error('获取备份存储失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 创建VM备份
  app.post('/api/pve/connections/:id/vms/:vmid/backup', authMiddleware, requirePermission(Permissions.BACKUP_CREATE), async (req: AuthRequest, res: Response) => {
    try {
      const { id, vmid } = req.params;
      const { node, type, storage, mode = 'snapshot', compress = 'zstd', notes } = req.body;
      
      if (!node || !type || !storage) {
        return res.status(400).json({ error: '缺少参数: node, type, storage' });
      }
      
      const connection = pveManager.getConnection(id);
      if (!connection || connection.status !== 'connected') {
        return res.status(404).json({ error: '连接不可用' });
      }
      
      // 调用PVE API创建备份
      const taskId = await pveManager.executeOnConnection(id, async (client) => {
        const response = await (client as any).client.post(
          `/nodes/${node}/vzdump`,
          {
            vmid: parseInt(vmid),
            storage,
            mode, // snapshot, suspend, stop
            compress,
            notes: notes || `Backup created by PVE Manager at ${new Date().toISOString()}`
          }
        );
        return response.data.data;
      });
      
      await logUserAction(req.user!.id, req.user!.username, 'create_backup', `VM ${vmid}`,
        { connectionId: id, node, vmid, storage, mode, taskId },
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, taskId, message: '备份任务已启动' });
    } catch (error: any) {
      console.error('创建备份失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 恢复VM备份
  app.post('/api/pve/connections/:id/backups/restore', authMiddleware, requirePermission(Permissions.BACKUP_RESTORE), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { node, volid, vmid, storage, unique = true } = req.body;
      
      if (!node || !volid) {
        return res.status(400).json({ error: '缺少参数: node, volid' });
      }
      
      const connection = pveManager.getConnection(id);
      if (!connection || connection.status !== 'connected') {
        return res.status(404).json({ error: '连接不可用' });
      }
      
      // 从volid解析备份类型
      const isLxc = volid.includes('lxc') || volid.includes('ct');
      
      // 调用PVE API恢复备份
      const taskId = await pveManager.executeOnConnection(id, async (client) => {
        if (isLxc) {
          // LXC容器恢复
          const response = await (client as any).client.post(
            `/nodes/${node}/lxc`,
            {
              vmid: vmid || undefined,
              ostemplate: volid,
              storage: storage || 'local',
              restore: 1,
              unique: unique ? 1 : 0
            }
          );
          return response.data.data;
        } else {
          // QEMU虚拟机恢复
          const response = await (client as any).client.post(
            `/nodes/${node}/qemu`,
            {
              vmid: vmid || undefined,
              archive: volid,
              storage: storage || 'local',
              unique: unique ? 1 : 0
            }
          );
          return response.data.data;
        }
      });
      
      await logUserAction(req.user!.id, req.user!.username, 'restore_backup', volid,
        { connectionId: id, node, volid, vmid, taskId },
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, taskId, message: '恢复任务已启动' });
    } catch (error: any) {
      console.error('恢复备份失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 删除备份
  app.delete('/api/pve/connections/:id/backups/:volid', authMiddleware, requirePermission(Permissions.BACKUP_DELETE), async (req: AuthRequest, res: Response) => {
    try {
      const { id, volid } = req.params;
      const { node, storage } = req.query;
      
      if (!node || !storage) {
        return res.status(400).json({ error: '缺少参数: node, storage' });
      }
      
      const connection = pveManager.getConnection(id);
      if (!connection || connection.status !== 'connected') {
        return res.status(404).json({ error: '连接不可用' });
      }
      
      // 调用PVE API删除备份
      await pveManager.executeOnConnection(id, async (client) => {
        const response = await (client as any).client.delete(
          `/nodes/${node}/storage/${storage}/content/${volid}`
        );
        return response.data.data;
      });
      
      await logUserAction(req.user!.id, req.user!.username, 'delete_backup', volid,
        { connectionId: id, node, storage, volid },
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, message: '备份已删除' });
    } catch (error: any) {
      console.error('删除备份失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取备份任务状态
  app.get('/api/pve/connections/:id/tasks/:upid', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id, upid } = req.params;
      const { node } = req.query;
      
      if (!node) {
        return res.status(400).json({ error: '缺少参数: node' });
      }
      
      const connection = pveManager.getConnection(id);
      if (!connection || connection.status !== 'connected') {
        return res.status(404).json({ error: '连接不可用' });
      }
      
      const status = await pveManager.executeOnConnection(id,
        (client) => client.getTaskStatus(node as string, upid)
      );
      
      res.json(status);
    } catch (error: any) {
      console.error('获取任务状态失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 批量创建备份
  app.post('/api/batch/backups', authMiddleware, requirePermission(Permissions.BACKUP_CREATE), async (req: AuthRequest, res: Response) => {
    try {
      const { vms, storage, mode = 'snapshot', compress = 'zstd' } = req.body;
      // vms: [{connection_id, node, vmid, type}, ...]
      
      if (!vms || !Array.isArray(vms) || vms.length === 0) {
        return res.status(400).json({ error: '请提供要备份的虚拟机列表' });
      }
      
      if (!storage) {
        return res.status(400).json({ error: '请指定备份存储' });
      }
      
      const results: any[] = [];
      
      for (const vm of vms) {
        try {
          const connection = pveManager.getConnection(vm.connection_id);
          if (!connection || connection.status !== 'connected') {
            results.push({
              connection_id: vm.connection_id,
              vmid: vm.vmid,
              success: false,
              error: '连接不可用'
            });
            continue;
          }
          
          const taskId = await pveManager.executeOnConnection(vm.connection_id, async (client) => {
            const response = await (client as any).client.post(
              `/nodes/${vm.node}/vzdump`,
              {
                vmid: vm.vmid,
                storage,
                mode,
                compress,
                notes: `Batch backup by PVE Manager at ${new Date().toISOString()}`
              }
            );
            return response.data.data;
          });
          
          results.push({
            connection_id: vm.connection_id,
            node: vm.node,
            vmid: vm.vmid,
            success: true,
            taskId
          });
        } catch (err: any) {
          results.push({
            connection_id: vm.connection_id,
            vmid: vm.vmid,
            success: false,
            error: err.message
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      await logUserAction(req.user!.id, req.user!.username, 'batch_create_backup', null,
        { total: vms.length, successCount, failCount, storage, mode },
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({
        success: true,
        total: vms.length,
        successCount,
        failCount,
        results
      });
    } catch (error: any) {
      console.error('批量备份失败:', error);
      res.status(500).json({ error: error.message });
    }
  });
}
