(function () {
  const capturedLogs = [];
  const MAX_LOGS = 40;

  function addLog(type, args) {
    const content = Array.from(args).map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    const trimmedContent = content.length > 500 ? content.slice(0, 500) : content;

    capturedLogs.push({
      type: type,
      content: trimmedContent,
      timestamp: Date.now()
    });

    if (capturedLogs.length > MAX_LOGS) {
      capturedLogs.shift();
    }
  }

  function hookConsole(win) {
    if (!win || !win.console) return;
    if (win.console.__ezHooked) return;

    try {
      const originalLog = win.console.log;
      const originalInfo = win.console.info;
      const originalError = win.console.error;
      const originalWarn = win.console.warn;
      const originalDebug = win.console.debug;

      win.console.log = function (...args) {
        addLog('log', args);
        if (originalLog) originalLog.apply(win.console, args);
      };

      win.console.info = function (...args) {
        addLog('info', args);
        if (originalInfo) originalInfo.apply(win.console, args);
      };

      win.console.error = function (...args) {
        addLog('error', args);
        if (originalError) originalError.apply(win.console, args);
      };

      win.console.warn = function (...args) {
        addLog('warn', args);
        if (originalWarn) originalWarn.apply(win.console, args);
      };

      win.console.debug = function (...args) {
        addLog('debug', args);
        if (originalDebug) originalDebug.apply(win.console, args);
      };

      win.console.__ezHooked = true;
    } catch (e) {

    }
  }

  hookConsole(window);

  function hookAllFrames() {
    try {
      for (let i = 0; i < window.frames.length; i++) {
        try {
          hookConsole(window.frames[i]);
        } catch (e) {}
      }
    } catch (e) {}
  }
  hookAllFrames();

  try {
    const observer = new MutationObserver((mutations) => {
      for (let m = 0; m < mutations.length; m++) {
        const addedNodes = mutations[m].addedNodes;
        for (let n = 0; n < addedNodes.length; n++) {
          const node = addedNodes[n];
          if (!node || node.nodeType !== 1) continue;
          if (node.tagName === 'IFRAME') {
            node.addEventListener('load', () => {
              try { hookConsole(node.contentWindow); } catch (e) {}
            }, { once: true });
            try { hookConsole(node.contentWindow); } catch (e) {}
          } else if (node.getElementsByTagName) {
            const iframes = node.getElementsByTagName('iframe');
            for (let k = 0; k < iframes.length; k++) {
              const iframe = iframes[k];
              iframe.addEventListener('load', () => {
                try { hookConsole(iframe.contentWindow); } catch (e) {}
              }, { once: true });
              try { hookConsole(iframe.contentWindow); } catch (e) {}
            }
          }
        }
      }
    });

    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true
    });
  } catch (e) {}

  window.addEventListener('GET_EZ_LOGS_REQ', () => {
    window.dispatchEvent(new CustomEvent('EZ_LOGS_RESPONSE_EV', {
      detail: capturedLogs
    }));
  });
})();
