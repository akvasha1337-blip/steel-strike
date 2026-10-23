import { useMemo } from 'preact/hooks';
import { guideHtml } from '../guide/guide';

export function HelpScreen() {
  const html = useMemo(() => guideHtml(), []);
  return (
    <main class="page">
      <header class="pagehead">
        <h1>Wiring guide</h1>
        <p>
          Everything to build six wireless targets: parts, circuits, pins, mounting, testing and safety. A printable copy is in the project at <code>docs/wiring-guide.html</code>.
        </p>
      </header>
      <div
        class="panel"
        onClick={(e) => {
          // Keep in-page links working inside this single-page app.
          const a = (e.target as HTMLElement).closest('a');
          const href = a?.getAttribute('href');
          if (href && href.startsWith('#g-')) {
            e.preventDefault();
            document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  );
}
