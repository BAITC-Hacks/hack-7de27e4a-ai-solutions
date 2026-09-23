"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChatApiError,
  chatApi,
  startVisiblePolling,
  type ThreadDetail,
  type ThreadSummary,
  type ThreadStatus,
} from "./api";

export function useChatInbox(employeeId: string, onExpired: () => void) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const selected = useRef(selectedId);
  const cursor = useRef<number | null>(null);
  const life = useRef<AbortController | null>(null);
  const expired = useRef(onExpired);
  expired.current = onExpired;
  selected.current = selectedId;
  const report = useCallback((error: unknown) => {
    const code =
      error instanceof ChatApiError ? error.code : "SERVICE_UNAVAILABLE";
    setError(code);
    if (code === "FORBIDDEN" || code === "NOT_FOUND") setDetail(null);
    if (code === "AUTH_REQUIRED" || code === "SESSION_CHANGED") {
      setThreads([]);
      setDetail(null);
      setSelectedId(null);
      expired.current();
    }
  }, []);
  const refreshDetail = useCallback(
    async (id: string, signal: AbortSignal) => {
      const next = await chatApi<ThreadDetail>(
        `/api/messages/threads/${encodeURIComponent(id)}`,
        { signal, employeeId },
      );
      if (signal.aborted || selected.current !== id) return;
      setDetail(next);
      setDetailLoading(false);
      if (next.thread.unreadCount > 0) {
        await chatApi(`/api/messages/threads/${encodeURIComponent(id)}/read`, {
          method: "POST",
          signal,
          employeeId,
        });
        if (!signal.aborted)
          setThreads((current) =>
            current.map((item) =>
              item.id === id ? { ...item, unreadCount: 0 } : item,
            ),
          );
      }
    },
    [employeeId],
  );
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      const list = await chatApi<{ threads: ThreadSummary[]; cursor: number }>(
        "/api/messages/threads",
        { signal, employeeId },
      );
      if (signal.aborted) return;
      setThreads(list.threads);
      setLoading(false);
      if (selected.current) await refreshDetail(selected.current, signal);
      if (!signal.aborted) {
        cursor.current = list.cursor;
        setError(null);
      }
    },
    [refreshDetail, employeeId],
  );
  useEffect(() => {
    const controller = new AbortController();
    life.current = controller;
    return () => {
      controller.abort();
    };
  }, []);
  useEffect(
    () =>
      startVisiblePolling({
        visible: () => document.visibilityState === "visible",
        subscribe: (callback) => {
          document.addEventListener("visibilitychange", callback);
          return () =>
            document.removeEventListener("visibilitychange", callback);
        },
        sync: async (signal) => {
          if (cursor.current === null) {
            await refresh(signal);
            return;
          }
          const updates = await chatApi<{ cursor: number; changed: boolean }>(
            `/api/messages/updates?cursor=${cursor.current}`,
            { signal, employeeId },
          );
          if (signal.aborted) return;
          if (updates.changed) await refresh(signal);
          else {
            cursor.current = updates.cursor;
            setError(null);
          }
        },
        onError: (error) => {
          setLoading(false);
          report(error);
        },
      }),
    [refresh, report, epoch, employeeId],
  );
  useEffect(() => {
    setDetail(null);
    if (!selectedId) return;
    setDetailLoading(true);
    const controller = new AbortController();
    void refreshDetail(selectedId, controller.signal).catch((error) => {
      if (!controller.signal.aborted) {
        setDetailLoading(false);
        report(error);
      }
    });
    return () => controller.abort();
  }, [selectedId, refreshDetail, report]);
  const retry = () => {
    cursor.current = null;
    setEpoch((value) => value + 1);
  };
  const mutate = async (path: string, method: string, body: unknown) => {
    if (busy || !life.current) return false;
    const signal = life.current.signal;
    setBusy(true);
    setError(null);
    try {
      await chatApi(path, { method, body, signal, employeeId });
      // A successful write stays successful even if the following refresh fails.
      // Keeping the draft after an acknowledged write could send it twice.
      try {
        await refresh(signal);
      } catch (error) {
        if (!signal.aborted) report(error);
      }
      return !signal.aborted;
    } catch (error) {
      if (!signal.aborted) report(error);
      return false;
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };
  return {
    threads,
    selectedId,
    setSelectedId,
    detail,
    loading,
    detailLoading,
    error,
    busy,
    retry,
    send: (text: string) =>
      selectedId
        ? mutate(
            `/api/messages/threads/${encodeURIComponent(selectedId)}/messages`,
            "POST",
            { text },
          )
        : Promise.resolve(false),
    updateStatus: (status: ThreadStatus) =>
      selectedId
        ? mutate(
            `/api/messages/threads/${encodeURIComponent(selectedId)}`,
            "PATCH",
            { status },
          )
        : Promise.resolve(false),
    openCreated: (thread: ThreadSummary) => {
      setThreads((current) => [
        thread,
        ...current.filter((item) => item.id !== thread.id),
      ]);
      setSelectedId(thread.id);
      retry();
    },
  };
}
