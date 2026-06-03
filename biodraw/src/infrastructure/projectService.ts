import { supabase } from './supabaseClient';
import type { DocumentSnapshot } from './documentSerializer';

export type ProjectRecord = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export async function listProjects(): Promise<ProjectRecord[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProjectRecord[];
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
  const { data, error } = await supabase
    .from('projects')
    .insert({ title, data: snapshot })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateProjectData(id: string, snapshot: DocumentSnapshot): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ data: snapshot, updated_at: new Date().toISOString() })
    .eq('id', id);
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
