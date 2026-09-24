import React from 'react';
import ReactDOM from 'react-dom/client';
import { Board } from './Board.tsx';
import '../sidepanel/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Board />
    </React.StrictMode>
);
