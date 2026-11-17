import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Saver = () => Promise<void>;

type DraftContextValue = {
  dirty: boolean;
  saving: boolean;
  publish: (id: string, dirty: boolean, save: Saver, value?: unknown) => void;
  peek: <T>(id: string) => T | undefined;
  saveAll: () => Promise<void>;
  clear: () => void;
};

const DraftContext = createContext<DraftContextValue | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const savers = useRef(new Map<string, Saver>());
  const values = useRef(new Map<string, unknown>());
  const dirtyIds = useRef(new Set<string>());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const sync = useCallback(() => {
    setDirty(dirtyIds.current.size > 0);
  }, []);

  const publish = useCallback((id: string, isDirty: boolean, save: Saver, value?: unknown) => {
    savers.current.set(id, save);
    if (value !== undefined) values.current.set(id, value);
    const had = dirtyIds.current.has(id);
    if (isDirty) dirtyIds.current.add(id);
    else dirtyIds.current.delete(id);
    if (had !== isDirty) sync();
  }, [sync]);

  const peek = useCallback(<T,>(id: string) => values.current.get(id) as T | undefined, []);

  const clear = useCallback(() => {
    savers.current.clear();
    values.current.clear();
    dirtyIds.current.clear();
    setDirty(false);
  }, []);

  const saveAll = useCallback(async () => {
    const ids = [...dirtyIds.current];
    if (ids.length === 0) return;
    setSaving(true);
    try {
      for (const id of ids) {
        const job = savers.current.get(id);
        if (!job) continue;
        await job();
        dirtyIds.current.delete(id);
      }
    } finally {
      sync();
      setSaving(false);
    }
  }, [sync]);

  const value = useMemo(
    () => ({ dirty, saving, publish, peek, saveAll, clear }),
    [dirty, saving, publish, peek, saveAll, clear],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDrafts() {
  const value = useContext(DraftContext);
  if (!value) throw new Error("Drafts are only available inside the workshop shell.");
  return value;
}

export function useDraft<T>(id: string, value: T, isDirty: boolean, save: Saver) {
  const { publish } = useDrafts();
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    publish(id, isDirty, () => saveRef.current(), value);
  }, [id, isDirty, publish, value]);
}
