import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const SHOW_DELAY_MS = 350;
const EDGE_GAP_PX = 8;
const ANCHOR_GAP_PX = 6;

interface Tip {
  readonly text: string;
  readonly anchor: DOMRect;
}

// WebKit before 15.4 (macOS 11 and 12) has no :focus-visible and throws on it.
function isKeyboardFocus(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return false;
  }
}

// Shows every `title` attribute in the app as a drawn tooltip, because the macOS WebView never shows
// native title tooltips. While the pointer is over an element its title is held here and put back
// when the pointer leaves, so Windows and Linux do not show a native tooltip on top of this one.
// Keyboard focus shows the tip without moving the title, which may be the element's accessible name.
export function TooltipLayer(): JSX.Element | null {
  const [tip, setTip] = useState<Tip | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let hovered: Element | null = null;
    let heldTitle = '';
    let timer: number | undefined;

    const show = (element: Element, text: string) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (element.isConnected) setTip({ text, anchor: element.getBoundingClientRect() });
      }, SHOW_DELAY_MS);
    };
    const hide = () => {
      window.clearTimeout(timer);
      setTip(null);
    };

    // An icon-only control is named by its title, so it keeps that name as an aria-label while held.
    let lentLabel = false;
    const hold = (element: Element, title: string) => {
      heldTitle = title;
      element.removeAttribute('title');
      if (lentLabel) {
        element.setAttribute('aria-label', title);
      } else if (!element.textContent?.trim() && !element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby')) {
        element.setAttribute('aria-label', title);
        lentLabel = true;
      }
    };

    // React can set a new title while the pointer stays put, such as a favorite toggle's.
    const observer = new MutationObserver(() => {
      const next = hovered?.getAttribute('title');
      if (!hovered || next == null) return;
      hold(hovered, next);
      setTip((current) => (current ? { ...current, text: next.trim() } : current));
    });

    const release = () => {
      observer.disconnect();
      if (hovered && heldTitle && !hovered.hasAttribute('title')) hovered.setAttribute('title', heldTitle);
      if (hovered && lentLabel) hovered.removeAttribute('aria-label');
      hovered = null;
      heldTitle = '';
      lentLabel = false;
      hide();
    };

    const onMouseOver = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const titled = target?.closest('[title]') ?? null;
      // Inside the held element, only a titled descendant takes over.
      if (hovered && target && hovered.contains(target) && !(titled && hovered.contains(titled))) return;
      release();
      const text = titled?.getAttribute('title')?.trim();
      if (!titled || !text) return;
      hovered = titled;
      hold(titled, titled.getAttribute('title') ?? '');
      observer.observe(titled, { attributes: true, attributeFilter: ['title'] });
      show(titled, text);
    };
    const onMouseOut = (event: MouseEvent) => {
      if (!event.relatedTarget) release(); // the pointer left the window
    };
    const onFocusIn = (event: FocusEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (!element || element === hovered || !isKeyboardFocus(element)) return;
      const text = element.getAttribute('title')?.trim();
      if (text) show(element, text);
    };
    const onFocusOut = () => {
      if (!hovered) hide();
    };

    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('mousedown', hide, true);
    document.addEventListener('keydown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', release);
    return () => {
      release();
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('mousedown', hide, true);
      document.removeEventListener('keydown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', release);
    };
  }, []);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!tip || !element) {
      setPosition(null);
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    let top = tip.anchor.top - height - ANCHOR_GAP_PX;
    if (top < EDGE_GAP_PX) top = tip.anchor.bottom + ANCHOR_GAP_PX;
    const centered = tip.anchor.left + tip.anchor.width / 2 - width / 2;
    const left = Math.min(Math.max(centered, EDGE_GAP_PX), window.innerWidth - width - EDGE_GAP_PX);
    setPosition({ left, top });
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={ref}
      role="tooltip"
      data-testid="tooltip"
      className="pointer-events-none fixed z-[60] max-w-xs rounded-md bg-gray-900 dark:bg-gray-700 px-2 py-1 text-xs leading-snug text-white shadow-lg whitespace-pre-line break-words"
      style={position ?? { left: 0, top: 0, visibility: 'hidden' }}
    >
      {tip.text}
    </div>
  );
}
