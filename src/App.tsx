/**
 * Renderer composition root for the main window.
 *
 * App owns no state: settings, conversation rows, UI flags and derived
 * views live in external stores (src/store, src/app/stores) and every
 * component subscribes to the slices it renders. `useAgent()` lives in
 * <AgentProvider>, so a streamed token re-renders only the active chat view
 * (and the cheap derived-store subscribers), never App, the sidebar tree,
 * the composer or historical messages. Handlers are module functions that
 * read live state via `store.getState()`.
 *
 * Layout: src/app/components · actions: src/app/actions · side effects:
 * src/app/effects · persistence: src/store/persistence.
 */

import { AppProviders } from "./app/components/AppProviders";
import { AppShell } from "./app/components/AppShell";
import { useAppLifecycle } from "./app/hooks/useAppLifecycle";

export default function App() {
  useAppLifecycle();
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}
