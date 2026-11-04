import { track } from "./analytics.js";
import { formatNumber, formatRatio, formatShare, formatUpdated, normalise } from "./format.js";
import { isEarlyRegistrationOpen } from "./registration.js";
import { ZERO_FILL, buildScale } from "./scale.js";
import { searchCountries } from "./search.js";
import { countryCountFor, countryProfile, derive } from "./stats.js";

const d3 = globalThis.d3;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  atlas: null,
  geo: null,
  entries: [],
  streamId: "all",
  selectedId: null,
  hoverId: null,
  keyboardId: null,
  width: 0,
  height: 0,
  path: null,
  scaleK: 1,
};

let svg;
let group;
let zoomBehaviour;
let countryActive = 0;
let countryOpen = false;
let countryTyping = false;
let streamActive = 0;
let streamOpen = false;

const $ = (id) => document.getElementById(id);

document.querySelectorAll("[data-analytics]").forEach((link) => {
  link.addEventListener("click", () => track(link.dataset.analytics));
});

if (!isEarlyRegistrationOpen()) {
  $("early-note").hidden = true;
  $("register-refer").hidden = false;
}

boot();

async function boot() {
  if (!d3) {
    fail("The mapping library did not load.");
    return;
  }
  try {
    const [atlas, geo] = await Promise.all([
      fetch("data/atlas.json").then(readJson),
      fetch("geo/countries.geojson").then(readJson),
    ]);
    state.atlas = atlas;
    state.geo = geo;
    state.entries = buildEntries();
    $("status").hidden = true;
    $("app-body").hidden = false;
    bindControls();
    setupMap();
    render();
    scrollToHash();
  } catch (error) {
    console.error(error);
    fail("The submission figures could not be loaded. Please refresh the page.");
  }
}

function readJson(response) {
  if (!response.ok) throw new Error(`${response.url} returned HTTP ${response.status}`);
  return response.json();
}

function scrollToHash() {
  const hash = location.hash;
  if (!hash || hash === "#") return;
  let target = null;
  try {
    target = document.querySelector(hash);
  } catch {
    return;
  }
  if (target) target.scrollIntoView();
}

window.addEventListener("hashchange", scrollToHash);

function fail(message) {
  $("status").hidden = true;
  const error = $("error");
  error.hidden = false;
  error.querySelector("p").textContent = message;
}

function buildEntries() {
  const aliases = new Map(state.atlas.aliases.map((alias) => [alias.id, alias.terms]));
  const names = new Map(state.atlas.countries.map((country) => [country.id, country.name]));
  return state.geo.features.map((feature) => {
    const id = feature.properties.id;
    const name = names.get(id) || feature.properties.name;
    return { id, name, terms: [...new Set([name, feature.properties.name, ...(aliases.get(id) || [])])] };
  });
}

function view() {
  return derive(state.atlas, state.streamId);
}

function bindControls() {
  const options = [{ id: "all", name: "All scientific streams" }, ...state.atlas.streams];
  const menu = $("stream-menu");
  menu.replaceChildren();
  options.forEach((option, index) => {
    const item = document.createElement("li");
    item.setAttribute("role", "presentation");
    const button = document.createElement("button");
    button.type = "button";
    button.id = `stream-opt-${option.id}`;
    button.setAttribute("role", "option");
    button.textContent = option.name;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      chooseStream(option.id);
    });
    button.addEventListener("mouseenter", () => {
      streamActive = index;
      markStream();
    });
    item.append(button);
    menu.append(item);
  });

  $("stream-button").addEventListener("click", (event) => {
    event.stopPropagation();
    if (!streamOpen) closeCountryMenu(true);
    toggleStream(!streamOpen);
  });
  $("stream-button").addEventListener("keydown", onStreamKey);
  const countryInput = $("country-input");
  countryInput.addEventListener("focus", () => {
    countryTyping = false;
    closeStreamIfOpen();
    openCountryMenu();
    countryInput.select();
  });
  countryInput.addEventListener("input", () => {
    countryTyping = true;
    countryActive = 0;
    openCountryMenu();
  });
  countryInput.addEventListener("keydown", onCountryKey);
  countryInput.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (!$("country-filter").contains(document.activeElement)) closeCountryMenu(true);
    }, 0);
  });
  $("country-toggle").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (countryOpen) closeCountryMenu(true);
    else {
      countryTyping = false;
      const input = $("country-input");
      if (document.activeElement !== input) input.focus();
      else openCountryMenu();
    }
  });
  $("reset-filters").addEventListener("click", resetFilters);
  $("world-view").addEventListener("click", resetView);
  $("zoom-in").addEventListener("click", () => zoomBy(1.4));
  $("zoom-out").addEventListener("click", () => zoomBy(1 / 1.4));
  $("map-frame").addEventListener("keydown", onMapKey);
  document.addEventListener("pointerdown", (event) => {
    if (!$("stream-filter").contains(event.target)) toggleStream(false);
    if (!$("country-filter").contains(event.target)) closeCountryMenu(true);
  });
}

function chooseStream(id) {
  state.streamId = id;
  toggleStream(false);
  const name = id === "all" ? "all" : state.atlas.streams.find((stream) => stream.id === id).name;
  track("stream_select", { stream: name });
  render();
}

function closeStreamIfOpen() {
  if (streamOpen) toggleStream(false);
}

function toggleStream(open) {
  streamOpen = open;
  $("stream-menu").hidden = !open;
  $("stream-button").setAttribute("aria-expanded", String(open));
  if (open) {
    streamActive = Math.max(0, streamOptions().findIndex((option) => option.id === state.streamId));
    markStream();
  }
}

function streamOptions() {
  return [{ id: "all", name: "All scientific streams" }, ...state.atlas.streams];
}

function markStream() {
  const buttons = [...$("stream-menu").querySelectorAll("button")];
  buttons.forEach((button, index) => {
    const selected = button.id === `stream-opt-${state.streamId}`;
    button.setAttribute("aria-selected", String(selected));
    button.classList.toggle("is-active", index === streamActive);
  });
  const active = buttons[streamActive];
  if (active) $("stream-button").setAttribute("aria-activedescendant", active.id);
}

function onStreamKey(event) {
  const options = streamOptions();
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!streamOpen) toggleStream(true);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    streamActive = (streamActive + direction + options.length) % options.length;
    markStream();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (!streamOpen) toggleStream(true);
    else chooseStream(options[streamActive].id);
  } else if (event.key === "Escape") {
    toggleStream(false);
  }
}

function datasetCountryOptions() {
  return state.atlas.countries
    .map((country) => ({ id: country.id, name: country.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }));
}

function filteredCountryOptions() {
  const all = { id: "", name: "All countries" };
  const query = countryTyping ? $("country-input").value.trim() : "";
  if (!query) return [all, ...datasetCountryOptions()];
  const represented = new Set(state.atlas.countries.map((country) => country.id));
  const hits = searchCountries(query, state.entries, 30).filter((hit) => represented.has(hit.id));
  const options = [];
  if (normalise("all countries").includes(normalise(query))) options.push(all);
  options.push(...hits);
  return options;
}

function openCountryMenu() {
  closeStreamIfOpen();
  const options = filteredCountryOptions();
  const menu = $("country-menu");
  menu.replaceChildren();
  countryOpen = true;
  $("country-input").setAttribute("aria-expanded", "true");
  menu.hidden = false;
  if (options.length === 0) {
    const empty = document.createElement("li");
    empty.className = "search-empty";
    empty.textContent = "No matching country";
    menu.append(empty);
    $("country-input").removeAttribute("aria-activedescendant");
    return;
  }
  countryActive = Math.max(0, Math.min(countryActive, options.length - 1));
  if (!countryTyping && state.selectedId) {
    const selectedIndex = options.findIndex((option) => option.id === state.selectedId);
    if (selectedIndex >= 0) countryActive = selectedIndex;
  }
  options.forEach((option, index) => {
    const item = document.createElement("li");
    item.setAttribute("role", "presentation");
    const button = document.createElement("button");
    button.type = "button";
    button.id = `country-opt-${option.id || "all"}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(option.id === (state.selectedId || "")));
    button.textContent = option.name;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("mouseenter", () => {
      countryActive = index;
      markCountry();
    });
    button.addEventListener("click", () => chooseCountry(option.id));
    item.append(button);
    menu.append(item);
  });
  markCountry();
}

function markCountry() {
  const buttons = [...$("country-menu").querySelectorAll("button")];
  buttons.forEach((button, index) => button.classList.toggle("is-active", index === countryActive));
  const active = buttons[countryActive];
  if (!active) return;
  $("country-input").setAttribute("aria-activedescendant", active.id);
  const menu = $("country-menu");
  const top = active.offsetTop;
  const bottom = top + active.offsetHeight;
  if (top < menu.scrollTop) menu.scrollTop = top;
  else if (bottom > menu.scrollTop + menu.clientHeight) menu.scrollTop = bottom - menu.clientHeight;
}

function onCountryKey(event) {
  const options = filteredCountryOptions();
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!countryOpen) openCountryMenu();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const count = $("country-menu").querySelectorAll("button").length;
    if (count === 0) return;
    countryActive = (countryActive + direction + count) % count;
    markCountry();
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (!countryOpen) openCountryMenu();
    else if (options[countryActive]) chooseCountry(options[countryActive].id);
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeCountryMenu(true);
  } else if (event.key === "Tab") {
    closeCountryMenu(true);
  }
}

function chooseCountry(id) {
  countryTyping = false;
  closeCountryMenu(false);
  if (!id) clearCountry();
  else selectCountry(id, "dropdown");
}

function closeCountryMenu(restore) {
  countryOpen = false;
  $("country-menu").hidden = true;
  $("country-input").setAttribute("aria-expanded", "false");
  $("country-input").removeAttribute("aria-activedescendant");
  if (restore) {
    countryTyping = false;
    $("country-input").value = state.selectedId ? countryName(state.selectedId) : "";
  }
}

function renderCountryControl() {
  const input = $("country-input");
  if (!countryTyping || document.activeElement !== input) {
    countryTyping = false;
    input.value = state.selectedId ? countryName(state.selectedId) : "";
  }
  if (!countryOpen) input.setAttribute("aria-expanded", "false");
  updateResetButton();
}

function isDefaultView() {
  return state.streamId === "all" && !state.selectedId && state.scaleK <= 1.01;
}

function updateResetButton() {
  const button = $("reset-filters");
  if (!button) return;
  const idle = isDefaultView();
  button.disabled = idle;
  button.setAttribute("aria-disabled", String(idle));
}

function selectCountry(id, source) {
  if (source === "map" && state.selectedId === id) state.selectedId = null;
  else state.selectedId = id;
  const name = countryName(id);
  if (state.selectedId) {
    if (source === "dropdown") track("country_search", { country: name });
    else if (source === "ranking") track("ranking_select", { country: name });
    else track("country_select", { country: name, source });
    focusCountry(state.selectedId, true);
  } else {
    resetZoom(true);
  }
  render();
}

function clearCountry() {
  state.selectedId = null;
  state.keyboardId = null;
  resetZoom(true);
  render();
}

function resetFilters() {
  state.streamId = "all";
  state.selectedId = null;
  state.keyboardId = null;
  state.hoverId = null;
  countryTyping = false;
  closeCountryMenu(false);
  toggleStream(false);
  resetZoom(true);
  render();
}

function resetView() {
  state.selectedId = null;
  state.keyboardId = null;
  countryTyping = false;
  closeCountryMenu(false);
  resetZoom(true);
  render();
}

function countryName(id) {
  const country = state.atlas.countries.find((item) => item.id === id);
  const feature = state.geo.features.find((item) => item.properties.id === id);
  return (country && country.name) || (feature && feature.properties.name) || id;
}

function render() {
  const current = view();
  renderStats(current);
  renderFreshness();
  renderStreamLabel();
  renderCountryControl();
  renderSide(current);
  renderDirectory(current);
  renderInsights();
  renderMethod();
  paintMap();
  $("live-summary").textContent = summaryText(current);
}

function summaryText(current) {
  const leader = current.leadingCountry ? current.leadingCountry.name : "none";
  if (current.streamId === "all") {
    return `${formatNumber(current.submissionCount)} abstract submissions from ${formatNumber(current.countryCount)} countries. Leading country ${leader}. Top stream ${current.leadingStream.name}.`;
  }
  return `${current.streamName}: ${formatNumber(current.submissionCount)} submissions from ${formatNumber(current.countryCount)} countries. Leading country ${leader}.`;
}

function renderStats(current) {
  const filtered = current.streamId !== "all";
  $("stat-submissions").textContent = formatNumber(current.submissionCount);
  $("stat-submissions-detail").textContent = filtered ? current.streamName : "In this extract";
  $("stat-countries").textContent = formatNumber(current.countryCount);
  const leading = $("stat-leading");
  leading.textContent = current.leadingCountry ? current.leadingCountry.name : "—";
  $("stat-leading-detail").textContent = current.leadingCountry
    ? `${formatNumber(current.leadingCountry.count)} submissions`
    : "No submissions in this view.";
  const fourthLabel = $("stat-fourth-label");
  const fourth = $("stat-fourth");
  if (filtered) {
    fourthLabel.textContent = "Share of all abstracts";
    fourth.className = "stat-value numeric";
    fourth.textContent = formatShare(current.submissionCount, state.atlas.meta.counts.eligibleSubmissions);
    $("stat-fourth-detail").textContent = current.streamName;
  } else {
    fourthLabel.textContent = "Top scientific stream";
    fourth.className = "stat-value textual";
    fourth.textContent = current.leadingStream.name;
    $("stat-fourth-detail").textContent = `${formatNumber(current.leadingStream.count)} submissions`;
  }
}

function renderFreshness() {
  const sentence = `Figures prepared from the submission extract dated ${formatUpdated(state.atlas.meta.updatedAt)}. Updated periodically. This is not a live feed.`;
  $("freshness").textContent = sentence;
  $("footer-date").textContent = sentence;
}

function renderStreamLabel() {
  const current = state.streamId === "all"
    ? "All scientific streams"
    : state.atlas.streams.find((stream) => stream.id === state.streamId).name;
  $("stream-value").textContent = current;
  markStream();
}

function renderSide(current) {
  const side = $("side");
  side.replaceChildren();
  if (state.selectedId) side.append(profilePanel());
  else side.append(rankingPanel(current));
}

function rankingPanel(current) {
  const section = document.createElement("section");
  section.className = "ranking";
  section.setAttribute("aria-labelledby", "ranking-title");
  const head = document.createElement("div");
  head.className = "ranking-head";
  const title = document.createElement("h3");
  title.id = "ranking-title";
  title.textContent = "Top countries";
  const note = document.createElement("p");
  note.textContent = current.streamName || "All abstract submissions";
  head.append(title, note);
  const list = document.createElement("ol");
  const max = current.ranking[0] ? current.ranking[0].count : 1;
  current.ranking.forEach((row) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(row.id === state.selectedId));
    if (row.id === state.selectedId) button.classList.add("is-selected");
    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = String(row.rank);
    const copy = document.createElement("span");
    copy.className = "rank-copy";
    const name = document.createElement("span");
    name.className = "rank-name";
    name.textContent = row.name;
    const meta = document.createElement("span");
    meta.className = "rank-meta";
    meta.textContent = `${formatNumber(row.count)} · ${formatRatio(row.share)}`;
    const track = document.createElement("span");
    track.className = "rank-track";
    track.setAttribute("aria-hidden", "true");
    const bar = document.createElement("span");
    bar.style.width = `${(row.count / max) * 100}%`;
    track.append(bar);
    copy.append(name, meta, track);
    button.append(rank, copy);
    button.addEventListener("click", () => selectCountry(row.id, "ranking"));
    item.append(button);
    list.append(item);
  });
  section.append(head, list);
  return section;
}

function profilePanel() {
  const feature = state.geo.features.find((item) => item.properties.id === state.selectedId);
  const profile = countryProfile(state.atlas, state.selectedId, state.streamId, feature ? feature.properties.name : state.selectedId);
  const filtered = state.streamId !== "all";
  const section = document.createElement("section");
  section.className = "profile";
  section.setAttribute("aria-labelledby", "profile-title");
  const toolbar = document.createElement("div");
  toolbar.className = "profile-toolbar";
  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "Back to ranking";
  back.addEventListener("click", clearCountry);
  toolbar.append(back);
  const kicker = document.createElement("p");
  kicker.className = "profile-kicker";
  const stream = state.atlas.streams.find((item) => item.id === state.streamId);
  kicker.textContent = filtered && stream ? stream.name : "All abstract submissions";
  const title = document.createElement("h3");
  title.id = "profile-title";
  title.textContent = profile.name;
  const count = document.createElement("p");
  count.className = "profile-count";
  count.textContent = formatNumber(filtered ? profile.viewCount : profile.overallCount);
  const share = document.createElement("p");
  share.className = "profile-share";
  share.append(document.createTextNode(`${formatRatio(profile.share)} `));
  const shareNote = document.createElement("span");
  shareNote.textContent = "share of this view";
  share.append(shareNote);
  section.append(toolbar, kicker, title, count, share);
  if (filtered) {
    const overall = document.createElement("p");
    overall.className = "profile-overall";
    overall.textContent = `All abstracts from this country: ${formatNumber(profile.overallCount)}`;
    section.append(overall);
  }
  const leading = document.createElement("p");
  leading.className = "profile-leading";
  const leadingLabel = document.createElement("span");
  leadingLabel.textContent = "Leading stream";
  leading.append(leadingLabel, document.createTextNode(profile.leadingStreamName || "—"));
  section.append(leading);
  if (profile.viewCount === 0) {
    const empty = document.createElement("p");
    empty.className = "profile-empty";
    empty.textContent = `No submissions from ${profile.name} in this scientific stream.`;
    section.append(empty);
  }
  const heading = document.createElement("h4");
  heading.textContent = "Submissions by scientific stream";
  const order = document.createElement("p");
  order.className = "profile-order";
  order.textContent = "Shown in FIGO programme order.";
  const bars = document.createElement("ul");
  bars.className = "stream-bars";
  const max = Math.max(1, ...profile.streams.map((stream) => stream.count));
  profile.streams.forEach((stream) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.className = "bar-name";
    name.textContent = stream.name;
    const track = document.createElement("span");
    track.className = "bar-track";
    track.setAttribute("aria-hidden", "true");
    const bar = document.createElement("span");
    bar.style.width = `${(stream.count / max) * 100}%`;
    track.append(bar);
    const value = document.createElement("span");
    value.className = "bar-count";
    value.textContent = formatNumber(stream.count);
    item.append(name, track, value);
    bars.append(item);
  });
  section.append(heading, order, bars);
  return section;
}

function renderDirectory(current) {
  const rows = state.atlas.countries
    .map((country) => ({ id: country.id, name: country.name, count: countryCountFor(country, state.streamId) }))
    .filter((country) => country.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }));
  $("directory-count").textContent = formatNumber(rows.length);
  const list = $("directory-list");
  list.replaceChildren();
  rows.forEach((row) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    const name = document.createElement("span");
    name.textContent = row.name;
    const count = document.createElement("span");
    count.textContent = formatNumber(row.count);
    button.append(name, count);
    button.addEventListener("click", () => selectCountry(row.id, "directory"));
    item.append(button);
    list.append(item);
  });
}

function renderInsights() {
  const insights = state.atlas.insights;
  const widest = insights.streamCountryCounts.find((stream) => stream.id === insights.widestStreamId);
  $("insight-widest-number").textContent = formatNumber(widest.countries);
  $("insight-widest-text").textContent = `${widest.name} includes submissions from ${formatNumber(widest.countries)} countries, the broadest geographic spread in this extract.`;
  $("insight-seven-number").textContent = formatNumber(insights.countriesInAllStreams.length);
  $("insight-seven-text").textContent = `${formatNumber(insights.countriesInAllStreams.length)} countries have at least one submission in all seven scientific streams.`;
  $("insight-continents-number").textContent = formatNumber(insights.continents.length);
  $("insight-continents-text").textContent = `Matched submissions come from ${formatNumber(state.atlas.meta.counts.countriesRepresented)} countries in ${insights.continents.join(", ")}.`;
}

function renderMethod() {
  const counts = state.atlas.meta.counts;
  $("method-eligibility").textContent = state.atlas.meta.eligibility;
  $("method-unlocated").textContent = `${formatNumber(state.atlas.meta.unlocatedSubmissions)} submissions are included in the submission total and left off the map because the country was blank or could not be matched. Blank country values: ${formatNumber(counts.blankCountry)}. Unmatched country values: ${formatNumber(counts.unmatchedCountrySubmissions)}.`;
  $("method-ties").textContent = state.atlas.meta.tieBreak;
}

function setupMap() {
  svg = d3.select("#map-svg");
  group = svg.select("g.viewport");
  zoomBehaviour = d3.zoom()
    .scaleExtent([1, 6])
    .filter((event) => {
      if (event.type === "wheel" || event.type === "dblclick") return false;
      if (event.type === "touchstart" && event.touches && event.touches.length < 2 && state.scaleK <= 1.01) return false;
      return !event.button;
    })
    .on("zoom", (event) => {
      group.attr("transform", event.transform);
      state.scaleK = event.transform.k;
      $("map-svg").classList.toggle("is-zoomed", event.transform.k > 1.01);
      updateResetButton();
    });
  svg.call(zoomBehaviour);
  const frame = $("map-frame");
  const observer = new ResizeObserver(() => layoutMap(false));
  observer.observe(frame);
  layoutMap(false);
}

function layoutMap(animate) {
  const frame = $("map-frame");
  const width = Math.round(frame.clientWidth);
  const height = Math.round(frame.clientHeight);
  if (width < 20 || height < 20) return;
  const resized = width !== state.width || height !== state.height;
  state.width = width;
  state.height = height;
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  const projection = d3.geoEqualEarth().fitExtent([[8, 8], [width - 8, height - 8]], { type: "Sphere" });
  state.path = d3.geoPath(projection);
  if (group.select(".sphere").empty()) {
    group.append("path").attr("class", "sphere");
    group.append("path").attr("class", "graticule");
  }
  group.select(".sphere").attr("d", state.path({ type: "Sphere" }));
  group.select(".graticule").attr("d", state.path(d3.geoGraticule().step([20, 20])()));
  group.selectAll("path.country")
    .data(state.geo.features, (feature) => feature.properties.id)
    .join((enter) => {
      const paths = enter.append("path")
        .attr("class", "country")
        .on("mouseenter", onEnter)
        .on("mousemove", onMove)
        .on("mouseleave", onLeave)
        .on("click", (event, feature) => {
          event.stopPropagation();
          selectCountry(feature.properties.id, "map");
        });
      paths.append("title").text((feature) => feature.properties.name);
      return paths;
    })
    .attr("d", state.path);
  paintMap();
  if (!resized && !animate) return;
  if (state.selectedId) focusCountry(state.selectedId, animate);
  else resetZoom(false);
}

function paintMap() {
  if (!state.path) return;
  const current = view();
  const scale = buildScale([...current.countsById.values()]);
  group.selectAll("path.country")
    .attr("fill", (feature) => scale.color(current.countsById.get(feature.properties.id) || 0))
    .attr("stroke", (feature) => strokeFor(feature, current))
    .classed("is-active", (feature) => feature.properties.id === state.selectedId || feature.properties.id === state.hoverId || feature.properties.id === state.keyboardId);
  if (state.selectedId) {
    group.selectAll("path.country").filter((feature) => feature.properties.id === state.selectedId).raise();
  }
  renderLegend(scale);
}

function strokeFor(feature, current) {
  const id = feature.properties.id;
  const value = current.countsById.get(id) || 0;
  if (id === state.selectedId) return "#ffffff";
  if (id === state.hoverId || id === state.keyboardId) return "#98D4E4";
  return value > 0 ? "rgba(16,24,47,0.35)" : "rgba(152,212,228,0.28)";
}

function renderLegend(scale) {
  const list = $("legend-list");
  list.replaceChildren();
  const none = document.createElement("li");
  const swatch = document.createElement("span");
  swatch.style.background = ZERO_FILL;
  none.append(swatch, document.createTextNode("No submissions"));
  list.append(none);
  scale.legend.forEach((item) => {
    const row = document.createElement("li");
    const chip = document.createElement("span");
    chip.style.background = item.fill;
    row.append(chip, document.createTextNode(item.label));
    list.append(row);
  });
}

function onEnter(event, feature) {
  state.hoverId = feature.properties.id;
  paintMap();
  showTip(feature.properties.id, event);
}

function onMove(event) {
  moveTip(event.clientX, event.clientY);
}

function onLeave() {
  state.hoverId = null;
  $("tooltip").classList.remove("is-visible");
  paintMap();
}

function showTip(id, event) {
  const info = describe(id);
  const tip = $("tooltip");
  tip.replaceChildren();
  const name = document.createElement("strong");
  name.textContent = info.name;
  const count = document.createElement("span");
  count.textContent = `${formatNumber(info.count)} submissions`;
  const share = document.createElement("span");
  share.textContent = `${info.share} of this view`;
  tip.append(name, count, share);
  if (info.leading) {
    const leading = document.createElement("span");
    leading.textContent = `Leading stream: ${info.leading}`;
    tip.append(leading);
  }
  tip.classList.add("is-visible");
  moveTip(event.clientX, event.clientY);
}

function describe(id) {
  const country = state.atlas.countries.find((item) => item.id === id);
  const current = view();
  const count = current.countsById.get(id) || 0;
  const leading = country && country.leadingStreamId
    ? state.atlas.streams.find((stream) => stream.id === country.leadingStreamId)
    : null;
  return {
    name: countryName(id),
    count,
    share: formatShare(count, current.submissionCount),
    leading: count > 0 && leading ? leading.name : null,
  };
}

function moveTip(clientX, clientY) {
  const tip = $("tooltip");
  const pad = 12;
  const width = tip.offsetWidth || 220;
  const height = tip.offsetHeight || 96;
  let x = clientX + 16;
  let y = clientY + 16;
  if (x + width > window.innerWidth - pad) x = clientX - width - 16;
  if (y + height > window.innerHeight - pad) y = clientY - height - 16;
  tip.style.transform = `translate(${Math.max(pad, x)}px, ${Math.max(72, y)}px)`;
}

function focusCountry(id, animate) {
  const feature = state.geo.features.find((item) => item.properties.id === id);
  if (!feature || !state.path || !zoomBehaviour) return;
  const [[x0, y0], [x1, y1]] = state.path.bounds(feature);
  const dx = Math.max(x1 - x0, 1);
  const dy = Math.max(y1 - y0, 1);
  const fit = Math.max(1, Math.min(6, 0.58 / Math.max(dx / state.width, dy / state.height)));
  const next = d3.zoomIdentity
    .translate(state.width / 2, state.height / 2)
    .scale(fit)
    .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  svg.transition().duration(animate && !reducedMotion ? 650 : 0).call(zoomBehaviour.transform, next);
}

function resetZoom(animate) {
  if (!zoomBehaviour) return;
  svg.transition().duration(animate && !reducedMotion ? 650 : 0).call(zoomBehaviour.transform, d3.zoomIdentity);
}

function zoomBy(factor) {
  if (!zoomBehaviour) return;
  svg.transition().duration(reducedMotion ? 0 : 220).call(zoomBehaviour.scaleBy, factor);
}

function onMapKey(event) {
  const current = view();
  const navigable = state.geo.features
    .map((feature) => ({
      id: feature.properties.id,
      name: countryName(feature.properties.id),
      count: current.countsById.get(feature.properties.id) || 0,
    }))
    .filter((feature) => feature.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }));
  if (navigable.length === 0) return;
  const index = Math.max(0, navigable.findIndex((item) => item.id === (state.keyboardId || state.selectedId)));
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    event.preventDefault();
    setKeyboard(navigable[(index + 1) % navigable.length]);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    setKeyboard(navigable[(index - 1 + navigable.length) % navigable.length]);
  } else if (event.key === "Enter") {
    event.preventDefault();
    selectCountry((state.keyboardId && navigable.some((item) => item.id === state.keyboardId)) ? state.keyboardId : navigable[index].id, "map");
  } else if (event.key === "Escape") {
    state.keyboardId = null;
    $("keyboard-country").hidden = true;
    paintMap();
  }
}

function setKeyboard(item) {
  state.keyboardId = item.id;
  const note = $("keyboard-country");
  note.hidden = false;
  note.textContent = `${item.name}, ${formatNumber(item.count)} submissions`;
  paintMap();
}
