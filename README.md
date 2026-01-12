# 🚀 PVE Manager V2.0 - Proxmox VE 管理与监控平台

<div align="center">

![PVE Manager Logo](https://img.shields.io/badge/PVE-Manager_V2.0-blue?style=for-the-badge&logo=proxmox)

一个现代化的 **Proxmox VE** 管理和监控平台，提供美观的 Web 界面来管理多个 PVE 集群。

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-ready-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/react-18.3-blue.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/node.js-18+-green.svg)](https://nodejs.org/)

[🚀 快速开始](#快速开始) • [📖 功能特性](#功能特性) • [🔧 配置说明](#配置说明) • [🤝 贡献](#贡献)

</div>

---

## 🙏 致谢

本项目基于 [Dream0057/PVE-MGMT](https://github.com/Dream0057/PVE-MGMT) 开发，感谢原作者的开源贡献！

V2.0 版本在原项目基础上进行了大量功能扩展和优化。

**项目地址**: [https://github.com/cn-maomao/PVE-Manager-V2.0](https://github.com/cn-maomao/PVE-Manager-V2.0)

---

## ✨ V2.0 新功能

### 🔐 多用户权限管理
- 四种用户角色：管理员 / 操作员 / 普通用户 / 查看者
- 基于角色的权限控制
- 用户登录/登出管理
- 会话管理和安全控制
- **默认账户**: admin / admin123

### 🏛️ 批量操作
- 批量启动/关机/强制关机/重启虚拟机
- 多选模式和全选功能
- 操作确认和结果反馈

### 📁 虚拟机分组
- 创建和管理 VM 分组
- 按分组批量操作
- 分组颜色标识
- 跨节点分组支持

### 💾 备份管理
- 创建虚拟机备份
- 备份列表查看
- 备份恢复功能
- 备份删除管理
- 支持多种备份模式（快照/挂起/停止）

### 🖥️ VNC 远程控制
- 网页端虚拟机控制台
- VNC 会话管理
- 支持全屏模式

### ⏰ 定时任务调度
- 定时开关机任务
- 定时备份任务
- 支持每日/每周/一次性调度
- 任务执行历史记录
- 手动触发执行

### 📝 操作日志审计
- 完整的操作记录
- 用户行为追踪
- 日志筛选和导出
- 操作统计分析

### ⚙️ 系统设置
- 告警规则配置
- 数据保留设置
- 安全策略配置
- 数据维护功能

---

## 功能特性

### ✅ 已实现功能

| 功能模块 | 描述 |
|---------|------|
| 🔐 **用户权限管理** | 多用户、多角色权限控制系统 |
| 🖥️ **多PVE连接管理** | 支持同时管理多个 Proxmox VE 集群 |
| 💻 **虚拟机管理** | 启动、停止、重启、挂起、删除虚拟机和容器 |
| 🏛️ **批量操作** | 批量启动/关机/重启多个虚拟机 |
| 📁 **VM分组管理** | 虚拟机分组和分组批量操作 |
| 💾 **备份管理** | 虚拟机备份和恢复 |
| 🖥️ **VNC远程控制** | 网页端虚拟机控制台 |
| ⏰ **定时任务** | 定时开关机、定时备份 |
| 📝 **操作日志** | 完整的操作审计记录 |
| 📊 **实时监控** | CPU、内存、存储使用率监控 |
| 📈 **资源统计** | 图表展示资源使用趋势 |
| 🌐 **流量监控** | VM网络流量实时监控 |
| 🔔 **告警系统** | 多级别告警管理和自动解决 |
| ⚡ **WebSocket** | 实时状态更新 |
| ⚙️ **系统设置** | 告警、安全、数据维护配置 |

---

## 技术栈

### 后端
- **Node.js 18+** + **Express** + **TypeScript**
- **Socket.IO** (实时通信)
- **SQLite** (数据存储)
- **JWT** (身份认证)
- **bcrypt** (密码加密)
- **Axios** (HTTP客户端)

### 前端
- **React 18** + **TypeScript** + **Vite**
- **Ant Design 5** (UI组件库)
- **Recharts** (图表库)
- **Socket.IO Client** (实时通信)
- **Day.js** (时间处理)

---

## 项目结构

```
PVE-Manager-V2.0/
├── server/                    # 后端服务
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts       # 🆕 认证和用户管理
│   │   │   ├── logs.ts       # 🆕 操作日志
│   │   │   ├── groups.ts     # 🆕 VM分组管理
│   │   │   ├── batch.ts      # 🆕 批量操作
│   │   │   ├── backup.ts     # 🆕 备份管理
│   │   │   ├── vnc.ts        # 🆕 VNC远程控制
│   │   │   ├── scheduler.ts  # 🆕 定时任务
│   │   │   ├── pve.ts        # PVE管理API
│   │   │   ├── alerts.ts     # 告警系统
│   │   │   └── traffic.ts    # 流量监控
│   │   ├── services/         # 业务逻辑
│   │   ├── db/               # 数据库
│   │   └── server.ts         # 服务器入口
│   └── data/                  # SQLite数据库
├── client/                    # 前端应用
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx         # 🆕 登录页面
│   │   │   ├── Users.tsx         # 🆕 用户管理
│   │   │   ├── VMGroups.tsx      # 🆕 VM分组
│   │   │   ├── Logs.tsx          # 🆕 操作日志
│   │   │   ├── Backups.tsx       # 🆕 备份管理
│   │   │   ├── ScheduledTasks.tsx # 🆕 定时任务
│   │   │   ├── Settings.tsx      # 🆕 系统设置
│   │   │   └── ...
│   │   ├── components/
│   │   │   └── VNCConsole.tsx    # 🆕 VNC控制台
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx   # 🆕 认证上下文
│   │   │   └── PVEContext.tsx
│   │   └── App.tsx
│   └── package.json
├── start.sh                   # Linux/macOS启动脚本
├── start.ps1                  # 🆕 Windows启动脚本
└── README.md
```

---

## 快速开始

### 🎯 一键启动

```bash
# 克隆项目
git clone https://github.com/cn-maomao/PVE-Manager-V2.0.git
cd PVE-Manager-V2.0

# Linux/macOS
./start.sh

# Windows PowerShell
.\start.ps1
```

首次运行会自动：
1. ✅ 检查系统环境
2. ✅ 引导配置网络参数
3. ✅ 安装所有依赖 
4. ✅ 构建和启动项目
5. ✅ 创建默认管理员账户

### 📌 默认账户

```
用户名: admin
密码: admin123
```

> ⚠️ **重要**: 首次登录后请立即修改默认密码！

### 环境要求
- Node.js 18+ 
- npm 8+
- 一个或多个 Proxmox VE 服务器

### 启动脚本参数

**Linux/macOS (start.sh)**

```bash
./start.sh              # 正常启动
./start.sh --init       # 重新初始化配置
./start.sh --reset      # 重置所有配置
./start.sh --reset-db   # 重置数据库（删除所有数据）
./start.sh --help       # 显示帮助信息
```

**Windows (start.ps1)**

```powershell
.\start.ps1             # 正常启动
.\start.ps1 -Init       # 重新初始化配置
.\start.ps1 -Reset      # 重置所有配置
.\start.ps1 -ResetDB    # 重置数据库（删除所有数据）
.\start.ps1 -Help       # 显示帮助信息
```

### 手动安装依赖（可选）

```bash
# 安装根项目依赖
npm install

# 安装服务器依赖
cd server && npm install

# 安装客户端依赖
cd ../client && npm install
```

### 🚀 快速启动（推荐）

**新的一键启动方式** - 包含项目初始化和配置：

```bash
# 一键启动（首次运行会自动进入配置向导）
./start.sh

# 重新配置项目参数
./start.sh --init

# 重置所有配置
./start.sh --reset
```

启动脚本会自动：
- 检查系统依赖
- 初始化项目配置（首次运行）
- 安装所需依赖
- 构建项目
- 启动前后端服务

### 传统启动方式

#### 配置API服务器地址

如果使用传统方式启动，需要先配置API地址：

```bash
# 使用自动配置脚本
./configure-ip.sh                    # 交互式配置
./configure-ip.sh 192.168.1.100      # 直接设置服务器IP
./configure-ip.sh --auto             # 自动检测本机IP
```

#### 开发模式启动

```bash
# 在项目根目录运行，会同时启动前后端
npm run dev
```

或者分别启动：

```bash
# 启动后端服务 (端口3000)
npm run dev:server

# 启动前端开发服务器 (端口5173)
npm run dev:client
```

### 生产模式部署

```bash
# 构建项目
npm run build

# 启动生产服务器
npm start
```

## 使用说明

### 1. 添加PVE连接

**重要**: 根据你的部署方式访问相应的地址：
- 同机器部署: `http://localhost:5173`
- 跨机器部署: `http://服务器IP:5173` (例如: `http://192.168.1.100:5173`)

1. 访问前端页面
2. 点击侧边栏"PVE连接"
3. 点击"添加连接"按钮
4. 填写PVE服务器信息：
   - 连接名称: 自定义名称
   - 主机地址: PVE服务器IP
   - 端口: 默认8006
   - 用户名: root 或其他管理员用户
   - 密码: PVE登录密码
   - 认证域: 默认pam
   - 使用SSL: 建议开启

### 2. 管理虚拟机
1. 点击侧边栏"虚拟机"
2. 查看所有连接的虚拟机列表
3. 使用操作按钮管理VM：
   - ▶️ 启动VM
   - ⏸️ 关闭VM
   - ⏹️ 强制停止
   - ⏸️ 挂起 (仅QEMU)
   - 🗑️ 删除 (仅停止状态)

### 3. 查看监控数据
1. 点击侧边栏"监控"
2. 查看资源使用统计
3. 观察实时使用趋势图表

### 4. 🆕 告警系统管理
1. 点击侧边栏"系统告警"
2. 查看告警统计概览：
   - 总告警数、严重告警、警告告警、活跃告警
3. 使用筛选器过滤告警：
   - 按等级筛选: 全部/严重/警告/信息
   - 按类型筛选: 全部/PVE系统/性能/网络/服务
   - 按状态筛选: 全部/活跃/已确认/已解决
4. 告警操作：
   - 👁️ 查看详情: 查看告警完整信息和时间线
   - ✅ 确认告警: 标记告警为已确认状态
   - ✅ 解决告警: 标记告警为已解决状态
   - 🗑️ 删除告警: 永久删除告警记录

#### 自动告警监控
系统每2分钟自动检查以下项目并生成告警：
- **PVE连接状态**: 连接断开时生成严重告警
- **节点状态**: 节点离线时生成严重告警
- **磁盘使用率**: 
  - 超过90%生成严重告警
  - 超过80%生成警告告警
- **内存使用率**:
  - 超过95%生成严重告警
  - 超过85%生成警告告警
- **CPU使用率**: 超过90%生成警告告警
- **VM状态异常**: VM处于异常状态时生成警告告警

#### 自动告警解决
当监控到问题恢复时，系统会自动将相关告警标记为已解决：
- PVE连接恢复
- 节点重新上线
- 资源使用率降低到安全范围

## API 接口

### PVE连接管理
- `GET /api/pve/connections` - 获取所有连接
- `POST /api/pve/connections` - 添加新连接
- `DELETE /api/pve/connections/:id` - 删除连接
- `POST /api/pve/connections/:id/test` - 测试连接

### 虚拟机管理
- `GET /api/pve/vms` - 获取所有虚拟机
- `POST /api/pve/connections/:id/vms/:vmid/start` - 启动VM
- `POST /api/pve/connections/:id/vms/:vmid/stop` - 停止VM
- `POST /api/pve/connections/:id/vms/:vmid/shutdown` - 关闭VM
- `DELETE /api/pve/connections/:id/vms/:vmid` - 删除VM

### 监控数据
- `GET /api/pve/nodes` - 获取所有节点
- `GET /api/pve/connections/:id/resources` - 获取集群资源

### 🆕 告警系统
- `GET /api/alerts` - 获取告警列表 (支持过滤: level, type, status)
- `POST /api/alerts` - 创建新告警
- `POST /api/alerts/:id/acknowledge` - 确认告警
- `POST /api/alerts/:id/resolve` - 解决告警
- `DELETE /api/alerts/:id` - 删除告警
- `GET /api/alerts/stats` - 获取告警统计信息
- `POST /api/alerts/batch` - 批量操作告警 (acknowledge, resolve, delete)

## WebSocket 事件

### 客户端发送
- `get-connections` - 请求连接列表
- `get-vms` - 请求虚拟机列表
- `vm-action` - 执行VM操作

### 服务器发送
- `connections` - 连接列表更新
- `vms` - 虚拟机列表更新
- `connection-status-changed` - 连接状态变更
- `vm-action-result` - VM操作结果

## 开发记录系统

项目包含自动开发记录系统，用于保存开发进度：

```bash
# 查看开发进度
node dev-logger/simple-logger.js progress

# 生成开发报告
node dev-logger/simple-logger.js report

# 手动记录活动
node dev-logger/simple-logger.js log "activity_name"
```

## 故障排除

### 连接失败
1. 检查PVE服务器网络连通性
2. 确认PVE Web界面可访问
3. 验证用户名密码正确
4. 检查防火墙设置

### 性能问题
1. 减少监控频率
2. 限制显示的VM数量
3. 检查网络延迟

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 创建 Pull Request

## 许可证

MIT License

---

## 📋 更新日志

### v2.0.0 (2026-01-12)

**🆕 新功能:**
- 多用户权限管理系统（管理员/操作员/用户/查看者）
- 批量操作功能（批量启动/关机/重启）
- VM分组管理
- 备份管理（创建/恢复/删除）
- VNC远程控制
- 定时任务调度（定时开关机/备份）
- 操作日志审计
- 系统设置页面
- Windows PowerShell 启动脚本

**🔧 改进:**
- 重构认证系统
- 优化前端路由
- 增强安全性
- 改进用户体验

### v1.0.0 (基于 PVE-MGMT)
- 基础 PVE 管理功能
- 虚拟机监控和流量统计
- 告警系统

## 🔧 故障排除

如遇到问题，请创建Issue并附带报错日记及详细说明
### 常见问题

**Q: 页面无法访问，提示连接被拒绝？**  
A: 检查服务是否启动：
```bash
# 检查端口占用
ss -tlnp | grep :3000  # 后端
ss -tlnp | grep :5173  # 前端

# 启动服务
npm run dev
```

**Q: 控制台出现 Antd 组件废弃警告？**  
A: 项目已在 v1.0.1 版本中修复

**Q: 组件出现无限更新循环？**  
A: 检查 useEffect 依赖数组设置

---

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

---

## 许可证

MIT License

---

## 联系信息

- **项目地址**: [https://github.com/cn-maomao/PVE-Manager-V2.0](https://github.com/cn-maomao/PVE-Manager-V2.0)
- **原项目**: [https://github.com/Dream0057/PVE-MGMT](https://github.com/Dream0057/PVE-MGMT)

如有问题或建议，请创建 Issue。
