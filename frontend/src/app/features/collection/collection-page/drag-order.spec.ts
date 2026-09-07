import { describe, expect, it } from 'vitest';

import { DragOrder } from './drag-order';

function dragEvent(): DragEvent {
  let defaultPrevented = false;
  return {
    dataTransfer: { effectAllowed: '', dropEffect: '', setData: () => undefined },
    preventDefault: () => {
      defaultPrevented = true;
    },
    get defaultPrevented() {
      return defaultPrevented;
    },
  } as unknown as DragEvent;
}

describe('DragOrder', () => {
  it('reports the index a drag started from', () => {
    const drag = new DragOrder(() => true);

    drag.start(dragEvent(), 3);
    expect(drag.index()).toBe(3);
    expect(drag.drop(dragEvent())).toBe(3);
  });

  it('clears the lifted state once the drop lands', () => {
    const drag = new DragOrder(() => true);

    drag.start(dragEvent(), 1);
    drag.drop(dragEvent());
    expect(drag.index()).toBeNull();
  });

  it('treats a drop with no start as a no-op', () => {
    expect(new DragOrder(() => true).drop(dragEvent())).toBeNull();
  });

  it('does nothing at all when reordering is off', () => {
    // Dragging is only meaningful under a manual sort; under any other order
    // the position the user drops on is not the position that persists.
    const drag = new DragOrder(() => false);

    drag.start(dragEvent(), 2);
    expect(drag.index()).toBeNull();
    expect(drag.drop(dragEvent())).toBeNull();
  });

  it('lets the browser fire a drop by preventing the dragover default', () => {
    const drag = new DragOrder(() => true);
    drag.start(dragEvent(), 0);

    const over = dragEvent();
    drag.over(over);
    expect(over.defaultPrevented).toBe(true);
  });

  it('ignores dragover before a drag has started', () => {
    const over = dragEvent();
    new DragOrder(() => true).over(over);
    expect(over.defaultPrevented).toBe(false);
  });

  it('resets on a cancelled drag', () => {
    const drag = new DragOrder(() => true);
    drag.start(dragEvent(), 4);
    drag.end();
    expect(drag.index()).toBeNull();
  });
});

describe('DragOrder — where it would land', () => {
  it('marks the slot the pointer is over', () => {
    const drag = new DragOrder(() => true);
    drag.start(dragEvent(), 0);

    drag.over(dragEvent(), 4);
    expect(drag.overIndex()).toBe(4);
  });

  it('does not mark the slot the dragged item already occupies', () => {
    // "It would land where it already is" is not information, and painting an
    // insertion marker on the card under the pointer reads as a second card.
    const drag = new DragOrder(() => true);
    drag.start(dragEvent(), 2);

    drag.over(dragEvent(), 2);
    expect(drag.overIndex()).toBeNull();
  });

  it('marks nothing before a drag has started', () => {
    const drag = new DragOrder(() => true);
    drag.over(dragEvent(), 3);
    expect(drag.overIndex()).toBeNull();
  });

  it('clears the marker on a drop, and on a cancelled drag', () => {
    const drag = new DragOrder(() => true);
    drag.start(dragEvent(), 0);
    drag.over(dragEvent(), 5);
    drag.drop(dragEvent());
    expect(drag.overIndex()).toBeNull();

    drag.start(dragEvent(), 0);
    drag.over(dragEvent(), 5);
    drag.end();
    expect(drag.overIndex()).toBeNull();
  });

  it('still lets the browser fire a drop when no index is passed', () => {
    // The old signature. A call site that has not been updated loses the
    // marker, never the drop.
    const drag = new DragOrder(() => true);
    drag.start(dragEvent(), 0);

    const over = dragEvent();
    drag.over(over);
    expect(over.defaultPrevented).toBe(true);
    expect(drag.overIndex()).toBeNull();
  });
});
