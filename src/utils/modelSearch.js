const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase();

export function filterModels(models, query) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return models.filter((model) => {
    const text = normalize([model.name, model.tag, model.provider, model.cliFlag, model.effort, model.grokContinue ? "continue project 继续项目" : ""].join(" "));
    const compact = text.replace(/[^\p{L}\p{N}]/gu, "");
    return words.every((word) => {
      const normalized = word.replace(/[^\p{L}\p{N}]/gu, "");
      return text.includes(word) || (normalized.length > 0 && compact.includes(normalized));
    });
  });
}
