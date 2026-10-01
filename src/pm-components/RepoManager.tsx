import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslator } from "../contexts/LocaleContext";
import { filterByQuery } from "../pm/listing";
import ModalShell from "../pm/ModalShell";
import RepoRow from "../pm/RepoRow";
import { SPIN_ANIMATION, SPIN_KEYFRAMES } from "../pm/styles";
import { useUserRepos } from "../pm/useUserRepos";

interface RepoManagerProps {
  repos: string[];
  onAdd: (repo: string) => void;
  onClose: () => void;
}

/** "Add repository" picker over the user's GitHub repos. */
export default function RepoManager({ repos, onAdd, onClose }: RepoManagerProps) {
  const t = useTranslator();
  const userRepos = useUserRepos();
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => filterByQuery(userRepos.repos, search, (repo) => repo.nameWithOwner),
    [userRepos.repos, search],
  );

  const renderList = () => {
    if (userRepos.loading) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40, color: "var(--text-muted)" }}>
          <Loader2 size={20} style={{ animation: SPIN_ANIMATION }} />
          <style>{SPIN_KEYFRAMES}</style>
        </div>
      );
    }
    if (userRepos.error !== null) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 40 }}>
          <div style={{ fontSize: 13, color: "rgba(200,80,80,0.7)" }}>{userRepos.error}</div>
          <button
            onClick={userRepos.retry}
            style={{
              background: "var(--control-bg)",
              border: "1px solid var(--control-border)",
              borderRadius: 6,
              color: "var(--text-secondary)",
              fontSize: 12,
              padding: "6px 14px",
              cursor: "pointer",
            }}
          >
            {t("pm.retry")}
          </button>
        </div>
      );
    }
    if (filtered.length === 0) {
      return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{t("pm.noRepositoriesFound")}</div>;
    }
    return filtered.map((repo) => {
      const added = repos.includes(repo.nameWithOwner);
      return (
        <RepoRow
          key={repo.nameWithOwner}
          repo={repo}
          added={added}
          addedLabel={t("pm.added")}
          onClick={() => {
            if (added) return;
            onAdd(repo.nameWithOwner);
            onClose();
          }}
        />
      );
    });
  };

  return (
    <ModalShell
      onClose={onClose}
      width={400}
      headerBorder="1px solid var(--control-border-soft)"
      panelStyle={{ maxHeight: "70vh", boxShadow: "var(--shadow-md)", fontFamily: "var(--font-ui)" }}
      title={<span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{t("pm.addRepositoryTitle")}</span>}
    >
      <div style={{ padding: "12px 20px 8px", flexShrink: 0 }}>
        <input
          type="text"
          placeholder={t("pm.filterRepositories")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: 7,
            border: "1px solid var(--control-border)",
            background: "var(--control-bg)",
            color: "var(--text-primary)",
            fontSize: 13,
            fontFamily: "var(--font-ui)",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px 12px" }}>{renderList()}</div>
    </ModalShell>
  );
}
