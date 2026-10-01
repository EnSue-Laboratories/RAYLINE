import { useTranslator } from "../contexts/LocaleContext";
import { copyText, itemKey, itemSummary } from "../pm/format";
import IssueRow from "../pm/list/IssueRow";
import ListStatus from "../pm/list/ListStatus";
import { useFlashKey } from "../pm/list/useFlashKey";
import { linkedPrKey, useLinkedPrs } from "../pm/list/useLinkedPrs";
import type { FreshIssue, IssueListItem, PmStateFilter, SelectedItem } from "../pm/types";
import { useRepoItems } from "../pm/useRepoItems";
import { useStableCallback } from "../hooks/useStableCallback";
import { isGitHubOpen } from "./githubState";

interface IssueListProps {
  repos: string[];
  stateFilter: PmStateFilter;
  repoFilter: string | null;
  onSelectItem: (item: SelectedItem) => void;
  refreshSignal: number;
  freshItem: FreshIssue | null;
}

const fetchIssues = (repo: string, state: PmStateFilter) => window.ghApi.listIssues(repo, state);

export default function IssueList({ repos, stateFilter, repoFilter, onSelectItem, refreshSignal, freshItem }: IssueListProps) {
  const t = useTranslator();
  const { items, initialLoad, error, reload } = useRepoItems<IssueListItem>({
    repos,
    stateFilter,
    repoFilter,
    refreshSignal,
    freshItem,
    fetchRepo: fetchIssues,
    failedMessage: t("pm.failedToLoadIssues"),
  });
  const linkedPrs = useLinkedPrs(items);
  const [copiedKey, flashCopied] = useFlashKey();

  const handleSelect = useStableCallback((item: IssueListItem) => {
    onSelectItem({ repo: item._repo, number: item.number, type: "issue" });
  });
  const handleCopy = useStableCallback((item: IssueListItem) => {
    copyText(itemSummary(item._repo, "issue", item.number, item.title));
    flashCopied(itemKey(item._repo, item.number));
  });

  if (items.length === 0) {
    return (
      <ListStatus
        initialLoad={initialLoad}
        error={error}
        loadingText={t("pm.loadingIssues")}
        emptyText={t("pm.noIssuesFound")}
        onRetry={reload}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((item) => {
        const key = itemKey(item._repo, item.number);
        return (
          <IssueRow
            key={key}
            item={item}
            isOpen={isGitHubOpen(item.state, stateFilter)}
            copied={copiedKey === key}
            linkedPrCount={linkedPrs[linkedPrKey(item._repo, item.number)]?.length ?? 0}
            onSelect={handleSelect}
            onCopy={handleCopy}
          />
        );
      })}
    </div>
  );
}
