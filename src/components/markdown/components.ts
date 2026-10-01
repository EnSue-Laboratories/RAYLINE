/**
 * The ONE markdown components map (module constant). Font scale and render
 * state come from context, so the map never changes identity and blocks are
 * never remounted when a stream finishes (PERF #5).
 */
import type { Components } from "react-markdown";
import {
  Anchor,
  Blockquote,
  Code,
  H1,
  H2,
  H3,
  Img,
  ListItem,
  OrderedList,
  Paragraph,
  Pre,
  Rule,
  Strong,
  Table,
  TableCell,
  TableHead,
  TableHeader,
  UnorderedList,
} from "./elements";

export const MARKDOWN_COMPONENTS: Components = {
  p: Paragraph,
  code: Code,
  pre: Pre,
  img: Img,
  ul: UnorderedList,
  ol: OrderedList,
  li: ListItem,
  h1: H1,
  h2: H2,
  h3: H3,
  blockquote: Blockquote,
  a: Anchor,
  strong: Strong,
  table: Table,
  thead: TableHead,
  th: TableHeader,
  td: TableCell,
  hr: Rule,
};
