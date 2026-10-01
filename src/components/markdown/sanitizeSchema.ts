import { defaultSchema, type Options as Schema } from "rehype-sanitize";

/**
 * rehype-sanitize schema: the GitHub default plus inline SVG, and `data:` /
 * `file:` image sources so model-emitted inline images render.
 */
export const sanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "svg", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "g", "defs", "use", "text", "tspan", "marker", "pattern", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "animate", "animateTransform", "animateMotion", "set", "foreignObject"],
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), "data", "file"],
  },
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img ?? []), "alt", "title", "loading", "decoding", "width", "height"],
    svg: ["viewBox", "width", "height", "xmlns", "fill", "stroke", "strokeWidth", "style", "class", "id", "preserveAspectRatio", "opacity"],
    path: ["d", "fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "opacity", "transform", "style", "class", "id"],
    circle: ["cx", "cy", "r", "fill", "stroke", "strokeWidth", "opacity", "transform", "style", "class", "id"],
    rect: ["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "strokeWidth", "opacity", "transform", "style", "class", "id"],
    line: ["x1", "y1", "x2", "y2", "stroke", "strokeWidth", "opacity", "transform", "style", "class", "id"],
    polyline: ["points", "fill", "stroke", "strokeWidth", "opacity", "transform", "style", "class", "id"],
    polygon: ["points", "fill", "stroke", "strokeWidth", "opacity", "transform", "style", "class", "id"],
    ellipse: ["cx", "cy", "rx", "ry", "fill", "stroke", "strokeWidth", "opacity", "transform", "style", "class", "id"],
    g: ["transform", "fill", "stroke", "strokeWidth", "opacity", "style", "class", "id"],
    text: ["x", "y", "dx", "dy", "textAnchor", "dominantBaseline", "fill", "fontSize", "fontFamily", "fontWeight", "transform", "style", "class", "id"],
    tspan: ["x", "y", "dx", "dy", "fill", "style", "class", "id"],
    linearGradient: ["id", "x1", "y1", "x2", "y2", "gradientUnits", "gradientTransform"],
    radialGradient: ["id", "cx", "cy", "r", "fx", "fy", "gradientUnits", "gradientTransform"],
    stop: ["offset", "stopColor", "stopOpacity", "style"],
    animate: ["attributeName", "from", "to", "dur", "repeatCount", "fill", "begin"],
    animateTransform: ["attributeName", "type", "from", "to", "dur", "repeatCount", "fill", "begin"],
    use: ["href", "x", "y", "width", "height"],
    defs: [],
    clipPath: ["id"],
    mask: ["id"],
    marker: ["id", "viewBox", "refX", "refY", "markerWidth", "markerHeight", "orient"],
    pattern: ["id", "x", "y", "width", "height", "patternUnits"],
    foreignObject: ["x", "y", "width", "height"],
  },
};
