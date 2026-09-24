import { defineContentScript } from 'wxt/utils/define-content-script';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Board } from './board/Board';
import s from './style.css?inline';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    if (document.getElementById('tabyrinth-board-root')) return;

    const container = document.createElement('div');
    container.id = 'tabyrinth-board-root';

    const shadow = container.attachShadow({ mode: 'open' });

    const styleTag = document.createElement('style');
    styleTag.textContent = s;
    shadow.appendChild(styleTag);

    const reactRoot = document.createElement('div');
    reactRoot.id = 'tabyrinth-board-inner';
    shadow.appendChild(reactRoot);

    document.body.appendChild(container);

    createRoot(reactRoot).render(
      <React.StrictMode>
        <Board />
      </React.StrictMode>
    );

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'toggle-moodboard') {
        container.style.display = msg.visible ? 'block' : 'none';
      }
    });
  },
});
