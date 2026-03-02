// @vitest-environment jsdom
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatMarkdown } from './ChatMarkdown';

describe('ChatMarkdown', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
  });

  const render = (content: string) => {
    flushSync(() => {
      root.render(createElement(ChatMarkdown, { content }));
    });
  };

  it('renders bold and italic text', () => {
    render('**bold** and *italic*');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
  });

  it('renders unordered lists with bullets', () => {
    render('- item one\n- item two');
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('item one');
  });

  it('renders inline code with a styled span', () => {
    render('use `npm install` to install');
    const code = container.querySelector('code');
    expect(code?.textContent).toBe('npm install');
    expect(code?.className).toContain('chat-md-inline-code');
  });

  it('downgrades headings to bold text', () => {
    render('# Big Heading\n\nsome text');
    // Should NOT render an h1 element
    expect(container.querySelector('h1')).toBeNull();
    // Should render the heading text as bold
    const strong = container.querySelector('strong');
    expect(strong?.textContent).toBe('Big Heading');
  });

  it('downgrades all heading levels to bold', () => {
    render('## H2\n### H3\n#### H4');
    expect(container.querySelector('h2')).toBeNull();
    expect(container.querySelector('h3')).toBeNull();
    expect(container.querySelector('h4')).toBeNull();
    const bolds = container.querySelectorAll('strong');
    expect(bolds.length).toBeGreaterThanOrEqual(3);
  });

  it('flattens tables into a list', () => {
    render('| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |');
    // Should NOT render a <table>
    expect(container.querySelector('table')).toBeNull();
    // Should render list items with cell content
    const items = container.querySelectorAll('li');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
  });

  it('renders code blocks with pre element', () => {
    render('```\nconst x = 1;\n```');
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.className).toContain('chat-md-code-block');
    expect(pre?.textContent).toContain('const x = 1;');
  });

  it('renders blockquotes with left border styling', () => {
    render('> some quote');
    const quote = container.querySelector('.chat-md-blockquote');
    expect(quote).not.toBeNull();
    expect(quote?.textContent).toContain('some quote');
  });

  it('renders links with proper styling', () => {
    render('[click here](https://example.com)');
    const link = container.querySelector('a');
    expect(link?.textContent).toBe('click here');
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.className).toContain('chat-md-link');
  });

  it('strips images', () => {
    render('![alt text](https://example.com/img.png)');
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders horizontal rules', () => {
    render('text\n\n---\n\nmore text');
    const hr = container.querySelector('hr');
    expect(hr).not.toBeNull();
  });

  it('wraps output in chat-markdown class', () => {
    render('hello');
    expect(container.querySelector('.chat-markdown')).not.toBeNull();
  });
});
