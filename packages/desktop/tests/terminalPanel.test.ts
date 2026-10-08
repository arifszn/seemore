import { describe, expect, it } from 'vitest';
import { clampPanelHeight, DEFAULT_PANEL, MIN_PANEL_HEIGHT, MIN_SITE_HEIGHT, parsePanelState } from '../src/main/terminalPanel.js';

describe('clampPanelHeight', () => {
  it('keeps a height that fits', () => {
    expect(clampPanelHeight(300, 800)).toBe(300);
  });

  it('never goes below the panel minimum', () => {
    expect(clampPanelHeight(10, 800)).toBe(MIN_PANEL_HEIGHT);
  });

  it('leaves the site its minimum', () => {
    expect(clampPanelHeight(790, 800)).toBe(800 - MIN_SITE_HEIGHT);
  });

  it('keeps the panel minimum in a window too short for both', () => {
    expect(clampPanelHeight(300, 200)).toBe(MIN_PANEL_HEIGHT);
  });

  it('rounds to whole pixels', () => {
    expect(clampPanelHeight(300.6, 800)).toBe(301);
  });
});

describe('parsePanelState', () => {
  it('reads a saved state, closed included', () => {
    expect(parsePanelState({ height: 400, open: true })).toEqual({ height: 400, open: true });
    expect(parsePanelState({ height: 400, open: false })).toEqual({ height: 400, open: false });
  });

  it('opens the panel for a root with no saved state', () => {
    expect(parsePanelState(undefined).open).toBe(true);
  });

  it('falls back to the default for anything malformed', () => {
    expect(parsePanelState(undefined)).toEqual(DEFAULT_PANEL);
    expect(parsePanelState({ height: 'tall', open: 'yes' })).toEqual(DEFAULT_PANEL);
    expect(parsePanelState({ height: Number.NaN })).toEqual(DEFAULT_PANEL);
  });
});
