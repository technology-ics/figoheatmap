export function track(name, detail) {
  const hook = window.figoAnalytics;
  if (!hook || typeof hook.track !== "function") return;
  hook.track(name, detail);
}
