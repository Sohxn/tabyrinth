import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Board } from './Board';
import BoardStyles from '../sidepanel/style.css?inline';

declare global {
  interface Window {
    documentPictureInPicture: {
      window: Window | null;
      requestWindow: (
        options: {
          width?: number;
          height?: number
        }
      ) => Promise<Window>;
    };
  }
}

let pipRoot: Root | null = null;

function copystylesInto(doc: Document) {
  const styleTag = doc.createElement('style');
  styleTag.textContent = BoardStyles;
  doc.head.appendChild(styleTag);
}

export function openMoodboardPiP(): void {
  console.log('[DEBUG] openMoodboardPiP called (sync entry)');

  if (!window.documentPictureInPicture) {
    console.error('[ERROR] Document Picture In Picture is not supported in this browser.');
    return;
  }

  const existing = window.documentPictureInPicture.window;
  if (existing) {
    console.log('[DEBUG] Existing PiP window found, focusing...');
    existing.focus();
    return;
  }

  // CRITICAL: requestWindow MUST be called synchronously within the user gesture
  window.documentPictureInPicture.requestWindow({
    width: 420,
    height: 720
  }).then(pipWindow => {
    console.log('[DEBUG] PiP window created successfully');

    console.log('[DEBUG] Injecting styles...');
    copystylesInto(pipWindow.document);

    const rootEl = pipWindow.document.createElement('div');
    rootEl.id = 'tabyrinth-board-pip-root';
    pipWindow.document.body.appendChild(rootEl);
    console.log('[DEBUG] Root element appended');

    try {
      console.log('[DEBUG] Creating React root...');
      pipRoot = createRoot(rootEl);
      console.log('[DEBUG] Rendering Minimalist Board...');
      pipRoot.render(
        <React.StrictMode>
          <div style={{ color: 'white', background: 'black', padding: '20px', fontSize: '20px', height: '100vh' }}>
            PiP Window Active!
          </div>
        </React.StrictMode>
      );
      console.log('[DEBUG] Render call completed');
    } catch (renderError) {
      console.error('[ERROR] React render failed:', renderError);
    }

    pipWindow.addEventListener('pagehide', () => {
      console.log('[DEBUG] PiP window closing');
      pipRoot?.unmount();
      pipRoot = null;
    }, {
      once: true
    });
  }).catch(err => {
    console.error('[ERROR] Failed to open PiP window:', err);
  });
}

