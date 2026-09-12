import { describe, it, expect } from 'vitest';
import { renderCompactElementLine } from '../entrypoints/background/tools/browser/dom-indexer';
import type { IndexedElement } from 'chrome-mcp-shared';

describe('ReadDOM Compact Accessibility Format', () => {
  it('renders clean compact lines without closing tags for buttons and links', () => {
    const btnEl: IndexedElement = {
      index: 1,
      tagName: 'button',
      role: 'button',
      text: 'Submit Application',
      attributes: { id: 'btn-submit', type: 'submit' },
      rect: { x: 10, y: 20, width: 100, height: 40 },
      isInteractive: true,
    };

    const compact = renderCompactElementLine(btnEl);
    expect(compact).toBe('[1] button "Submit Application" #btn-submit');
    expect(compact).not.toContain('</button>');
    expect(compact).not.toContain('role=');
  });

  it('formats input elements into appropriate AX role with placeholder and required attributes', () => {
    const inputEl: IndexedElement = {
      index: 2,
      tagName: 'input',
      attributes: {
        type: 'email',
        name: 'user_email',
        placeholder: 'name@domain.com',
        required: 'true',
      },
      rect: { x: 10, y: 70, width: 200, height: 35 },
      isInteractive: true,
    };

    const compact = renderCompactElementLine(inputEl);
    expect(compact).toBe('[2] textbox name="user_email" placeholder="name@domain.com" required');
  });

  it('formats checkboxes and checked state concisely', () => {
    const checkEl: IndexedElement = {
      index: 3,
      tagName: 'input',
      text: 'Remember login',
      attributes: {
        type: 'checkbox',
        'aria-checked': 'true',
      },
      rect: { x: 10, y: 120, width: 20, height: 20 },
      isInteractive: true,
    };

    const compact = renderCompactElementLine(checkEl);
    expect(compact).toBe('[3] checkbox "Remember login" checked');
  });

  it('includes frame id for cross-frame elements and occluded markers', () => {
    const frameEl: IndexedElement = {
      index: 4,
      tagName: 'a',
      text: 'Privacy Policy',
      attributes: { href: 'https://example.com/privacy' },
      rect: { x: 50, y: 200, width: 120, height: 25 },
      isInteractive: true,
      isOccluded: true,
      occludedBy: 'modal-backdrop',
    };

    const compact = renderCompactElementLine(frameEl, 2);
    expect(compact).toBe('[4] link "Privacy Policy" href="https://example.com/privacy" frame="2" [occluded by modal-backdrop]');
  });
});
