(() => {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const localApiRequested = new URLSearchParams(window.location.search).get("api") === "local";

  window.BOOK_JAS_CONFIG = {
    // A local preview uses the API when the page is opened with ?api=local.
    apiBaseUrl: localHosts.has(window.location.hostname) && localApiRequested
      ? "http://127.0.0.1:8787"
      : "https://book-api.medax.ai",
  };
})();
