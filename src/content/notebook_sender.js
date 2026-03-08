'use strict';

(() => {
  const api = {
    async sendMemo(_memoText) {
      return { ok: false, reason: 'not_implemented' };
    }
  };

  window.NotebookLMCaptureSender = api;
})();
