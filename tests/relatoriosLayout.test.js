import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(resolve('src/routes/relatorios/+layout.svelte'), 'utf8');
const reportPage = readFileSync(resolve('src/routes/relatorios/+page.svelte'), 'utf8');

describe('Relatórios desktop layout', () => {
  it('uses the document scroll instead of creating a second scroll area beside the report', () => {
    const workspaceStyles = layout.slice(
      layout.indexOf('<style>'),
      layout.indexOf('</style>')
    );

    expect(layout).not.toMatch(/relatorios-content[^\n]*md:overflow-y-auto/);
    const workspaceRule = workspaceStyles.match(/\.relatorios-workspace\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
    expect(workspaceRule).not.toMatch(/(?<!min-)height:\s*100d?vh/);
  });

  it('keeps the sidebar pinned while the document scrolls', () => {
    const workspaceStyles = layout.slice(
      layout.indexOf('<style>'),
      layout.indexOf('</style>')
    );
    const sidebarRule = workspaceStyles.match(
      /\.relatorios-workspace\s+:global\(#gestao-sidebar\)\s*\{([\s\S]*?)\n\s*\}/
    )?.[1] || '';

    expect(sidebarRule).toMatch(/position:\s*sticky/);
    expect(sidebarRule).toMatch(/top:\s*0/);
    expect(sidebarRule).toMatch(/align-self:\s*flex-start/);
  });

  it('does not force the report content to outgrow the document-scrolling workspace', () => {
    expect(reportPage).not.toContain('class="flex min-h-full flex-col gap-5"');
  });
});
