import React from 'react';

// Saved projects for a calculator. They live on the phone only (localStorage); if storage is blocked the tool still works for the session.
export interface Proj<T> { id: string; name: string; customer: string; updatedAt: number; data: T }
export const uid = () => Math.random().toString(36).slice(2, 10);
const MAX = 30;

export function useProjects<T>(storeKey: string, artisanId: string, make: () => T, clean: (raw: unknown) => T, firstName = 'My first project') {
  const key = `ec_${storeKey}_v1_${artisanId}`;
  const fresh = (name: string): Proj<T> => ({ id: uid(), name, customer: '', updatedAt: Date.now(), data: make() });
  const [projects, setProjects] = React.useState<Proj<T>[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? '[]');
      if (Array.isArray(raw) && raw.length > 0) {
        return raw.slice(0, MAX).map((p: Record<string, unknown>) => ({
          id: typeof p.id === 'string' ? p.id : uid(), name: typeof p.name === 'string' ? p.name.slice(0, 60) : 'Project', customer: typeof p.customer === 'string' ? p.customer.slice(0, 60) : '',
          updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(), data: clean(p.data),
        }));
      }
    } catch { /* unreadable or blocked: start fresh */ }
    return [fresh(firstName)];
  });
  const [activeId, setActiveId] = React.useState(() => projects[0].id);
  const project = projects.find((p) => p.id === activeId) ?? projects[0];
  React.useEffect(() => { try { localStorage.setItem(key, JSON.stringify(projects)); } catch { /* storage blocked */ } }, [key, projects]);

  const setData = React.useCallback((f: (d: T) => T) => setProjects((ps) => ps.map((p) => (p.id === project.id ? { ...p, data: f(p.data), updatedAt: Date.now() } : p))), [project.id]);
  const patch = (o: Partial<Pick<Proj<T>, 'name' | 'customer'>>) => setProjects((ps) => ps.map((p) => (p.id === project.id ? { ...p, ...o, updatedAt: Date.now() } : p)));
  const add = (): boolean => {
    if (projects.length >= MAX) return false;
    const p = fresh(`Project ${projects.length + 1}`);
    setProjects((ps) => [...ps, p]); setActiveId(p.id);
    return true;
  };
  const remove = () => {
    const rest = projects.filter((p) => p.id !== project.id);
    const next = rest.length ? rest : [fresh(firstName)];
    setProjects(next); setActiveId(next[0].id);
  };
  return { projects, project, setActiveId, setData, patch, add, remove };
}
