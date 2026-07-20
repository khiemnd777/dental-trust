import { fireEvent, screen, within } from '@testing-library/react';

export function selectCustomOption(control: HTMLElement, value: string) {
  fireEvent.click(control);
  const listbox = screen.getByRole('listbox');
  const option = within(listbox)
    .getAllByRole('option')
    .find((item) => item.getAttribute('data-option-value') === value);
  if (!option) throw new Error(`Expected dropdown option with value "${value}".`);
  fireEvent.click(option);
}
