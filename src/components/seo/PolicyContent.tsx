import { createElement, type ReactNode, useMemo } from 'react';

const allowed = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'br', 'a']);
const blocked = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'img', 'svg']);

function safeLink(value: string | null): string | undefined {
  try {
    const url = new URL(value || '', 'https://checkout.placeinthyme.com');
    return ['https:', 'mailto:'].includes(url.protocol) && !url.username && !url.password
      ? url.href : undefined;
  } catch { return undefined; }
}

/** Allow only text formatting and safe links from Shopify's published policy. */
export function PolicyContent({ html }: { html: string }) {
  const content = useMemo(() => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const renderNode = (node: Node, key: string): ReactNode => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const element = node as Element;
      const tag = element.tagName.toLowerCase();
      if (blocked.has(tag)) return null;
      const children = Array.from(node.childNodes).map((child, index) => renderNode(child, `${key}-${index}`));
      if (!allowed.has(tag)) return children;
      return createElement(tag, { key, ...(tag === 'a' ? { href: safeLink(element.getAttribute('href')) } : {}) }, tag === 'br' ? undefined : children);
    };
    return Array.from(doc.body.childNodes).map((node, index) => renderNode(node, String(index)));
  }, [html]);
  return <div className="prose prose-sm max-w-none break-words prose-a:text-primary prose-a:underline">{content}</div>;
}
