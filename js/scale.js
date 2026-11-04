export const ZERO_FILL = "#243864";
const CHOROPLETH = ["#F6D5CF", "#F0A79C", "#EA5042", "#C42820", "#8E1512"];

function colorForClass(index, classCount) {
  if (classCount <= 1) return CHOROPLETH[CHOROPLETH.length - 1];
  const slot = Math.round((index * (CHOROPLETH.length - 1)) / (classCount - 1));
  return CHOROPLETH[slot];
}

export function buildScale(values) {
  const positive = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (positive.length === 0) return { color: () => ZERO_FILL, legend: [] };

  const bins = Math.min(5, new Set(positive).size);
  const thresholds = [];
  for (let i = 1; i < bins; i += 1) {
    const value = positive[Math.floor((positive.length * i) / bins)];
    if (value > positive[0] && (thresholds.length === 0 || value > thresholds[thresholds.length - 1])) {
      thresholds.push(value);
    }
  }

  const classCount = thresholds.length + 1;
  const color = (value) => {
    if (value <= 0) return ZERO_FILL;
    let index = 0;
    for (const threshold of thresholds) {
      if (value >= threshold) index += 1;
      else break;
    }
    return colorForClass(index, classCount);
  };

  const legend = [];
  for (let index = 0; index < classCount; index += 1) {
    const start = index === 0 ? positive[0] : thresholds[index - 1];
    const end = index === thresholds.length ? positive[positive.length - 1] : thresholds[index] - 1;
    legend.push({
      fill: colorForClass(index, classCount),
      label: start >= end ? String(start) : `${start}–${end}`,
    });
  }
  return { color, legend };
}
