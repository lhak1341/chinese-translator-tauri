import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import TabPanel, { tabDomIds } from '../TabPanel';
import { VisibleTabProvider } from '../VisibleTabContext';
import { TAB_ORDER } from '../../constants/tabs';

describe('tabDomIds', () => {
  test('a tab and its panel have distinct ids, and every tab has its own', () => {
    const ids = TAB_ORDER.flatMap((id) => [tabDomIds(id).tab, tabDomIds(id).panel]);
    expect(new Set(ids).size).toBe(TAB_ORDER.length * 2);
  });
});

describe('TabPanel', () => {
  test.each(TAB_ORDER)('%s is labelled by the nav button that controls it', (id) => {
    render(
      <VisibleTabProvider initialTab={id}>
        <TabPanel id={id}>content</TabPanel>
      </VisibleTabProvider>
    );
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('id', tabDomIds(id).panel);
    expect(panel).toHaveAttribute('aria-labelledby', tabDomIds(id).tab);
  });

  test('stays mounted while another tab is showing, and differs only by class', () => {
    const { rerender } = render(
      <VisibleTabProvider initialTab="reader">
        <TabPanel id="reader">content</TabPanel>
      </VisibleTabProvider>
    );
    const showing = screen.getByRole('tabpanel', { hidden: true }).className;

    rerender(
      <VisibleTabProvider initialTab="reader">
        <TabPanel id="translator">content</TabPanel>
      </VisibleTabProvider>
    );
    // A different id under the same provider is the hidden case: the reader is showing.
    const panel = screen.getByRole('tabpanel', { hidden: true });
    expect(panel).toHaveTextContent('content');
    expect(panel.className).not.toBe(showing);
  });
});
