import { describe, it, expect, afterEach } from 'vitest';
import { inPageDOMPruner } from '../entrypoints/background/tools/browser/dom-indexer';

/**
 * chrome_read_dom must surface form validation state, both the native
 * constraint API (validity / validationMessage) and the ARIA hint that
 * framework validators set (aria-invalid / aria-required), plus the constraint
 * attributes an agent needs to satisfy the field.
 */
function withStubbedGeometry() {
  const prevRect = Element.prototype.getBoundingClientRect;
  // jsdom throws "Not implemented" for pseudo-element getComputedStyle, which
  // extractCleanElementText calls for ::before/::after. Stub it to keep the
  // test output clean; the validation logic under test does not use it.
  const prevStyle = window.getComputedStyle;
  window.getComputedStyle = ((el: Element, pseudo?: string | null) =>
    pseudo ? ({ getPropertyValue: () => '' } as unknown as CSSStyleDeclaration) : prevStyle(el)) as any;
  Element.prototype.getBoundingClientRect = function () {
    return {
      x: 10,
      y: 10,
      left: 10,
      top: 10,
      right: 210,
      bottom: 50,
      width: 200,
      height: 40,
      toJSON: () => ({}),
    } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = prevRect;
    window.getComputedStyle = prevStyle;
  };
}

function attrsOf(html: string, match: (el: any) => boolean) {
  const restore = withStubbedGeometry();
  try {
    document.body.innerHTML = html;
    const res = inPageDOMPruner();
    return (res.indexedElements || []).find(match)?.attributes;
  } finally {
    restore();
    document.body.innerHTML = '';
  }
}

describe('form validation state in chrome_read_dom', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('marks a required empty input invalid with a reason', () => {
    const attrs = attrsOf(
      '<input id="email" type="email" required>',
      (el) => el.attributes?.id === 'email',
    );

    expect(attrs).toBeTruthy();
    expect(attrs!.required).toBe('true');
    expect(attrs!.invalid).toBe('true');
    expect(attrs!.invalidReason).toBe('valueMissing');
  });

  it('marks a satisfied input valid', () => {
    const attrs = attrsOf(
      '<input id="ok" type="text" value="hello">',
      (el) => el.attributes?.id === 'ok',
    );

    expect(attrs!.valid).toBe('true');
    expect(attrs!.invalid).toBeUndefined();
  });

  it('reports patternMismatch with the pattern so the agent can fix it', () => {
    const attrs = attrsOf(
      '<input id="zip" type="text" pattern="\\d{5}" value="abc" required>',
      (el) => el.attributes?.id === 'zip',
    );

    expect(attrs!.invalid).toBe('true');
    expect(attrs!.invalidReason).toBe('patternMismatch');
    expect(attrs!.pattern).toBe('\\d{5}');
  });

  it('surfaces range constraints and rangeOverflow', () => {
    const attrs = attrsOf(
      '<input id="qty" type="number" min="1" max="10" value="99">',
      (el) => el.attributes?.id === 'qty',
    );

    expect(attrs!.invalidReason).toBe('rangeOverflow');
    expect(attrs!.min).toBe('1');
    expect(attrs!.max).toBe('10');
  });

  it('honours framework validators that only set aria-invalid / aria-required', () => {
    const attrs = attrsOf(
      '<input id="custom" type="text" aria-invalid="true" aria-required="true" value="x">',
      (el) => el.attributes?.id === 'custom',
    );

    // No native constraint violated, so this proves the ARIA path is separate.
    expect(attrs!.invalid).toBe('true');
    expect(attrs!.required).toBe('true');
  });

  it('does not flag non-form elements', () => {
    const attrs = attrsOf('<button id="b">Go</button>', (el) => el.attributes?.id === 'b');

    expect(attrs!.invalid).toBeUndefined();
    expect(attrs!.valid).toBeUndefined();
  });
});
