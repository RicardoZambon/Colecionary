export const environment = {
  // Reached via varying hosts (container IP, umbrel.local, localhost); call the
  // API on the same host the app was served from, port 5100.
  apiBaseUrl: `http://${window.location.hostname}:5100/api`,
};
