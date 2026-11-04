const numberFormat = new Intl.NumberFormat("en-GB");
const shareFormat = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatNumber(value) {
  return numberFormat.format(value);
}

export function formatShare(count, total) {
  if (total <= 0 || count <= 0) return "0%";
  return formatRatio(count / total);
}

export function formatRatio(share) {
  if (share <= 0) return "0%";
  const pct = share * 100;
  if (pct < 0.05) return "<0.1%";
  return `${shareFormat.format(pct)}%`;
}

export function formatUpdated(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(date);
}

export function normalise(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['’`]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
