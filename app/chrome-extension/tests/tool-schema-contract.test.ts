import { describe, it, expect } from 'vitest';
import { TOOL_SCHEMAS } from 'chrome-mcp-shared';

/**
 * Schema/implementation contract checks for capabilities that used to be
 * invisible to the agent:
 * - chrome_interact_index implements drag (action + end/steps/holdMs/dnd) but
 *   the schema only listed 4 actions, so the capability was undiscoverable.
 * - chrome_computer and chrome_handle_dialog accepted free-form strings for
 *   action, so an invalid value could only be caught at runtime.
 */
const byName = new Map(TOOL_SCHEMAS.map((t: any) => [t.name, t]));
const propsOf = (name: string) => (byName.get(name) as any).inputSchema.properties;

describe('tool schema contract', () => {
  describe('chrome_interact_index drag support', () => {
    it('exposes drag in the action enum', () => {
      expect(propsOf('chrome_interact_index').action.enum).toContain('drag');
    });

    it('declares every parameter the drag implementation consumes', () => {
      const props = propsOf('chrome_interact_index');

      for (const key of ['end', 'steps', 'holdMs', 'dnd']) {
        expect(props[key], `${key} must be declared`).toBeTruthy();
      }
      // end must be usable both by index and by raw coordinate.
      expect(props.end.properties.index).toBeTruthy();
      expect(props.end.properties.coordinate).toBeTruthy();
    });

    it('keeps the four original actions working', () => {
      const enumValues = propsOf('chrome_interact_index').action.enum;

      for (const action of ['click', 'hover', 'double_click', 'right_click']) {
        expect(enumValues).toContain(action);
      }
    });
  });

  describe('action enums replace free-form strings', () => {
    it('chrome_computer.action is a closed enum matching the implementation', () => {
      const action = propsOf('chrome_computer').action;

      expect(Array.isArray(action.enum)).toBe(true);
      for (const value of [
        'left_click',
        'right_click',
        'double_click',
        'triple_click',
        'left_click_drag',
        'scroll',
        'scroll_to',
        'type',
        'key',
        'fill',
        'fill_form',
        'hover',
        'wait',
        'resize_page',
        'zoom',
        'screenshot',
      ]) {
        expect(action.enum, `${value} missing from chrome_computer enum`).toContain(value);
      }
      // The old description listed these; make sure no phantom value crept in.
      expect(action.enum).not.toContain('click');
    });

    it('chrome_handle_dialog.action is a closed enum', () => {
      const action = propsOf('chrome_handle_dialog').action;

      expect(action.enum).toEqual(['accept', 'dismiss']);
    });
  });
});
