export const env = {
  API_URL: import.meta.env.VITE_URL || `${window.location.origin}`,
  WS_URL: import.meta.env.VITE_WS || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`,
  VERSION: import.meta.env.VITE_VERSION,
  GIT_URL: "https://github.com/TimP4w/Phi"
};
