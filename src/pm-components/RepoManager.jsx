import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";

export default function RepoManager({ repos, onAdd, onClose }) {
  const [userRepos, setUserRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const fetchRepos = () => {
    setLoading(true);
    setError(null);
    window.ghApi
      .listUserRepos(100)
      .then((data) => {
        setUserRepos(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRepos();
  }, []);

  const filtered = userRepos.filter((r) =>
    r.nameWithOwner.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 400,
          maxHeight: "70vh",
          background: "var(--pane-elevated)",
          backdropFilter: "blur(48px) saturate(1.2)",
          WebkitBackdropFilter: "blur(48px) saturate(1.2)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          borderRadius: 12,
          border: "1px solid var(--pane-border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "rgba(255,255,255,0.85)",
            }}
          >
            Add Repository
          </span>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: "1px solid var(--pane-border)",
              background: "var(--pane-hover)",
              color: "rgba(255,255,255,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Search input */}
        <div style={{ padding: "12px 20px 8px", flexShrink: 0 }}>
          <input
            type="text"
            placeholder="Filter repositories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 7,
              border: "1px solid var(--pane-border)",
              background: "var(--pane-hover)",
              color: "rgba(255,255,255,0.85)",
              fontSize: 13,
              fontFamily: "system-ui, sans-serif",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Repo list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px 12px" }}>
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 40,
                color: "rgba(255,255,255,0.3)",
              }}
            >
              <Loader2
                size={20}
                style={{ animation: "spin 1s linear infinite" }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          ) : error ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                padding: 40,
              }}
            >
              <div
                style={{ fontSize: 13, color: "rgba(200,80,80,0.7)" }}
              >
                {error}
              </div>
              <button
                onClick={fetchRepos}
                style={{
                  background: "var(--pane-hover)",
                  border: "1px solid var(--pane-border)",
                  borderRadius: 6,
                  color: "rgba(255,255,255,0.6)",
                  fontSize: 12,
                  padding: "6px 14px",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "rgba(255,255,255,0.3)",
                fontSize: 13,
              }}
            >
              No repositories found
            </div>
          ) : (
            filtered.map((r) => {
              const added = repos.includes(r.nameWithOwner);
              return (
                <RepoRow
                  key={r.nameWithOwner}
                  repo={r}
                  added={added}
                  onClick={() => {
                    if (!added) {
                      onAdd(r.nameWithOwner);
                      onClose();
                    }
                  }}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function RepoRow({ repo, added, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={added}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "10px 12px",
        borderRadius: 8,
        border: "none",
        cursor: added ? "default" : "pointer",
        background: hovered && !added ? "var(--pane-hover)" : "transparent",
        transition: "background .15s",
        textAlign: "left",
        opacity: added ? 0.4 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.85)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {repo.nameWithOwner}
        </div>
        {repo.description && (
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 2,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {repo.description}
          </div>
        )}
      </div>
      {added && (
        <span
          style={{
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            color: "rgba(255,255,255,0.3)",
            letterSpacing: ".06em",
            marginLeft: 8,
            flexShrink: 0,
          }}
        >
          ADDED
        </span>
      )}
    </button>
  );
}
