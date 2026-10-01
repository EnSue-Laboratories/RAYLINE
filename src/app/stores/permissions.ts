/** Pending tool-permission prompts (Claude `can_use_tool`). */

import { createStore, useStore } from "../../store/createStore";
import type { PermissionReply, PermissionRequest } from "../types";
import { getApi } from "../lib/api";

export const permissionsStore = createStore<PermissionRequest[]>([]);

export function addPermissionRequest(request: PermissionRequest): void {
  if (!request.requestId) return;
  permissionsStore.setState((prev) => (prev.some((p) => p.requestId === request.requestId) ? prev : [...prev, request]));
}

export function removePermissionRequest(requestId: string): void {
  permissionsStore.setState((prev) => {
    const next = prev.filter((p) => p.requestId !== requestId);
    return next.length === prev.length ? prev : next;
  });
}

export function clearPermissionRequestsFor(conversationId: string): void {
  permissionsStore.setState((prev) => {
    const next = prev.filter((p) => p.conversationId !== conversationId);
    return next.length === prev.length ? prev : next;
  });
}

export function respondPermission({ requestId, behavior, scope, message }: PermissionReply): void {
  const api = getApi();
  if (!api) return;
  const request = permissionsStore.getState().find((p) => p.requestId === requestId);
  if (!request?.conversationId) return;
  api.agentPermissionRespond({ conversationId: request.conversationId, requestId, behavior, scope, message });
  removePermissionRequest(requestId);
}

const EMPTY: PermissionRequest[] = [];

function sameItems(a: PermissionRequest[], b: PermissionRequest[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

export function usePermissionRequestsFor(conversationId: string | null): PermissionRequest[] {
  return useStore(
    permissionsStore,
    (requests) => {
      if (!conversationId) return EMPTY;
      const items = requests.filter((p) => p.conversationId === conversationId);
      return items.length === 0 ? EMPTY : items;
    },
    sameItems,
  );
}
