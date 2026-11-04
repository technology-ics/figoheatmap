export function countryCountFor(country, streamId) {
  if (streamId === "all") return country.count;
  return country.streams[streamId] || 0;
}

function compareCountries(a, b) {
  return b.count - a.count || a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

export function derive(atlas, streamId) {
  const stream = streamId === "all" ? null : atlas.streams.find((item) => item.id === streamId) || null;
  const submissionCount = streamId === "all" ? atlas.meta.counts.eligibleSubmissions : atlas.meta.streamTotals[streamId];
  const rows = atlas.countries
    .map((country) => ({
      id: country.id,
      name: country.name,
      count: countryCountFor(country, streamId),
    }))
    .filter((row) => row.count > 0)
    .sort(compareCountries);

  const leadingStream = atlas.streams.slice().sort((a, b) => {
    const difference = atlas.meta.streamTotals[b.id] - atlas.meta.streamTotals[a.id];
    if (difference !== 0) return difference;
    return a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" });
  })[0];

  return {
    streamId,
    streamName: stream ? stream.name : null,
    submissionCount,
    countryCount: rows.length,
    leadingCountry: rows[0] || null,
    leadingStream: {
      id: leadingStream.id,
      name: leadingStream.name,
      count: atlas.meta.streamTotals[leadingStream.id],
    },
    countsById: new Map(rows.map((row) => [row.id, row.count])),
    ranking: rankTop(rows, submissionCount, 10),
    rows,
  };
}

export function rankTop(rows, total, limit) {
  const sorted = rows.slice().sort(compareCountries);
  if (sorted.length === 0) return [];
  const cutoff = sorted.length > limit ? sorted[limit - 1].count : sorted[sorted.length - 1].count;
  const kept = sorted.filter((row, index) => index < limit || row.count === cutoff);
  return kept.map((row, index) => ({
    ...row,
    rank: competitionRank(kept, index),
    share: total > 0 ? row.count / total : 0,
  }));
}

function competitionRank(rows, index) {
  let rank = 1;
  for (let i = 1; i <= index; i += 1) {
    if (rows[i].count !== rows[i - 1].count) rank = i + 1;
  }
  return rank;
}

export function countryProfile(atlas, countryId, streamId, displayName) {
  const country = atlas.countries.find((item) => item.id === countryId);
  const view = derive(atlas, streamId);
  const viewCount = country ? countryCountFor(country, streamId) : 0;
  const leading = country && country.leadingStreamId
    ? atlas.streams.find((stream) => stream.id === country.leadingStreamId)
    : null;
  return {
    id: countryId,
    name: country ? country.name : displayName,
    viewCount,
    overallCount: country ? country.count : 0,
    share: view.submissionCount > 0 ? viewCount / view.submissionCount : 0,
    leadingStreamName: leading ? leading.name : null,
    streams: atlas.streams.map((stream) => ({
      id: stream.id,
      name: stream.name,
      count: country ? country.streams[stream.id] || 0 : 0,
    })),
  };
}
