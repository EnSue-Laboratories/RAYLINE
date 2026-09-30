const fs = require("node:fs");

// A sync close-time snapshot must supersede any in-flight asynchronous save.
// Each write uses a separate temporary file; the destination is always valid JSON.
function createStateStore(file, io = fs) {
  let revision = 0;
  let pending = Promise.resolve();
  function save(state) {
    const current = ++revision;
    const json = JSON.stringify(state);
    const temp = `${file}.${process.pid}.${current}.tmp`;
    const operation = pending.catch(() => {}).then(async () => {
      if (current !== revision) return true;
      try {
        await io.promises.writeFile(temp, json, { mode: 0o600 });
        // No asynchronous gap between this check and rename: a synchronous
        // close-time save cannot be overwritten by an older pending write.
        if (current === revision) io.renameSync(temp, file);
        return true;
      } finally {
        try { await io.promises.unlink(temp); } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
    });
    pending = operation;
    return operation;
  }
  function saveSync(state) {
    const current = ++revision;
    const temp = `${file}.${process.pid}.${current}.tmp`;
    try {
      io.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
      io.renameSync(temp, file);
      return true;
    } finally {
      try { io.unlinkSync(temp); } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  return { save, saveSync };
}

module.exports = { createStateStore };
