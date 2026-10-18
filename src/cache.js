// Cache only public football data, never conversational responses.
function createCache({ now = Date.now, maxEntries = 250 } = {}) {
  const values = new Map();
  const pending = new Map();
  return async function cached(key, ttl, fetchValue) {
    const hit = values.get(key);
    if (hit && hit.expires > now()) return structuredClone(hit.value);
    if (pending.has(key)) return structuredClone(await pending.get(key));
    const task = Promise.resolve().then(fetchValue).then((value) => {
      values.delete(key);
      if (values.size >= maxEntries) values.delete(values.keys().next().value);
      values.set(key, { value: structuredClone(value), expires: now() + ttl });
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, task);
    return structuredClone(await task);
  };
}
module.exports = { createCache };
