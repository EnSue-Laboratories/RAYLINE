import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import type { PluggableList } from "unified";
import { sanitizeSchema } from "./sanitizeSchema";

/** Raw HTML is parsed (parse5) and then sanitized; only used when the text has tags. */
export const htmlRehypePlugins: PluggableList = [rehypeRaw, [rehypeSanitize, sanitizeSchema]];
