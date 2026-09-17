import { describe, it, expect, beforeEach } from 'vitest';
import {
  inPageDOMPruner,
  renderCompactElementLine,
} from '../entrypoints/background/tools/browser/dom-indexer';

describe('VOM Coverage & Masking Mechanisms (BrowserSkill Parity)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('masks sensitive password input values with •••', () => {
    const line = renderCompactElementLine({
      index: 1,
      tagName: 'input',
      attributes: { type: 'password', name: 'user_password' },
      value: 'secret123456',
    });

    expect(line).toContain('value="•••"');
    expect(line).not.toContain('secret123456');
  });

  it('masks credit card and password autocomplete fields with •••', () => {
    const line = renderCompactElementLine({
      index: 2,
      tagName: 'input',
      attributes: { type: 'text', autocomplete: 'cc-number' },
      value: '4111222233334444',
    });

    expect(line).toContain('value="•••"');
    expect(line).not.toContain('4111222233334444');
  });

  it('detects large positioned overlays using geometric coverage algorithm', () => {
    const modal = document.createElement('div');
    modal.id = 'consent-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'User Terms');
    modal.style.position = 'fixed';
    modal.style.left = '0px';
    modal.style.top = '0px';
    modal.style.width = '1000px';
    modal.style.height = '800px';

    modal.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    document.body.appendChild(modal);

    const res = inPageDOMPruner();
    expect(res.treeString).toContain('Active modal focus trap');
    expect(res.treeString).toContain('User Terms');
    expect(res.activeModal).toContain('User Terms');
    expect(res.focusTrapped).toBe(true);
  });
});
