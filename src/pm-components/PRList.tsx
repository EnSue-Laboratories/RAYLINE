import { useTranslator } from "../contexts/LocaleContext";
import { useStableCallback } from "../hooks/useStableCallback";
import { checkoutCommand, copyText, itemKey, itemSummary } from "../pm/format";
import ListStatus from "../pm/list/ListStatus";
import PrRow, { type PrCopyAction } from "../pm/list/PrRow";
import { useFlashKey } from "../pm/list/useFlashKey";
import type { FreshPr, PmStateFilter, PrRowItem, SelectedItem } from "../pm/types";
import { useRepoItems } from "../pm/useRepoItems";
import { isGitHubOpen } from "./githubState";

interface PRListProps {
  repos: string[];
  stateFilter: PmStateFilter;
  repoFilter: string | null;
  onSelectItem: (item: SelectedItem) => void;
  refreshSignal: number;
  freshItem: FreshPr | null;
}

const fetchPrs = (repo: string, state: PmStateFilter) => window.ghApi.listPRs(repo, state);

function copiedActionFor(copiedKey: string | null, rowKey: string): PrCopyAction | null {
  if (copiedKey === `${rowKey}:summary`) return "summary";
  if (copiedKey === `${rowKey}:checkout`) return "checkout";
  return null;
}

export default function PRList({ repos, stateFilter, repoFilter, onSelectItem, refreshSignal, freshItem }: PRListProps) {
  const t = useTranslator();
  const { items, initialLoad, error, reload } = useRepoItems<PrRowItem>({
    repos,
    stateFilter,
    repoFilter,
    refreshSignal,
    freshItem,
    fetchRepo: fetchPrs,
    failedMessage: t("pm.failedToLoadPullRequests"),
  });
  const [copiedKey, flashCopied] = useFlashKey();

  const handleSelect = useStableCallback((item: PrRowItem) => {
    onSelectItem({ repo: item._repo, number: item.number, type: "pr" });
  });
  const handleCopy = useStableCallback((item: PrRowItem, action: PrCopyAction) => {
    copyText(action === "summary"
      ? itemSummary(item._repo, "pr", item.number, item.title)
      : checkoutCommand(item._repo, item.number));
    flashCopied(`${itemKey(item._repo, item.number)}:${action}`);
  });

  if (items.length === 0) {
    return (
      <ListStatus
        initialLoad={initialLoad}
        error={error}
        loadingText={t("pm.loadingPullRequests")}
        emptyText={t("pm.noPullRequestsFound")}
        onRetry={reload}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((item) => {
        const key = itemKey(item._repo, item.number);
        return (
          <PrRow
            key={key}
            item={item}
            isOpen={isGitHubOpen(item.state, stateFilter)}
            copied={copiedActionFor(copiedKey, key)}
            onSelect={handleSelect}
            onCopy={handleCopy}
          />
        );
      })}
    </div>
  );
}
