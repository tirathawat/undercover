import { useEffect, useRef } from 'react';

export function useRoomPanelFocus(
  view: 'play' | 'history' | 'people',
  stageId: string,
) {
  const layout = useRef<HTMLDivElement>(null);
  const previous = useRef({ view, stageId });

  useEffect(() => {
    const viewChanged = previous.current.view !== view;
    const stageChanged = previous.current.stageId !== stageId;
    previous.current = { view, stageId };
    const panel = layout.current?.querySelector<HTMLElement>(`.${view}-view`);
    if (
      viewChanged ||
      (stageChanged &&
        view === 'play' &&
        (document.activeElement === document.body ||
          panel?.contains(document.activeElement)))
    ) {
      panel?.querySelector<HTMLElement>('h2')?.focus();
    }
  }, [view, stageId]);

  return layout;
}
