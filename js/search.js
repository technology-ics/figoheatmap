import { normalise } from "./format.js";

function matchScore(entry, needle) {
  const name = normalise(entry.name);
  const terms = entry.terms.map((term) => normalise(term));
  const haystack = [name, ...terms];
  if (!haystack.some((term) => term.includes(needle))) return null;
  if (haystack.some((term) => term === needle)) return 0;
  if (name.startsWith(needle)) return 1;
  if (terms.some((term) => term.startsWith(needle))) return 2;
  return 3;
}

export function searchCountries(query, entries, limit = 8) {
  const needle = normalise(query);
  if (needle.length < 2) return [];
  return entries
    .map((entry) => ({ entry, score: matchScore(entry, needle) }))
    .filter((item) => item.score !== null)
    .sort((a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name, "en-GB", { sensitivity: "base" }))
    .slice(0, limit)
    .map((item) => ({ id: item.entry.id, name: item.entry.name }));
}
