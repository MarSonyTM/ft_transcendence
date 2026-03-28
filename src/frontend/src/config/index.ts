const isHttps = window.location.href. includes("https") ? true : false;
export const API_BASE = (isHttps ? "https://" : "http://") + window.location.hostname + ":8443"