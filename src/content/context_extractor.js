'use strict';

(() => {
  const api = {
    extract() {
      return {
        timestamp: new Date().toISOString(),
        title: document.title || '',
        url: location.href,
        hostname: location.hostname
      };
    }
  };

  window.NotebookLMCaptureContextExtractor = api;
})();
