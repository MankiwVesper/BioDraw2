import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { Upload, LayoutGrid, List, Search, X, ChevronDown, Pencil, Trash2, FolderPlus, Check, Layers, Folder, Inbox, Minus, Eye, Download, Share2, FolderInput } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../state/authStore';
import {
  listProjects, createProject, getProject, deleteProject, deleteProjects,
  renameProject, updateProjectData, moveProject, moveProjects,
  listGroups, createGroup, renameGroup, deleteGroup,
  type ProjectRecord, type ProjectGroup,
} from '../../infrastructure/projectService';
import { serializeDocument, parseDocumentFile, type DocumentSnapshot } from '../../infrastructure/documentSerializer';
import { thumbnailCapture } from '../../infrastructure/thumbnailCapture';
import { useEditorStore } from '../../state/editorStore';
import { CanvasPanel } from '../../features/canvas-panel/CanvasPanel';
import { ProjectExportModal } from './ProjectExportModal';
import { ChangePasswordModal } from './ChangePasswordModal';
import { DeleteAccountModal } from './DeleteAccountModal';
import './ProjectsPage.css';

type SortKey = 'updated_at' | 'created_at' | 'title';
type ViewMode = 'grid' | 'list';

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) handler(); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [enabled, handler, ref]);
}

// ── 轻量确认弹窗 ──────────────────────────────────────────────────────────────
function ConfirmModal({
  message,
  confirmLabel = '确认',
  danger = false,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="pp-modal-overlay" onMouseDown={onCancel}>
      <div className="pp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <p className="pp-modal-msg">{message}</p>
        <div className="pp-modal-actions">
          <button className="pp-modal-cancel" onClick={onCancel}>取消</button>
          <button className={`pp-modal-confirm${danger ? ' is-danger' : ''}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── 轻量输入弹窗 ──────────────────────────────────────────────────────────────
function InputModal({
  title,
  defaultValue,
  onConfirm,
  onCancel,
}: {
  title: string;
  defaultValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.select(); }, []);
  return (
    <div className="pp-modal-overlay" onMouseDown={onCancel}>
      <div className="pp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <p className="pp-modal-msg">{title}</p>
        <input
          ref={inputRef}
          className="pp-modal-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) onConfirm(value.trim()); if (e.key === 'Escape') onCancel(); }}
          autoFocus
        />
        <div className="pp-modal-actions">
          <button className="pp-modal-cancel" onClick={onCancel}>取消</button>
          <button className="pp-modal-confirm" disabled={!value.trim()} onClick={() => onConfirm(value.trim())}>确认</button>
        </div>
      </div>
    </div>
  );
}

const SORT_LABELS: Record<SortKey, string> = {
  updated_at: '最近更新',
  created_at: '最近创建',
  title: '名称 A→Z',
};

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

function ThumbnailCapture({
  projectId,
  snapshot,
  onDone,
}: {
  projectId: string;
  snapshot: DocumentSnapshot;
  onDone: () => void;
}) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timer = setTimeout(async () => {
      const thumb = thumbnailCapture.current?.() ?? null;
      try {
        await Promise.race([
          updateProjectData(projectId, snapshot, thumb),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 8000)
          ),
        ]);
      } catch {
        // best-effort: thumbnail failure doesn't block import
      }
      onDoneRef.current();
    }, 1500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'fixed', left: -9999, top: 0, width: 1920, height: 1080, overflow: 'hidden', pointerEvents: 'none', zIndex: -1 }}>
      <CanvasPanel />
    </div>
  );
}

// ── 移动到分组子菜单 ─────────────────────────────────────────────────────────
function MoveToMenu({
  groupsMap,
  currentGroupId,
  onMove,
  onClose,
}: {
  groupsMap: Map<string, string>;
  currentGroupId: string | null | undefined;
  onMove: (groupId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <div className="pcard-submenu">
      <button
        className={`pcard-submenu-item${!currentGroupId ? ' is-current' : ''}`}
        onClick={() => { onMove(null); onClose(); }}
      >
        {!currentGroupId && <Check size={12} />}
        未分组
      </button>
      {[...groupsMap.entries()].map(([id, name]) => (
        <button
          key={id}
          className={`pcard-submenu-item${currentGroupId === id ? ' is-current' : ''}`}
          onClick={() => { onMove(id); onClose(); }}
        >
          {currentGroupId === id && <Check size={12} />}
          {name}
        </button>
      ))}
    </div>
  );
}

// ── 项目卡片（网格） ──────────────────────────────────────────────────────────
function ProjectCard({
  project,
  groupsMap,
  anySelected,
  selected,
  onToggleSelect,
  onOpen,
  onRename,
  onPreview,
  onExport,
  onDownload,
  onDelete,
  onMove,
}: {
  project: ProjectRecord;
  groupsMap: Map<string, string>;
  anySelected: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onRename: () => void;
  onPreview: () => void;
  onExport: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onMove: (groupId: string | null) => void;
}) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const groupTagTextRef = useRef<HTMLSpanElement>(null);

  useClickOutside(moveMenuRef, () => setShowMoveMenu(false), showMoveMenu);

  const groupName = project.group_id ? groupsMap.get(project.group_id) : undefined;

  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const { width, overflow } = el.style;
    el.style.width = 'max-content';
    el.style.overflow = 'visible';
    const natural = el.getBoundingClientRect().width;
    el.style.width = width;
    el.style.overflow = overflow;
    const constrained = el.getBoundingClientRect().width;
    if (natural > constrained + 0.5) {
      el.setAttribute('data-tooltip', project.title);
    } else {
      el.removeAttribute('data-tooltip');
    }
  }, [project.title]);

  useLayoutEffect(() => {
    const el = groupTagTextRef.current;
    if (!el) return;
    const { width, overflow } = el.style;
    el.style.width = 'max-content';
    el.style.overflow = 'visible';
    const natural = el.getBoundingClientRect().width;
    el.style.width = width;
    el.style.overflow = overflow;
    const constrained = el.getBoundingClientRect().width;
    if (natural > constrained + 0.5) {
      el.setAttribute('data-tooltip', groupName ?? '');
    } else {
      el.removeAttribute('data-tooltip');
    }
  }, [groupName]);

  function handleCardClick() {
    if (anySelected) { onToggleSelect(); return; }
    onOpen();
  }

  return (
    <div
      className={`project-card${selected ? ' is-selected' : ''}`}
      onClick={handleCardClick}
    >
      <div className="project-card-preview">
        {project.thumbnail
          ? <img src={project.thumbnail} alt="" draggable={false} loading="lazy" />
          : <span className="project-card-preview-placeholder">空白项目</span>
        }
        <div
          className={`project-card-checkbox${selected ? ' is-checked' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        >
          {selected && <Check size={11} strokeWidth={3} />}
        </div>
      </div>

      <div className="project-card-footer">
        <div className="project-card-title-row">
          <span ref={titleRef} className="project-card-title">{project.title}</span>
          {groupName && (
            <span className="project-card-group-tag">
              <Folder size={10} />
              <span ref={groupTagTextRef}>{groupName}</span>
            </span>
          )}
        </div>
        <div className="project-card-actions" onClick={(e) => e.stopPropagation()}>
          <button className="pcard-action-btn" data-tooltip="重命名" onClick={onRename}><Pencil size={13} /></button>
          <button className="pcard-action-btn" data-tooltip="预览" onClick={onPreview}><Eye size={13} /></button>
          <button className="pcard-action-btn" data-tooltip="导出" onClick={onExport}><Share2 size={13} /></button>
          <button className="pcard-action-btn" data-tooltip="下载" onClick={onDownload}><Download size={13} /></button>
          <div className="pcard-action-move" ref={moveMenuRef}>
            <button className="pcard-action-btn" data-tooltip="移动到" onClick={() => setShowMoveMenu((p) => !p)}><FolderInput size={13} /></button>
            {showMoveMenu && (
              <MoveToMenu
                groupsMap={groupsMap}
                currentGroupId={project.group_id}
                onMove={onMove}
                onClose={() => setShowMoveMenu(false)}
              />
            )}
          </div>
          <button className="pcard-action-btn is-danger" data-tooltip="删除" onClick={onDelete}><Trash2 size={13} /></button>
          <span className="project-card-time">{formatRelativeTime(project.updated_at)}</span>
        </div>
      </div>
    </div>
  );
}

// ── 项目行（列表） ────────────────────────────────────────────────────────────
function ProjectRow({
  project,
  groupsMap,
  anySelected,
  selected,
  onToggleSelect,
  onOpen,
  onRename,
  onPreview,
  onExport,
  onDownload,
  onDelete,
  onMove,
}: {
  project: ProjectRecord;
  groupsMap: Map<string, string>;
  anySelected: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onRename: () => void;
  onPreview: () => void;
  onExport: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onMove: (groupId: string | null) => void;
}) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside(moveMenuRef, () => setShowMoveMenu(false), showMoveMenu);

  const groupName = (project.group_id ? groupsMap.get(project.group_id) : undefined) ?? '未分组';

  function handleRowClick() {
    if (anySelected) { onToggleSelect(); return; }
    onOpen();
  }

  return (
    <div
      className={`project-row${selected ? ' is-selected' : ''}`}
      onClick={handleRowClick}
    >
      <div className="project-row-check" onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}>
        <div className={`project-card-checkbox${selected ? ' is-checked' : ''}`}>
          {selected && <Check size={11} strokeWidth={3} />}
        </div>
      </div>
      <div className="project-row-thumb">
        {project.thumbnail
          ? <img src={project.thumbnail} alt="" draggable={false} loading="lazy" />
          : <div className="project-row-thumb-placeholder" />
        }
      </div>
      <div className="project-row-title">{project.title}</div>
      <div className="project-row-group">{groupName}</div>
      <div className="project-row-time">{formatRelativeTime(project.updated_at)}</div>
      <div className="project-row-actions" onClick={(e) => e.stopPropagation()}>
        <div className="project-card-actions">
          <button className="pcard-action-btn" data-tooltip="重命名" onClick={onRename}><Pencil size={13} /></button>
          <button className="pcard-action-btn" data-tooltip="预览" onClick={onPreview}><Eye size={13} /></button>
          <button className="pcard-action-btn" data-tooltip="导出" onClick={onExport}><Share2 size={13} /></button>
          <button className="pcard-action-btn" data-tooltip="下载" onClick={onDownload}><Download size={13} /></button>
          <div className="pcard-action-move" ref={moveMenuRef}>
            <button className="pcard-action-btn" data-tooltip="移动到" onClick={() => setShowMoveMenu((p) => !p)}><FolderInput size={13} /></button>
            {showMoveMenu && (
              <MoveToMenu
                groupsMap={groupsMap}
                currentGroupId={project.group_id}
                onMove={onMove}
                onClose={() => setShowMoveMenu(false)}
              />
            )}
          </div>
          <button className="pcard-action-btn is-danger" data-tooltip="删除" onClick={onDelete}><Trash2 size={13} /></button>
        </div>
      </div>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const loadSnapshot = useEditorStore((s) => s.loadSnapshot);

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [groups, setGroups]     = useState<ProjectGroup[]>([]);
  const [loading, setLoading]   = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [activeGroupId, setActiveGroupId] = useState<string | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem('pv_view') as ViewMode) ?? 'grid'
  );
  const [sortKey, setSortKey]   = useState<SortKey>('updated_at');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  // 批量操作
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [showBulkMoveMenu, setShowBulkMoveMenu] = useState(false);
  const bulkMoveRef = useRef<HTMLDivElement>(null);

  // 分组侧边栏
  const [creatingGroup, setCreatingGroup]   = useState(false);
  const [newGroupName, setNewGroupName]     = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const newGroupInputRef  = useRef<HTMLInputElement>(null);
  const editGroupInputRef    = useRef<HTMLInputElement>(null);
  const groupEditEscapedRef  = useRef(false);

  const [exportTarget, setExportTarget] = useState<{ id: string; title: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<{ id: string; name: string; count: number } | null>(null);
  const [thumbGenTarget, setThumbGenTarget] = useState<{ id: string; snapshot: DocumentSnapshot } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importingProjectIdRef = useRef<string | null>(null);
  const userMenuRef  = useRef<HTMLDivElement>(null);
  const sortMenuRef  = useRef<HTMLDivElement>(null);

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (!creatingGroup) return;
    setTimeout(() => newGroupInputRef.current?.focus(), 0);
  }, [creatingGroup]);

  useEffect(() => {
    if (!editingGroupId) return;
    setTimeout(() => editGroupInputRef.current?.focus(), 0);
  }, [editingGroupId]);

  useClickOutside(userMenuRef,  () => setShowUserMenu(false),    showUserMenu);
  useClickOutside(sortMenuRef,  () => setShowSortMenu(false),    showSortMenu);
  useClickOutside(bulkMoveRef,  () => setShowBulkMoveMenu(false), showBulkMoveMenu);

  async function loadAll() {
    try {
      const ps = await listProjects();
      setProjects(ps);
    } catch {
      setListError('加载项目失败，请刷新重试');
    } finally {
      setLoading(false);
    }
    try {
      const gs = await listGroups();
      setGroups(gs);
    } catch {
      // 分组加载失败不阻断项目显示
    }
  }

  // 分组名称 Map：O(1) 查找替代 O(n) find
  const groupsMap = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  // 侧边栏计数 Map：一次遍历替代 n×m 过滤
  const groupCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of projects) {
      if (p.group_id) map.set(p.group_id, (map.get(p.group_id) ?? 0) + 1);
    }
    return map;
  }, [projects]);

  // 过滤 + 排序
  const displayedProjects = useMemo(() => {
    let list = projects;
    if (activeGroupId !== 'all') {
      list = activeGroupId === 'ungrouped'
        ? list.filter((p) => !p.group_id)
        : list.filter((p) => p.group_id === activeGroupId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (sortKey === 'title') return a.title.localeCompare(b.title, 'zh');
      return new Date(b[sortKey]).getTime() - new Date(a[sortKey]).getTime();
    });
  }, [projects, activeGroupId, searchQuery, sortKey]);

  function handleViewMode(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem('pv_view', mode);
  }

  function switchGroup(id: string) {
    setActiveGroupId(id);
    setSearchQuery('');
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === displayedProjects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedProjects.map((p) => p.id)));
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

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const snapshot = await parseDocumentFile(file);
      const title = file.name.replace(/\.biodraw$/i, '') || '导入项目';
      if (projects.some((p) => p.title === title)) {
        alert(`已存在名为「${title}」的项目，请使用其他名称`);
        setImporting(false);
        return;
      }
      const id = await Promise.race([
        createProject(title, snapshot),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('网络超时，请检查连接后重试')), 15000)
        ),
      ]);
      importingProjectIdRef.current = id;
      loadSnapshot(snapshot);
      setThumbGenTarget({ id, snapshot });
    } catch (err) {
      alert(err instanceof Error ? err.message : '导入失败，请重试');
      setImporting(false);
    }
  }

  async function handleCancelImport() {
    const id = importingProjectIdRef.current;
    importingProjectIdRef.current = null;
    setThumbGenTarget(null);
    setImporting(false);
    if (id) {
      try { await deleteProject(id); } catch { /* best-effort */ }
    }
  }

  async function commitRename(id: string, newTitle: string) {
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed === projects.find((p) => p.id === id)?.title) { setRenameTarget(null); return; }
    if (projects.some((p) => p.id !== id && p.title === trimmed)) {
      alert(`已存在名为「${trimmed}」的项目，请使用其他名称`);
      return;
    }
    try {
      await renameProject(id, trimmed);
      setProjects((prev) => prev.map((p) => p.id === id ? { ...p, title: trimmed } : p));
      setRenameTarget(null);
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

  async function commitDelete(id: string) {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setDeleteTarget(null);
    } catch {
      alert('删除失败，请重试');
    }
  }

  async function commitBulkDelete() {
    const ids = [...selectedIds];
    try {
      await deleteProjects(ids);
      setProjects((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setBulkDeletePending(false);
      setSelectedIds(new Set());
    } catch {
      alert('批量删除失败，请重试');
    }
  }

  async function handleMoveProject(projectId: string, groupId: string | null) {
    try {
      await moveProject(projectId, groupId);
      setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, group_id: groupId } : p));
    } catch {
      alert('移动失败，请重试');
    }
  }

  async function handleBulkMove(groupId: string | null) {
    const ids = [...selectedIds];
    try {
      await moveProjects(ids, groupId);
      setProjects((prev) => prev.map((p) => selectedIds.has(p.id) ? { ...p, group_id: groupId } : p));
      setShowBulkMoveMenu(false);
      setSelectedIds(new Set());
    } catch {
      alert('移动失败，请重试');
    }
  }

  async function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    if (groups.some((g) => g.name === name)) {
      alert(`已存在名为「${name}」的分组`);
      return;
    }
    try {
      const g = await createGroup(name);
      setGroups((prev) => [...prev, g]);
      setNewGroupName('');
      setCreatingGroup(false);
    } catch (err) {
      console.error('createGroup error:', err);
      alert('创建分组失败，请重试');
    }
  }

  async function handleRenameGroup(id: string) {
    const name = editingGroupName.trim();
    if (!name) { setEditingGroupId(null); return; }
    if (groups.some((g) => g.id !== id && g.name === name)) {
      alert(`已存在名为「${name}」的分组`);
      return;
    }
    try {
      await renameGroup(id, name);
      setGroups((prev) => prev.map((g) => g.id === id ? { ...g, name } : g));
      setEditingGroupId(null);
    } catch {
      alert('重命名失败，请重试');
    }
  }

  async function commitDeleteGroup(id: string) {
    try {
      await deleteGroup(id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      setProjects((prev) => prev.map((p) => p.group_id === id ? { ...p, group_id: null } : p));
      if (activeGroupId === id) setActiveGroupId('all');
      setDeleteGroupTarget(null);
    } catch {
      alert('删除分组失败，请重试');
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const activeGroupLabel = activeGroupId === 'all'
    ? '全部项目'
    : activeGroupId === 'ungrouped'
    ? '未分组'
    : (groups.find((g) => g.id === activeGroupId)?.name ?? '全部项目');

  const allSelected     = displayedProjects.length > 0 && selectedIds.size === displayedProjects.length;
  const partialSelected = selectedIds.size > 0 && !allSelected;

  return (
    <div className="projects-page">
      {/* ── Header ── */}
      <header className="projects-header">
        <span className="projects-logo">BioDraw</span>
        <div className="projects-user-wrap" ref={userMenuRef}>
          <button
            className={`projects-user-avatar${showUserMenu ? ' is-on' : ''}`}
            onClick={() => setShowUserMenu((p) => !p)}
            data-tooltip={user?.email}
          >
            {(user?.email?.[0] ?? '?').toUpperCase()}
          </button>
          {showUserMenu && (
            <div className="projects-user-dropdown">
              <div className="projects-user-dropdown-email">{user?.email}</div>
              <button className="projects-user-dropdown-item" onClick={() => { setShowUserMenu(false); setShowChangePassword(true); }}>修改密码</button>
              <div className="projects-user-dropdown-divider" />
              <button className="projects-user-dropdown-item is-danger" onClick={handleLogout}>退出登录</button>
              <div className="projects-user-dropdown-divider projects-user-dropdown-divider--strong" />
              <button className="projects-user-dropdown-item is-critical" onClick={() => { setShowUserMenu(false); setShowDeleteAccount(true); }}>注销账号</button>
            </div>
          )}
        </div>
      </header>

      <div className="projects-body">
        {/* ── 左侧分组侧边栏 ── */}
        <aside className="projects-sidebar">
          <nav className="projects-sidebar-nav">
            <button
              className={`projects-sidebar-item${activeGroupId === 'all' ? ' is-active' : ''}`}
              onClick={() => switchGroup('all')}
            >
              <span className="projects-sidebar-icon"><Layers size={14} /></span>
              <span className="projects-sidebar-label">全部项目</span>
              <span className="projects-sidebar-count">{projects.length}</span>
            </button>

            {groups.map((g) => (
              <div key={g.id} className="projects-sidebar-group-wrap">
                {editingGroupId === g.id ? (
                  <div className="projects-sidebar-edit-row">
                    <input
                      ref={editGroupInputRef}
                      className="projects-sidebar-edit-input"
                      value={editingGroupName}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { groupEditEscapedRef.current = false; handleRenameGroup(g.id); }
                        if (e.key === 'Escape') { groupEditEscapedRef.current = true; setEditingGroupId(null); }
                      }}
                      onBlur={() => { if (!groupEditEscapedRef.current) handleRenameGroup(g.id); groupEditEscapedRef.current = false; }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                ) : (
                  <button
                    className={`projects-sidebar-item${activeGroupId === g.id ? ' is-active' : ''}`}
                    onClick={() => switchGroup(g.id)}
                  >
                    <span className="projects-sidebar-icon"><Folder size={14} /></span>
                    <span className="projects-sidebar-label">{g.name}</span>
                    <span className="projects-sidebar-count">
                      {groupCountMap.get(g.id) ?? 0}
                    </span>
                    <span className="projects-sidebar-actions">
                      <span
                        className="projects-sidebar-action-btn"
                        data-tooltip="重命名"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingGroupId(g.id);
                          setEditingGroupName(g.name);
                        }}
                      >
                        <Pencil size={11} />
                      </span>
                      <span
                        className="projects-sidebar-action-btn is-danger"
                        data-tooltip="删除分组"
                        onClick={(e) => { e.stopPropagation(); setDeleteGroupTarget({ id: g.id, name: g.name, count: groupCountMap.get(g.id) ?? 0 }); }}
                      >
                        <Trash2 size={11} />
                      </span>
                    </span>
                  </button>
                )}
              </div>
            ))}

            {(() => {
              const ungroupedCount = projects.length - [...groupCountMap.values()].reduce((a, b) => a + b, 0);
              if (ungroupedCount === 0 && activeGroupId !== 'ungrouped') return null;
              return (
                <button
                  className={`projects-sidebar-item${activeGroupId === 'ungrouped' ? ' is-active' : ''}`}
                  onClick={() => switchGroup('ungrouped')}
                >
                  <span className="projects-sidebar-icon"><Inbox size={14} /></span>
                  <span className="projects-sidebar-label">未分组</span>
                  <span className="projects-sidebar-count">{ungroupedCount}</span>
                </button>
              );
            })()}
          </nav>

          <div className="projects-sidebar-footer">
            {creatingGroup ? (
              <div className="projects-sidebar-new-group">
                <input
                  ref={newGroupInputRef}
                  className="projects-sidebar-edit-input"
                  placeholder="分组名称..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateGroup();
                    if (e.key === 'Escape') { setCreatingGroup(false); setNewGroupName(''); }
                  }}
                />
                <div className="projects-sidebar-new-group-actions">
                  <button className="projects-sidebar-new-confirm" onClick={handleCreateGroup}>确认</button>
                  <button className="projects-sidebar-new-cancel" onClick={() => { setCreatingGroup(false); setNewGroupName(''); }}>取消</button>
                </div>
              </div>
            ) : (
              <button className="projects-sidebar-add-btn" onClick={() => setCreatingGroup(true)}>
                <FolderPlus size={13} />
                新建分组
              </button>
            )}
          </div>
        </aside>

        {/* ── 主内容 ── */}
        <main className="projects-main">
          {/* 标题行 */}
          <div className="projects-page-header">
            <h1 className="projects-title">
              {activeGroupLabel}
              <span className="projects-title-count">{displayedProjects.length}</span>
            </h1>
            <div className="projects-header-actions">
              <button className="projects-create-btn" onClick={handleCreate} disabled={importing}>+ 新建项目</button>
              <button
                className={`projects-import-btn${importing ? ' is-importing' : ''}`}
                onClick={() => importing ? handleCancelImport() : importInputRef.current?.click()}
                data-tooltip={importing ? '点击可取消导入操作' : undefined}
              >
                <Upload size={13} strokeWidth={2.5} />
                {importing ? '导入中...' : '导入项目'}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".biodraw"
                style={{ display: 'none' }}
                onChange={handleImport}
              />
            </div>
          </div>

          {/* 工具栏（不切换模式，批量操作按需追加在右侧） */}
          <div className="projects-toolbar">
            <div className="projects-search-wrap">
              <Search size={13} className="projects-search-icon" />
              <input
                className="projects-search-input"
                placeholder="搜索项目名称..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="projects-search-clear" onClick={() => setSearchQuery('')}>
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="projects-sort-wrap" ref={sortMenuRef}>
              <button className="projects-ghost-btn" onClick={() => setShowSortMenu((p) => !p)}>
                {SORT_LABELS[sortKey]} <ChevronDown size={12} />
              </button>
              {showSortMenu && (
                <div className="projects-sort-menu">
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                    <button
                      key={k}
                      className={sortKey === k ? 'is-active' : ''}
                      onClick={() => { setSortKey(k); setShowSortMenu(false); }}
                    >
                      {sortKey === k && <Check size={12} />}
                      {SORT_LABELS[k]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="projects-view-toggle">
              <button
                className={`projects-view-btn${viewMode === 'grid' ? ' is-active' : ''}`}
                onClick={() => handleViewMode('grid')}
                data-tooltip="网格视图"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                className={`projects-view-btn${viewMode === 'list' ? ' is-active' : ''}`}
                onClick={() => handleViewMode('list')}
                data-tooltip="列表视图"
              >
                <List size={14} />
              </button>
            </div>
            <div className="projects-toolbar-divider" />
            <label className="projects-select-all" onClick={toggleSelectAll}>
              <div className={`project-card-checkbox${allSelected ? ' is-checked' : partialSelected ? ' is-indeterminate' : ''}`}>
                {allSelected && <Check size={11} strokeWidth={3} />}
                {!allSelected && partialSelected && <Minus size={11} strokeWidth={3} />}
              </div>
              <span>全选</span>
            </label>
            {selectedIds.size > 0 && (
              <>
                <span className="projects-selection-count">已选 {selectedIds.size} 项</span>
                <div className="projects-sort-wrap" ref={bulkMoveRef}>
                  <button className="projects-ghost-btn" onClick={() => setShowBulkMoveMenu((p) => !p)}>
                    移动到 <ChevronDown size={12} />
                  </button>
                  {showBulkMoveMenu && (
                    <div className="projects-sort-menu">
                      <button onClick={() => handleBulkMove(null)}>未分组</button>
                      {groups.map((g) => (
                        <button key={g.id} onClick={() => handleBulkMove(g.id)}>{g.name}</button>
                      ))}
                    </div>
                  )}
                </div>
                <button className="projects-danger-btn" onClick={() => setBulkDeletePending(true)}>
                  <Trash2 size={13} />
                  删除 ({selectedIds.size})
                </button>
              </>
            )}
          </div>

          {loading && <div className="projects-loading">加载中...</div>}
          {listError && <div className="projects-error">{listError}</div>}

          {!loading && !listError && displayedProjects.length === 0 && (
            <div className="projects-empty">
              {searchQuery ? (
                <>
                  <div className="projects-empty-icon">🔍</div>
                  <p className="projects-empty-title">找不到匹配的项目</p>
                  <p className="projects-empty-sub">
                    尝试其他关键词，或{' '}
                    <button className="projects-empty-link" onClick={() => setSearchQuery('')}>清除搜索</button>
                  </p>
                </>
              ) : (
                <>
                  <div className="projects-empty-canvas" />
                  <p className="projects-empty-title">这里还没有项目</p>
                  <p className="projects-empty-sub">立即创作你的第一个动画示意图</p>
                  <div className="projects-empty-actions">
                    <button className="projects-create-btn" onClick={handleCreate} disabled={importing}>+ 新建项目</button>
                    <button
                      className={`projects-import-btn${importing ? ' is-importing' : ''}`}
                      onClick={() => importing ? handleCancelImport() : importInputRef.current?.click()}
                    >
                      <Upload size={13} strokeWidth={2.5} />
                      导入项目
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {!loading && displayedProjects.length > 0 && (
            <div style={{ position: 'relative' }}>
              {viewMode === 'grid' ? (
                <div className="projects-grid">
                  {displayedProjects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      groupsMap={groupsMap}
                      anySelected={selectedIds.size > 0}
                      selected={selectedIds.has(p.id)}
                      onToggleSelect={() => toggleSelect(p.id)}
                      onOpen={() => navigate(`/editor/${p.id}`)}
                      onRename={() => setRenameTarget({ id: p.id, title: p.title })}
                      onPreview={() => navigate(`/editor/${p.id}?autoPreview=1`)}
                      onExport={() => setExportTarget({ id: p.id, title: p.title })}
                      onDownload={() => handleDownload(p.id, p.title)}
                      onDelete={() => setDeleteTarget({ id: p.id, title: p.title })}
                      onMove={(gid) => handleMoveProject(p.id, gid)}
                    />
                  ))}
                </div>
              ) : (
                <div className="projects-list">
                  <div className="projects-list-header">
                    <div className="project-row-check" />
                    <div className="project-row-thumb" />
                    <div className="project-row-title">名称</div>
                    <div className="project-row-group">分组</div>
                    <div className="project-row-time">最近更新</div>
                    <div className="project-row-actions" />
                  </div>
                  {displayedProjects.map((p) => (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      groupsMap={groupsMap}
                      anySelected={selectedIds.size > 0}
                      selected={selectedIds.has(p.id)}
                      onToggleSelect={() => toggleSelect(p.id)}
                      onOpen={() => navigate(`/editor/${p.id}`)}
                      onRename={() => setRenameTarget({ id: p.id, title: p.title })}
                      onPreview={() => navigate(`/editor/${p.id}?autoPreview=1`)}
                      onExport={() => setExportTarget({ id: p.id, title: p.title })}
                      onDownload={() => handleDownload(p.id, p.title)}
                      onDelete={() => setDeleteTarget({ id: p.id, title: p.title })}
                      onMove={(gid) => handleMoveProject(p.id, gid)}
                    />
                  ))}
                </div>
              )}
              {importing && (
                <div style={{ position: 'absolute', inset: 0, cursor: 'not-allowed', zIndex: 1 }} />
              )}
            </div>
          )}
        </main>
      </div>

      {renameTarget && (
        <InputModal
          title={`重命名「${renameTarget.title}」`}
          defaultValue={renameTarget.title}
          onConfirm={(v) => commitRename(renameTarget.id, v)}
          onCancel={() => setRenameTarget(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          message={`确认删除「${deleteTarget.title}」？此操作不可恢复。`}
          confirmLabel="删除"
          danger
          onConfirm={() => commitDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {bulkDeletePending && (
        <ConfirmModal
          message={`确认删除选中的 ${selectedIds.size} 个项目？此操作不可恢复。`}
          confirmLabel="全部删除"
          danger
          onConfirm={commitBulkDelete}
          onCancel={() => setBulkDeletePending(false)}
        />
      )}
      {deleteGroupTarget && (
        <ConfirmModal
          message={deleteGroupTarget.count > 0
            ? `删除分组「${deleteGroupTarget.name}」后，其中 ${deleteGroupTarget.count} 个项目将移入未分组。确认删除？`
            : `确认删除分组「${deleteGroupTarget.name}」？`}
          confirmLabel="删除分组"
          danger
          onConfirm={() => commitDeleteGroup(deleteGroupTarget.id)}
          onCancel={() => setDeleteGroupTarget(null)}
        />
      )}
      {exportTarget && (
        <ProjectExportModal
          projectId={exportTarget.id}
          title={exportTarget.title}
          onClose={() => setExportTarget(null)}
        />
      )}
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
      {showDeleteAccount && (
        <DeleteAccountModal onClose={() => setShowDeleteAccount(false)} />
      )}
      {thumbGenTarget && (
        <ThumbnailCapture
          projectId={thumbGenTarget.id}
          snapshot={thumbGenTarget.snapshot}
          onDone={() => {
            setThumbGenTarget(null);
            setImporting(false);
            loadAll();
          }}
        />
      )}
    </div>
  );
}
