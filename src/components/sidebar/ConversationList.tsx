import { useCallback, useState, type UIEvent } from "react";
import ConversationRow from "./ConversationRow";
import {
  computeVirtualWindow,
  getConversationRowHeight,
  PROJECT_CONVO_BASE_ROW_HEIGHT,
  PROJECT_CONVO_MAX_HEIGHT,
  PROJECT_CONVO_VIRTUALIZE_AFTER,
} from "./virtualWindow";
import type { DeleteConversation, ExtraModels, FontScale, SelectConversation, SidebarConversation } from "./types";

export interface ConversationListProps {
  convos: readonly SidebarConversation[];
  active: string | null | undefined;
  onSelect: SelectConversation;
  onDelete: DeleteConversation;
  multicaModels: ExtraModels;
  s: FontScale;
}

/** A project's chats; windowed once it has more than 8 rows. */
export default function ConversationList({ convos, active, onSelect, onDelete, multicaModels, s }: ConversationListProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const rowHeight = getConversationRowHeight(s(PROJECT_CONVO_BASE_ROW_HEIGHT));

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  if (convos.length <= PROJECT_CONVO_VIRTUALIZE_AFTER) {
    return (
      <div
        className="folder-convo-scroll"
        style={{
          maxHeight: PROJECT_CONVO_MAX_HEIGHT,
          overflowY: convos.length > 4 ? "auto" : "visible",
          overflowX: "hidden",
          contain: "layout paint style",
        }}
      >
        {convos.map((c) => (
          <ConversationRow
            key={c.id}
            conversation={c}
            isActive={c.id === active}
            onSelect={onSelect}
            onDelete={onDelete}
            multicaModels={multicaModels}
            rowHeight={rowHeight}
            s={s}
          />
        ))}
      </div>
    );
  }

  const { viewportHeight, totalHeight, startIndex, endIndex } = computeVirtualWindow(convos.length, rowHeight, scrollTop);
  const visible = convos.slice(startIndex, endIndex);

  return (
    <div
      className="folder-convo-scroll"
      onScroll={handleScroll}
      style={{
        height: viewportHeight,
        maxHeight: PROJECT_CONVO_MAX_HEIGHT,
        overflowY: "auto",
        overflowX: "hidden",
        position: "relative",
        contain: "layout paint style",
      }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visible.map((c, index) => (
          <ConversationRow
            key={c.id}
            conversation={c}
            isActive={c.id === active}
            onSelect={onSelect}
            onDelete={onDelete}
            multicaModels={multicaModels}
            rowHeight={rowHeight}
            s={s}
            top={(startIndex + index) * rowHeight}
          />
        ))}
      </div>
    </div>
  );
}
