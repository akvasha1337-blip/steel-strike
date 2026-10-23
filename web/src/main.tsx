import { render } from 'preact';
import './ui/styles.css';
import { App } from './ui/App';
import { hub } from './hub';

render(<App />, document.getElementById('app')!);

// Demo build (VITE_DEMO=1): start on the simulator so every mode is playable straight away.
if (import.meta.env.VITE_DEMO) hub.connect('sim');

// Offline support for the hosted (https) version. Not available when served by the hub over http,
// and skipped inside embedded frames.
if ('serviceWorker' in navigator && window.isSecureContext && window.top === window.self && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
