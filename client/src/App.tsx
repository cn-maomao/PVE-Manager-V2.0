import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout, Spin } from 'antd';
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
import Dashboard from './pages/Dashboard';
import VirtualMachines from './pages/VirtualMachines';
import Connections from './pages/Connections';
import Monitoring from './pages/Monitoring';
import TrafficRecords from './pages/TrafficRecords';
import TrafficMonitorSimple from './pages/TrafficMonitorSimple';
import TrafficMonitorPro from './pages/TrafficMonitorPro';
import VMResourceMonitor from './pages/VMResourceMonitor';
import Alerts from './pages/Alerts';
import Login from './pages/Login';
import Users from './pages/Users';
import VMGroups from './pages/VMGroups';
import Logs from './pages/Logs';
import Backups from './pages/Backups';
import ScheduledTasks from './pages/ScheduledTasks';
import Settings from './pages/Settings';
import VNCRecordings from './pages/VNCRecordings';
import Shell from './pages/Shell';
import { PVEProvider } from './contexts/PVEContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const { Content } = Layout;

// 受保护路由组件
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// 主布局组件
function MainLayout() {
  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Header />
      <Layout style={{ background: '#f5f5f5', marginTop: 64 }}>
        <Sidebar />
        <Layout style={{ background: '#f5f5f5', marginLeft: 240 }}>
          <Content style={{ margin: 0, padding: 0, background: '#f5f5f5', overflow: 'auto' }}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/vms" element={<VirtualMachines />} />
              <Route path="/connections" element={<Connections />} />
              <Route path="/monitoring" element={<Monitoring />} />
              <Route path="/traffic-records" element={<TrafficRecords />} />
              <Route path="/traffic-monitor" element={<TrafficMonitorSimple />} />
              <Route path="/traffic-monitor-pro" element={<TrafficMonitorPro />} />
              <Route path="/vm-resources" element={<VMResourceMonitor />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/users" element={<Users />} />
              <Route path="/groups" element={<VMGroups />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/backups" element={<Backups />} />
              <Route path="/scheduled-tasks" element={<ScheduledTasks />} />
              <Route path="/vnc-recordings" element={<VNCRecordings />} />
              <Route path="/shell" element={<Shell />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <PVEProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          } />
        </Routes>
      </PVEProvider>
    </AuthProvider>
  );
}

export default App;
