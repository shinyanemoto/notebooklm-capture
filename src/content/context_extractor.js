'use strict';

(() => {
  function nowTimestamp() {
    return new Date().toISOString();
  }

  function extractSlackContext() {
    if (!location.hostname.endsWith('slack.com')) {
      return null;
    }

    const workspace = location.hostname.replace('.slack.com', '');
    const pathSegments = location.pathname.split('/').filter(Boolean);

    let channel = null;
    let messagePermalink = null;

    if (pathSegments[0] === 'archives' && pathSegments[1]) {
      channel = pathSegments[1];

      const messageToken = pathSegments[2];
      if (messageToken && messageToken.startsWith('p')) {
        messagePermalink = `https://${location.hostname}/archives/${channel}/${messageToken}`;
      }
    }

    return {
      workspace,
      channel,
      messagePermalink
    };
  }

  function extractContext() {
    const context = {
      timestamp: nowTimestamp(),
      title: document.title || '',
      url: location.href,
      hostname: location.hostname
    };

    const slack = extractSlackContext();
    if (slack) {
      context.slack = slack;
    }

    return context;
  }

  window.NotebookLMCaptureContextExtractor = {
    extractContext,
    extractSlackContext
  };
})();
