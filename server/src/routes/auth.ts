import { Express, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const database = require('../db/database');

// JWT 密钥
const JWT_SECRET = process.env.JWT_SECRET || 'pve-manager-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// 用户角色权限
export const UserRoles = {
  ADMIN: 'admin',
  OPERATOR: 'operator', 
  VIEWER: 'viewer',
  USER: 'user'
} as const;

// 权限定义
export const Permissions = {
  // 用户管理
  USER_VIEW: 'user:view',
  USER_CREATE: 'user:create',
  USER_EDIT: 'user:edit',
  USER_DELETE: 'user:delete',
  // 虚拟机管理
  VM_VIEW: 'vm:view',
  VM_START: 'vm:start',
  VM_STOP: 'vm:stop',
  VM_DELETE: 'vm:delete',
  VM_CONSOLE: 'vm:console',
  // 备份管理
  BACKUP_VIEW: 'backup:view',
  BACKUP_CREATE: 'backup:create',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_DELETE: 'backup:delete',
  // 分组管理
  GROUP_VIEW: 'group:view',
  GROUP_CREATE: 'group:create',
  GROUP_EDIT: 'group:edit',
  GROUP_DELETE: 'group:delete',
  // 日志管理
  LOG_VIEW: 'log:view',
  LOG_EXPORT: 'log:export',
  // 连接管理
  CONNECTION_VIEW: 'connection:view',
  CONNECTION_CREATE: 'connection:create',
  CONNECTION_EDIT: 'connection:edit',
  CONNECTION_DELETE: 'connection:delete',
} as const;

// 角色权限映射
const RolePermissions: Record<string, string[]> = {
  [UserRoles.ADMIN]: Object.values(Permissions), // 管理员拥有所有权限
  [UserRoles.OPERATOR]: [
    Permissions.VM_VIEW, Permissions.VM_START, Permissions.VM_STOP, Permissions.VM_CONSOLE,
    Permissions.BACKUP_VIEW, Permissions.BACKUP_CREATE, Permissions.BACKUP_RESTORE,
    Permissions.GROUP_VIEW, Permissions.GROUP_CREATE, Permissions.GROUP_EDIT,
    Permissions.LOG_VIEW, Permissions.CONNECTION_VIEW
  ],
  [UserRoles.USER]: [
    Permissions.VM_VIEW, Permissions.VM_START, Permissions.VM_STOP, Permissions.VM_CONSOLE,
    Permissions.BACKUP_VIEW, Permissions.GROUP_VIEW, Permissions.CONNECTION_VIEW
  ],
  [UserRoles.VIEWER]: [
    Permissions.VM_VIEW, Permissions.BACKUP_VIEW, Permissions.GROUP_VIEW, 
    Permissions.LOG_VIEW, Permissions.CONNECTION_VIEW
  ]
};

// 扩展 Request 类型
export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
    permissions: string[];
  };
}

// 生成用户ID
function generateUserId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 生成会话ID
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 记录用户操作日志
async function logUserAction(
  userId: string | null,
  username: string | null,
  action: string,
  target: string | null,
  details: any,
  ip: string | null,
  userAgent: string | null
) {
  try {
    await database.run(`
      INSERT INTO user_logs (user_id, username, action, target, details, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [userId, username, action, target, JSON.stringify(details), ip, userAgent]);
  } catch (error) {
    console.error('记录用户日志失败:', error);
  }
}

// JWT 认证中间件
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.id,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role,
      permissions: RolePermissions[decoded.role] || []
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: '无效的认证令牌' });
  }
}

// 可选认证中间件 (不强制要求登录)
export function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = {
        id: decoded.id,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role,
        permissions: RolePermissions[decoded.role] || []
      };
    } catch (error) {
      // 忽略无效token
    }
  }
  next();
}

// 权限检查中间件
export function requirePermission(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: '未登录' });
    }
    
    const hasPermission = permissions.some(p => req.user!.permissions.includes(p));
    if (!hasPermission) {
      return res.status(403).json({ error: '权限不足' });
    }
    
    next();
  };
}

// 角色检查中间件
export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: '未登录' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    
    next();
  };
}

// 导出日志记录函数供其他模块使用
export { logUserAction };

export function setupAuthRoutes(app: Express) {
  
  // 初始化默认管理员账户
  const initDefaultAdmin = async () => {
    try {
      const admin = await database.get('SELECT * FROM users WHERE username = ?', ['admin']);
      if (!admin) {
        const passwordHash = await bcrypt.hash('admin123', 10);
        await database.run(`
          INSERT INTO users (id, username, password_hash, email, role, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [generateUserId(), 'admin', passwordHash, 'admin@localhost', UserRoles.ADMIN, 'active']);
        console.log('默认管理员账户已创建 (用户名: admin, 密码: admin123)');
      }
    } catch (error) {
      console.error('初始化默认管理员失败:', error);
    }
  };
  
  // 数据库就绪后初始化管理员
  if (database.isReady) {
    initDefaultAdmin();
  } else {
    database.once('ready', initDefaultAdmin);
  }

  // 用户登录
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
      }
      
      const user = await database.get('SELECT * FROM users WHERE username = ?', [username]);
      
      if (!user) {
        await logUserAction(null, username, 'login_failed', null, { reason: '用户不存在' }, 
          req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
        return res.status(401).json({ error: '用户名或密码错误' });
      }
      
      if (user.status !== 'active') {
        await logUserAction(user.id, username, 'login_failed', null, { reason: '账户已禁用' },
          req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
        return res.status(403).json({ error: '账户已被禁用' });
      }
      
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        await logUserAction(user.id, username, 'login_failed', null, { reason: '密码错误' },
          req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
        return res.status(401).json({ error: '用户名或密码错误' });
      }
      
      // 生成 JWT
      const token = jwt.sign(
        { id: user.id, username: user.username, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      // 更新最后登录时间
      const clientIp = req.ip || req.socket.remoteAddress || null;
      await database.run(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP, last_login_ip = ? WHERE id = ?',
        [clientIp, user.id]
      );
      
      // 保存会话
      const sessionId = generateSessionId();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await database.run(`
        INSERT INTO user_sessions (id, user_id, token, ip, user_agent, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [sessionId, user.id, token, clientIp, req.headers['user-agent'] || null, expiresAt]);
      
      // 记录登录日志
      await logUserAction(user.id, username, 'login', null, { sessionId },
        clientIp, req.headers['user-agent'] || null);
      
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          permissions: RolePermissions[user.role] || []
        }
      });
    } catch (error: any) {
      console.error('登录失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 用户登出
  app.post('/api/auth/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      // 删除会话
      await database.run('DELETE FROM user_sessions WHERE token = ?', [token]);
      
      // 记录登出日志
      await logUserAction(req.user!.id, req.user!.username, 'logout', null, {},
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, message: '已登出' });
    } catch (error: any) {
      console.error('登出失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取当前用户信息
  app.get('/api/auth/me', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const user = await database.get(
        'SELECT id, username, email, role, status, created_at, last_login, last_login_ip FROM users WHERE id = ?',
        [req.user!.id]
      );
      
      if (!user) {
        return res.status(404).json({ error: '用户不存在' });
      }
      
      res.json({
        ...user,
        permissions: RolePermissions[user.role] || []
      });
    } catch (error: any) {
      console.error('获取用户信息失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 修改密码
  app.post('/api/auth/change-password', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: '当前密码和新密码不能为空' });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ error: '新密码长度不能少于6位' });
      }
      
      const user = await database.get('SELECT * FROM users WHERE id = ?', [req.user!.id]);
      
      const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValidPassword) {
        await logUserAction(req.user!.id, req.user!.username, 'change_password_failed', null,
          { reason: '当前密码错误' }, req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
        return res.status(401).json({ error: '当前密码错误' });
      }
      
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await database.run(
        'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newPasswordHash, req.user!.id]
      );
      
      await logUserAction(req.user!.id, req.user!.username, 'change_password', null, {},
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, message: '密码修改成功' });
    } catch (error: any) {
      console.error('修改密码失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========== 用户管理 API (仅管理员) ==========

  // 获取用户列表
  app.get('/api/users', authMiddleware, requireRole(UserRoles.ADMIN), async (req: AuthRequest, res: Response) => {
    try {
      const { role, status, limit = 100, offset = 0 } = req.query;
      
      let query = 'SELECT id, username, email, role, status, created_at, last_login, last_login_ip FROM users WHERE 1=1';
      const params: any[] = [];
      
      if (role) {
        query += ' AND role = ?';
        params.push(role);
      }
      
      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }
      
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit as string), parseInt(offset as string));
      
      const users = await database.query(query, params);
      const total = await database.get('SELECT COUNT(*) as count FROM users');
      
      res.json({ users, total: total.count });
    } catch (error: any) {
      console.error('获取用户列表失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 创建用户
  app.post('/api/users', authMiddleware, requireRole(UserRoles.ADMIN), async (req: AuthRequest, res: Response) => {
    try {
      const { username, password, email, role } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
      }
      
      if (password.length < 6) {
        return res.status(400).json({ error: '密码长度不能少于6位' });
      }
      
      const existingUser = await database.get('SELECT id FROM users WHERE username = ?', [username]);
      if (existingUser) {
        return res.status(400).json({ error: '用户名已存在' });
      }
      
      const passwordHash = await bcrypt.hash(password, 10);
      const userId = generateUserId();
      
      await database.run(`
        INSERT INTO users (id, username, password_hash, email, role, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `, [userId, username, passwordHash, email || null, role || UserRoles.USER]);
      
      await logUserAction(req.user!.id, req.user!.username, 'create_user', username,
        { userId, role: role || UserRoles.USER }, req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, id: userId, message: '用户创建成功' });
    } catch (error: any) {
      console.error('创建用户失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 更新用户
  app.put('/api/users/:id', authMiddleware, requireRole(UserRoles.ADMIN), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { email, role, status, password } = req.body;
      
      const user = await database.get('SELECT * FROM users WHERE id = ?', [id]);
      if (!user) {
        return res.status(404).json({ error: '用户不存在' });
      }
      
      // 不允许修改自己的角色和状态
      if (id === req.user!.id && (role || status)) {
        return res.status(400).json({ error: '不能修改自己的角色或状态' });
      }
      
      let updateFields: string[] = [];
      let updateParams: any[] = [];
      
      if (email !== undefined) {
        updateFields.push('email = ?');
        updateParams.push(email);
      }
      
      if (role) {
        updateFields.push('role = ?');
        updateParams.push(role);
      }
      
      if (status) {
        updateFields.push('status = ?');
        updateParams.push(status);
      }
      
      if (password) {
        if (password.length < 6) {
          return res.status(400).json({ error: '密码长度不能少于6位' });
        }
        const passwordHash = await bcrypt.hash(password, 10);
        updateFields.push('password_hash = ?');
        updateParams.push(passwordHash);
      }
      
      if (updateFields.length === 0) {
        return res.status(400).json({ error: '没有要更新的字段' });
      }
      
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateParams.push(id);
      
      await database.run(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
        updateParams
      );
      
      await logUserAction(req.user!.id, req.user!.username, 'update_user', user.username,
        { changes: { email, role, status, passwordChanged: !!password } },
        req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, message: '用户更新成功' });
    } catch (error: any) {
      console.error('更新用户失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 删除用户
  app.delete('/api/users/:id', authMiddleware, requireRole(UserRoles.ADMIN), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      if (id === req.user!.id) {
        return res.status(400).json({ error: '不能删除自己的账户' });
      }
      
      const user = await database.get('SELECT * FROM users WHERE id = ?', [id]);
      if (!user) {
        return res.status(404).json({ error: '用户不存在' });
      }
      
      await database.run('DELETE FROM users WHERE id = ?', [id]);
      
      await logUserAction(req.user!.id, req.user!.username, 'delete_user', user.username,
        { deletedUserId: id }, req.ip || req.socket.remoteAddress || null, req.headers['user-agent'] || null);
      
      res.json({ success: true, message: '用户删除成功' });
    } catch (error: any) {
      console.error('删除用户失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取角色列表
  app.get('/api/roles', authMiddleware, async (req: AuthRequest, res: Response) => {
    res.json({
      roles: Object.values(UserRoles),
      permissions: Permissions,
      rolePermissions: RolePermissions
    });
  });
}

// 导出给其他模块使用的中间件
export const authenticateToken = authMiddleware;

// 简化的权限检查 - 根据权限名称
export function requirePermissionByName(permissionName: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: '未登录' });
    }
    
    // 管理员拥有所有权限
    if (req.user.role === UserRoles.ADMIN) {
      return next();
    }
    
    // 检查特定权限
    const permissionMap: Record<string, string[]> = {
      'manage_tasks': [UserRoles.ADMIN, UserRoles.OPERATOR],
      'view_tasks': [UserRoles.ADMIN, UserRoles.OPERATOR, UserRoles.USER, UserRoles.VIEWER],
      'vm_control': [UserRoles.ADMIN, UserRoles.OPERATOR, UserRoles.USER],
      'console': [UserRoles.ADMIN, UserRoles.OPERATOR, UserRoles.USER],
      'backup': [UserRoles.ADMIN, UserRoles.OPERATOR],
      'restore': [UserRoles.ADMIN, UserRoles.OPERATOR],
    };
    
    const allowedRoles = permissionMap[permissionName];
    if (allowedRoles && allowedRoles.includes(req.user.role)) {
      return next();
    }
    
    return res.status(403).json({ error: '权限不足' });
  };
}

// 日志记录函数包装器
export async function logAction(req: AuthRequest, action: string, target: string | null, details: any) {
  const userId = req.user?.id || null;
  const username = req.user?.username || null;
  const ip = req.ip || (req.socket?.remoteAddress as string) || null;
  const userAgent = req.headers['user-agent'] || null;
  await logUserAction(userId, username, action, target, details, ip, userAgent);
}
