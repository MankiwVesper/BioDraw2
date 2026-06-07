import { supabase } from './supabaseClient';
import type { DocumentSnapshot } from './documentSerializer';

export type ProjectRecord = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  thumbnail?: string | null;
  group_id?: string | null;
};

export type ProjectGroup = {
  id: string;
  name: string;
  created_at: string;
};

export async function listProjects(): Promise<ProjectRecord[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, created_at, updated_at, thumbnail, group_id')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProjectRecord[];
}

export async function listGroups(): Promise<ProjectGroup[]> {
  const { data, error } = await supabase
    .from('project_groups')
    .select('id, name, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProjectGroup[];
}

export async function createGroup(name: string): Promise<ProjectGroup> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const { data, error } = await supabase
    .from('project_groups')
    .insert({ name, user_id: user.id })
    .select('id, name, created_at')
    .single();
  if (error) throw error;
  return data as ProjectGroup;
}

export async function renameGroup(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('project_groups').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await supabase.from('project_groups').delete().eq('id', id);
  if (error) throw error;
}

export async function moveProject(projectId: string, groupId: string | null): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ group_id: groupId })
    .eq('id', projectId);
  if (error) throw error;
}

export async function moveProjects(projectIds: string[], groupId: string | null): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ group_id: groupId })
    .in('id', projectIds);
  if (error) throw error;
}

export async function getProject(id: string): Promise<{ title: string; data: DocumentSnapshot }> {
  const { data, error } = await supabase
    .from('projects')
    .select('title, data')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as { title: string; data: DocumentSnapshot };
}

export async function createProject(title: string, snapshot: DocumentSnapshot): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const { data, error } = await supabase
    .from('projects')
    .insert({ title, data: snapshot, user_id: user.id })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateProjectData(id: string, snapshot: DocumentSnapshot, thumbnail?: string | null): Promise<void> {
  const payload: Record<string, unknown> = { data: snapshot, updated_at: new Date().toISOString() };
  if (thumbnail !== undefined) payload.thumbnail = thumbnail;
  const { error } = await supabase.from('projects').update(payload).eq('id', id);
  if (error) throw error;
}

export async function renameProject(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteProjects(ids: string[]): Promise<void> {
  const { error } = await supabase.from('projects').delete().in('id', ids);
  if (error) throw error;
}
