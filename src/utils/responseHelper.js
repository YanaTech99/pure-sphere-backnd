export function replaceNullWithBlank(data) {
  if (data === null) return "";

  if (Array.isArray(data)) {
    return data.map(item => replaceNullWithBlank(item));
  }

  if (typeof data === "object" && data !== null) {
    const result = {};
    for (const key in data) {
      result[key] = replaceNullWithBlank(data[key]);
    }
    return result;
  }

  return data;
}
