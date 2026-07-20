import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CustomSelect, SelectField } from '@dental-trust/ui';

describe('CustomSelect', () => {
  it('opens a large custom listbox and updates controlled values', () => {
    function Example() {
      const [value, setValue] = useState('recommended');
      return (
        <CustomSelect
          aria-label="Sort results"
          menuLabel="Sort results"
          onChange={(event) => setValue(event.currentTarget.value)}
          value={value}
        >
          <option value="recommended">Recommended</option>
          <option value="rating">Highest rated</option>
          <option value="price">Lowest price</option>
        </CustomSelect>
      );
    }

    render(<Example />);
    const trigger = screen.getByRole('combobox', { name: 'Sort results' });
    expect(trigger).toHaveTextContent('Recommended');

    fireEvent.click(trigger);
    expect(screen.getByRole('listbox', { name: 'Sort results' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Highest rated' }));

    expect(trigger).toHaveTextContent('Highest rated');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('supports keyboard selection and preserves form submission values', () => {
    const submitted = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted(Object.fromEntries(new FormData(event.currentTarget)));
        }}
      >
        <SelectField defaultValue="normal" label="Priority" name="priority">
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </SelectField>
        <button type="submit">Save</button>
      </form>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Priority' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(trigger).toHaveTextContent('High');
    expect(submitted).toHaveBeenCalledWith({ priority: 'high' });
  });

  it('closes on Escape without changing the selected option', () => {
    render(
      <CustomSelect aria-label="Status" defaultValue="active">
        <option value="active">Active</option>
        <option value="locked">Locked</option>
      </CustomSelect>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Status' });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(trigger).toHaveTextContent('Active');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('preserves required validation before a form can submit', () => {
    const submitted = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted();
        }}
      >
        <SelectField defaultValue="" label="Clinic" name="clinicId" required>
          <option disabled value="">
            Choose a clinic
          </option>
          <option value="clinic-1">Clinic One</option>
        </SelectField>
        <button type="submit">Continue</button>
      </form>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Clinic' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(submitted).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-invalid', 'true');

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Clinic One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(submitted).toHaveBeenCalledOnce();
  });

  it('works inside existing wrapping labels without reopening after selection', () => {
    render(
      <label>
        <span>Status</span>
        <CustomSelect defaultValue="active">
          <option value="active">Active</option>
          <option value="locked">Locked</option>
        </CustomSelect>
      </label>,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAccessibleName(/Status/u);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Locked' }));

    expect(trigger).toHaveTextContent('Locked');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
