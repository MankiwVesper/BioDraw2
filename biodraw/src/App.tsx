import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import EditorPage from './pages/editor/EditorPage';
import LoginPage from './pages/login/LoginPage';
import RegisterPage from './pages/register/RegisterPage';
import ProjectsPage from './pages/projects/ProjectsPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { TooltipPortal } from './components/TooltipPortal';
import { useAuthStore } from './state/authStore';
import './index.css';

function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/projects"
          element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>}
        />
        <Route path="/editor" element={<Navigate to="/projects" replace />} />
        <Route
          path="/editor/:projectId"
          element={
            <ProtectedRoute>
              <EditorPage />
              <TooltipPortal />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
