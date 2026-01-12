import { Express, Response } from 'express';
import { PVEManager } from '../services/pve-manager';
import { authMiddleware, requirePermission, AuthRequest, Permissions, logUserAction } from './auth';

export function setupBatchRoutes(app: Express, pveManager: PVEManager) {
  
  // 批量VM操作
  app.post('/api/batch/vms/action', authMiddleware, requirePermission(Permissions.VM_START, Permissions.VM_STOP), async (req: AuthRequest, res: Response) => {
    try {
      const { action, vms } = req.body;
      // vms: [{connection_id, node, vmid, type}, ...]
      
      if (!action || !['start', 'stop', 'shutdown', 'restart'].includes(action)) {
        return res.status(400).json({ error: '无效的操作类型，支持: start, stop, shutdown, restart' });
      }
      
      if (!vms || !Array.isArray(vms) || vms.length === 0) {
        return res.status(400).json({ error: '请提供要操作的虚拟机列表' });
      }
      
      const results: any[] = [];
      
      for (const vm of vms) {
        try {
          const connection = pveManager.getConnection(vm.connection_id);
          if (!connection || connection.status !== 'connected') {
            results.push({
              connection_id: vm.connection_id,
              node: vm.node,
              vmid: vm.vmid,
              success: false,
              error: '连接不可用'
            });
            continue;
          }
          
          // 获取当前VM状态
          const vmStatus = await pveManager.executeOnConnection(vm.connection_id,
            (client) => client.getVMStatus(vm.node, vm.vmid, vm.type)
          );
          
          let taskId: string | null = null;
          let skipped = false;
          
          switch (action) {
            case 'start':
              if (vmStatus.status === 'stopped') {
                taskId = await pveManager.executeOnConnection(vm.connection_id,
                  (client) => client.startVM(vm.node, vm.vmid, vm.type)
                );
              } else {
                skipped = true;
              }
              break;
            case 'stop':
              if (vmStatus.status === 'running') {
                taskId = await pveManager.executeOnConnection(vm.connection_id,
                  (client) => client.stopVM(vm.node, vm.vmid, vm.type)
                );
              } else {
                skipped = true;
              }
              break;
            case 'shutdown':
              if (vmStatus.status === 'running') {
                taskId = await pveManager.executeOnConnection(vm.connection_id,
                  (client) => client.shutdownVM(vm.node, vm.vmid, vm.type)
                );
              } else {
                skipped = true;
              }
              break;
            case 'restart':
              if (vmStatus.status === 'running') {
                await pveManager.executeOnConnection(vm.connection_id,
                  (client) => client.shutdownVM(vm.node, vm.vmid, vm.type)
                );
                // 延迟启动
                setTimeout(async () => {
                  try {
                    await pveManager.executeOnConnection(vm.connection_id,
                      (client) => client.startVM(vm.node, vm.vmid, vm.type)
                    );
                  } catch (e) {
                    console.error(`重启 VM ${vm.vmid} 失败:`, e);
                  }
                }, 10000);
                taskId = 'restart-scheduled';
              } else {
                skipped = true;
              }
              break;
          }
          
          results.push({
            connection_id: vm.connection_id,
            node: vm.node,
            vmid: vm.vmid,
            vmname: vmStatus.name,
            success: true,
            taskId,
            skipped,
            previousStatus: vmStatus.status
          });
          
        } catch (err: any) {
          results.push({
            connection_id: vm.connection_id,
            node: vm.node,
            vmid: vm.vmid,
            success: false,
            error: err.message
          });
        }
      }
      
      const successCount = results.filter(r => r.success && !r.skipped).length;
      const skippedCount = results.filter(r => r.success && r.skipped).length;
      const failCount = results.filter(r => !r.success).length;
      
      await logUserAction(req.user!.id, req.user!.username, 'batch_vm_action', null,
        { action, total: vms.length, successCount, skippedCount, failCount },
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({
        success: true,
        action,
        total: vms.length,
        successCount,
        skippedCount,
        failCount,
        results
      });
    } catch (error: any) {
      console.error('批量VM操作失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取批量操作状态
  app.post('/api/batch/vms/status', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { vms } = req.body;
      // vms: [{connection_id, node, vmid, type}, ...]
      
      if (!vms || !Array.isArray(vms) || vms.length === 0) {
        return res.status(400).json({ error: '请提供虚拟机列表' });
      }
      
      const results: any[] = [];
      
      for (const vm of vms) {
        try {
          const connection = pveManager.getConnection(vm.connection_id);
          if (!connection || connection.status !== 'connected') {
            results.push({
              connection_id: vm.connection_id,
              node: vm.node,
              vmid: vm.vmid,
              status: 'disconnected',
              error: '连接不可用'
            });
            continue;
          }
          
          const vmStatus = await pveManager.executeOnConnection(vm.connection_id,
            (client) => client.getVMStatus(vm.node, vm.vmid, vm.type)
          );
          
          results.push({
            connection_id: vm.connection_id,
            node: vm.node,
            vmid: vm.vmid,
            vmname: vmStatus.name,
            status: vmStatus.status,
            uptime: vmStatus.uptime,
            cpu: vmStatus.cpu,
            mem: vmStatus.mem,
            maxmem: vmStatus.maxmem
          });
          
        } catch (err: any) {
          results.push({
            connection_id: vm.connection_id,
            node: vm.node,
            vmid: vm.vmid,
            status: 'error',
            error: err.message
          });
        }
      }
      
      res.json({
        success: true,
        results
      });
    } catch (error: any) {
      console.error('获取批量VM状态失败:', error);
      res.status(500).json({ error: error.message });
    }
  });
}
