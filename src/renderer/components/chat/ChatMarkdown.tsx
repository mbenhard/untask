import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

type ChatMarkdownProps = {
  content: string;
};

// Downgrade headings to bold paragraphs
const HeadingAsBold = ({ children }: { children?: ReactNode }) => (
  <p><strong>{children}</strong></p>
);

// Flatten <table> into a list: header row becomes bold prefix, data rows become <li>
const TableFlattener = ({ children }: { children?: ReactNode }) => (
  <div className="chat-md-table-flat">{children}</div>
);

const TableHead = ({ children }: { children?: ReactNode }) => (
  <div className="chat-md-table-header"><strong>{children}</strong></div>
);

const TableBody = ({ children }: { children?: ReactNode }) => (
  <ul className="chat-md-list">{children}</ul>
);

const TableRow = ({ children }: { children?: ReactNode }) => (
  <li>{children}</li>
);

const TableCell = ({ children }: { children?: ReactNode }) => (
  <span className="chat-md-table-cell">{children}</span>
);

const InlineCode = ({ children }: ComponentPropsWithoutRef<'code'>) => (
  <code className="chat-md-inline-code">{children}</code>
);

// pre renders a real <pre> element to preserve semantics and match CSS/tests
const Pre = ({ children }: { children?: ReactNode }) => (
  <pre className="chat-md-code-block">{children}</pre>
);

const Blockquote = ({ children }: { children?: ReactNode }) => (
  <div className="chat-md-blockquote">{children}</div>
);

const Link = ({ href, children }: ComponentPropsWithoutRef<'a'>) => (
  <a href={href} className="chat-md-link" target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

const StripImage = () => null;

const HorizontalRule = () => <hr className="chat-md-hr" />;

const components: Partial<Components> = {
  h1: HeadingAsBold,
  h2: HeadingAsBold,
  h3: HeadingAsBold,
  h4: HeadingAsBold,
  h5: HeadingAsBold,
  h6: HeadingAsBold,
  table: TableFlattener,
  thead: TableHead,
  tbody: TableBody,
  tr: TableRow,
  th: TableCell,
  td: TableCell,
  // In react-markdown v10, fenced code blocks get className="language-xxx".
  // Inline code has no className. The `inline` prop was removed in v10.
  code: ({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) => {
    const isBlock = typeof className === 'string' && className.startsWith('language-');
    if (isBlock) {
      return <code className="chat-md-code-block-code">{children}</code>;
    }
    return <InlineCode {...props}>{children}</InlineCode>;
  },
  pre: Pre,
  blockquote: Blockquote,
  a: Link,
  img: StripImage,
  hr: HorizontalRule,
  ul: ({ children }: { children?: ReactNode }) => <ul className="chat-md-list">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="chat-md-list chat-md-list-ordered">{children}</ol>,
};

export const ChatMarkdown = ({ content }: ChatMarkdownProps) => (
  <div className="chat-markdown">
    <ReactMarkdown remarkPlugins={[remarkBreaks, remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  </div>
);
