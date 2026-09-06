'use client';

import { type Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SlashItem = {
  id: string;
  label: string;
  hint: string;
  run: (editor: Editor) => void;
};

const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'heading',
    label: 'Heading',
    hint: 'H2',
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'bullet',
    label: 'Bullet list',
    hint: '•',
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'ordered',
    label: 'Ordered list',
    hint: '1.',
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'task',
    label: 'Task item',
    hint: '☐',
    run: (editor) => {
      editor.chain().focus().insertContent('- [ ] ').run();
    },
  },
  {
    id: 'code',
    label: 'Code block',
    hint: '<>',
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: 'quote',
    label: 'Quote',
    hint: '“',
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'hr',
    label: 'Horizontal rule',
    hint: '—',
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    id: 'wiki',
    label: 'Wiki link',
    hint: '[[ ]]',
    run: (editor) => {
      editor.chain().focus().insertContent('[[]]').run();
      const { from } = editor.state.selection;
      editor.commands.setTextSelection(from - 2);
    },
  },
];

function filterSlash(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.id.includes(q) ||
      item.hint.toLowerCase().includes(q),
  );
}

export function ProseEditor({
  value,
  disabled,
  onChange,
  className,
}: {
  value: string;
  disabled?: boolean;
  onChange: (markdown: string) => void;
  className?: string;
}) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const slashRangeRef = useRef<{ from: number; to: number } | null>(null);
  const slashStateRef = useRef({
    open: false,
    query: '',
    index: 0,
  });
  const detectSlashRef = useRef<(current: Editor) => void>(() => undefined);
  const applySlashRef = useRef<(current: Editor, item: SlashItem) => void>(
    () => undefined,
  );

  useEffect(() => {
    slashStateRef.current = {
      open: slashOpen,
      query: slashQuery,
      index: slashIndex,
    };
  }, [slashOpen, slashQuery, slashIndex]);

  function closeSlash() {
    setSlashOpen(false);
    setSlashQuery('');
    setSlashIndex(0);
    slashRangeRef.current = null;
  }

  detectSlashRef.current = (current: Editor) => {
    const { from, empty } = current.state.selection;
    if (!empty) {
      closeSlash();
      return;
    }
    const textBefore = current.state.doc.textBetween(
      Math.max(0, from - 40),
      from,
      '\n',
      '\n',
    );
    const match = /(?:^|\s)\/([^\s/]*)$/.exec(textBefore);
    if (!match) {
      closeSlash();
      return;
    }
    const query = match[1] ?? '';
    const triggerStart = from - query.length - 1;
    slashRangeRef.current = { from: triggerStart, to: from };
    setSlashQuery(query);
    setSlashOpen(true);
    setSlashIndex(0);
  };

  applySlashRef.current = (current: Editor, item: SlashItem) => {
    const range = slashRangeRef.current;
    if (range) {
      current
        .chain()
        .focus()
        .deleteRange({ from: range.from, to: range.to })
        .run();
    }
    item.run(current);
    closeSlash();
  };

  const editor = useEditor({
    extensions: [StarterKit],
    content: markdownToHtml(value),
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => {
      onChange(htmlToMarkdown(current.getHTML()));
      detectSlashRef.current(current);
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none min-h-[160px] focus:outline-none px-3 py-2',
      },
      handleKeyDown: (_view, event) => {
        const state = slashStateRef.current;
        if (!state.open) return false;
        const filtered = filterSlash(state.query);
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSlashIndex((i) => (i + 1) % Math.max(filtered.length, 1));
          return true;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSlashIndex(
            (i) =>
              (i - 1 + Math.max(filtered.length, 1)) %
              Math.max(filtered.length, 1),
          );
          return true;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          closeSlash();
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const handler = (event: KeyboardEvent) => {
      const state = slashStateRef.current;
      if (!state.open) return;
      if (event.key !== 'Enter') return;
      const filtered = filterSlash(state.query);
      const item = filtered[state.index];
      if (!item) return;
      event.preventDefault();
      event.stopPropagation();
      applySlashRef.current(editor, item);
    };
    const dom = editor.view.dom;
    dom.addEventListener('keydown', handler, true);
    return () => dom.removeEventListener('keydown', handler, true);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const current = htmlToMarkdown(editor.getHTML());
    if (normalize(current) === normalize(value)) return;
    editor.commands.setContent(markdownToHtml(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) {
    return (
      <div className="min-h-[160px] rounded-md border border-input bg-transparent px-3 py-2 text-sm text-muted-foreground">
        Loading editor…
      </div>
    );
  }

  const filteredSlash = filterSlash(slashQuery);

  return (
    <div
      className={cn(
        'relative rounded-md border border-input bg-transparent shadow-xs',
        disabled && 'opacity-60',
        className,
      )}
    >
      {!disabled ? (
        <div className="flex flex-wrap gap-1 border-b border-border px-2 py-1.5">
          <ToolbarButton
            label="B"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            label="I"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            label="H2"
            active={editor.isActive('heading', { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          />
          <ToolbarButton
            label="•"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            label="1."
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            label="<>"
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          />
          <ToolbarButton
            label="“"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
          <ToolbarButton
            label="—"
            active={false}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          />
          <ToolbarButton
            label="[[ ]]"
            active={false}
            onClick={() => {
              editor.chain().focus().insertContent('[[]]').run();
              const { from } = editor.state.selection;
              editor.commands.setTextSelection(from - 2);
            }}
          />
        </div>
      ) : null}
      <EditorContent editor={editor} />
      {!disabled && slashOpen && filteredSlash.length > 0 ? (
        <div
          className="absolute left-3 z-20 mt-1 w-64 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
          role="listbox"
        >
          <p className="border-b border-border px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Slash commands
          </p>
          <ul className="max-h-56 overflow-auto py-1">
            {filteredSlash.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between px-2 py-1.5 text-left text-sm',
                    index === slashIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted/60',
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySlashRef.current(editor, item);
                  }}
                >
                  <span>{item.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {item.hint}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!disabled ? (
        <p className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground">
          Type <kbd className="font-mono">/</kbd> for blocks ·{' '}
          <kbd className="font-mono">[[Title]]</kbd> for wiki links
        </p>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      className="h-7 px-2 font-mono text-xs"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Minimal markdown ↔ HTML bridge for starter kit nodes. */
function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inCode = false;
  let codeBuffer: string[] = [];

  const closeList = () => {
    if (inList) {
      html.push(inList === 'ul' ? '</ul>' : '</ol>');
      inList = null;
    }
  };

  for (const raw of lines) {
    const line = raw ?? '';
    if (line.startsWith('```')) {
      if (inCode) {
        html.push(
          `<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`,
        );
        codeBuffer = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      closeList();
      html.push('<hr>');
      continue;
    }
    if (/^>\s+/.test(line)) {
      closeList();
      html.push(
        `<blockquote><p>${inline(line.replace(/^>\s+/, ''))}</p></blockquote>`,
      );
      continue;
    }
    if (/^##\s+/.test(line)) {
      closeList();
      html.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`);
      continue;
    }
    if (/^###\s+/.test(line)) {
      closeList();
      html.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`);
      continue;
    }
    if (/^[-*]\s+\[[ xX]\]\s+/.test(line)) {
      if (inList !== 'ul') {
        closeList();
        html.push('<ul>');
        inList = 'ul';
      }
      const checked = /\[[xX]\]/.test(line);
      const text = line.replace(/^[-*]\s+\[[ xX]\]\s+/, '');
      html.push(
        `<li data-task="${checked ? 'done' : 'todo'}">${inline(text)}</li>`,
      );
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (inList !== 'ul') {
        closeList();
        html.push('<ul>');
        inList = 'ul';
      }
      html.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (inList !== 'ol') {
        closeList();
        html.push('<ol>');
        inList = 'ol';
      }
      html.push(`<li>${inline(line.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }
    if (line.trim() === '') {
      closeList();
      continue;
    }
    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
  }
  return html.join('') || '<p></p>';
}

function htmlToMarkdown(html: string): string {
  const withBreaks = html
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<h2[^>]*>/gi, '## ')
    .replace(/<\/h2>/gi, '\n\n')
    .replace(/<h3[^>]*>/gi, '### ')
    .replace(/<\/h3>/gi, '\n\n')
    .replace(/<blockquote[^>]*>/gi, '')
    .replace(/<\/blockquote>/gi, '\n')
    .replace(/<li[^>]*data-task="todo"[^>]*>/gi, '- [ ] ')
    .replace(/<li[^>]*data-task="done"[^>]*>/gi, '- [x] ')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?ul[^>]*>/gi, '\n')
    .replace(/<\/?ol[^>]*>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<pre><code>/gi, '```\n')
    .replace(/<\/code><\/pre>/gi, '\n```\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<[^>]+>/g, '');
  return decodeHtml(withBreaks)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeHtml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
