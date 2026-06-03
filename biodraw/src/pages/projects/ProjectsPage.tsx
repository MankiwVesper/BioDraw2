import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../state/authStore';
import {
  listProjects, createProject, getProject, deleteProject, renameProject,
  type ProjectRecord,
} from '../../infrastructure/projectService';
import { serializeDocument } from '../../infrastructure/documentSerializer';
import './ProjectsPage.css';

function emptySnapshot() {
  return serializeDocument({
    objects: [],
    animations: [],
    globalDurationMs: 10000,
    canvasWidth: 1280,
    canvasHeight: 720,
    canvasBgColor: '#ffffff',
  });
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(isoString).toLocaleDateString('zh-CN');
}

function ProjectCard({
  project,
  onOpen,
  onRename,
  onPreview,
  onExport,
  onDownload,
  onDelete,
}: {
  project: ProjectRecord;
  onOpen: () => void;
  onRename: () => void;
  onPreview: () => void;
  onExport: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  return (
    <div className="project-card" onClick={onOpen}>
      <div className="project-card-preview">
        {project.thumbnail
          ? <img src={project.thumbnail} alt="" draggable={false} />
          : <span className="project-card-preview-placeholder">空白项目</span>
        }
      </div>
      <div className="project-card-footer">
        <div className="project-card-info">
          <span className="project-card-title">{project.title}</span>
          <span className="project-card-time">{formatRelativeTime(project.updated_at)}</span>
        </div>
        <div className="project-card-menu-wrap" ref={menuRef}>
          <button
            className="project-card-menu-btn"
            onClick={(e) => { e.stopPropagation(); setShowMenu((p) => !p); }}
          >
            ···
          </button>
          {showMenu && (
            <div className="project-card-menu">
              <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); onRename(); }}>
                重命名
              </button>
              <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); onPreview(); }}>
                预览
              </button>
              <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); onExport(); }}>
                导出
              </button>
              <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDownload(); }}>
                下载
              </button>
              <button
                className="is-danger"
                onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(); }}
              >
                删除
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setProjects(await listProjects());
    } catch {
      setListError('加载项目失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    try {
      const id = await createProject('未命名项目', emptySnapshot());
      navigate(`/editor/${id}`);
    } catch {
      alert('创建项目失败，请重试');
    }
  }

  async function handleRename(id: string, currentTitle: string) {
    const newTitle = window.prompt('请输入新名称', currentTitle);
    if (!newTitle || newTitle.trim() === currentTitle) return;
    try {
      await renameProject(id, newTitle.trim());
      setProjects((prev) => prev.map((p) => p.id === id ? { ...p, title: newTitle.trim() } : p));
    } catch {
      alert('重命名失败，请重试');
    }
  }

  async function handleDownload(id: string, title: string) {
    try {
      const { data } = await getProject(id);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.biodraw`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('下载失败，请重试');
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`确认删除「${title}」？此操作不可恢复。`)) return;
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert('删除失败，请重试');
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="projects-page">
      <header className="projects-header">
        <span className="projects-logo">BioDraw</span>
        <div className="projects-header-right">
          <span className="projects-user-email">{user?.email}</span>
          <button className="projects-logout-btn" onClick={handleLogout}>退出登录</button>
        </div>
      </header>

      <main className="projects-main">
        <div className="projects-title-row">
          <h1 className="projects-title">我的项目</h1>
          <button className="projects-create-btn" onClick={handleCreate}>+ 新建项目</button>
        </div>

        {loading && <div className="projects-loading">加载中...</div>}
        {listError && <div className="projects-error">{listError}</div>}

        {!loading && !listError && projects.length === 0 && (
          <div className="projects-empty">
            <p>还没有项目，立即开始创作</p>
            <button className="projects-create-btn" onClick={handleCreate}>创建第一个项目</button>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <div className="projects-grid">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={() => navigate(`/editor/${p.id}`)}
                onRename={() => handleRename(p.id, p.title)}
                onPreview={() => navigate(`/editor/${p.id}?autoPreview=1`)}
                onExport={() => navigate(`/editor/${p.id}?autoExport=1`)}
                onDownload={() => handleDownload(p.id, p.title)}
                onDelete={() => handleDelete(p.id, p.title)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
