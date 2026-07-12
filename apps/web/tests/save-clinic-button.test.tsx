import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SaveClinicButton } from '@/components/save-clinic-button';

describe('SaveClinicButton', () => {
  it('round-trips its state through local storage', () => {
    render(<SaveClinicButton slug="minh-an" save="Save clinic" saved="Saved" />);
    const button = screen.getByRole('button', { name: 'Save clinic' });
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Saved' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('dt-saved-clinics')).toContain('minh-an');
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    expect(screen.getByRole('button', { name: 'Save clinic' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
