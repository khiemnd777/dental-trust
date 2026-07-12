import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getMessages } from '@dental-trust/i18n';
import { ClinicDiscovery } from '@/components/clinic-discovery';
import { developmentCaseId } from '@/lib/routing';

describe('clinic discovery', () => {
  it('filters clinics through the submitted search and can clear an empty result', () => {
    const messages = getMessages('en');
    render(
      <ClinicDiscovery
        clinics={messages.clinics.map((clinic) => ({
          ...clinic,
          license: '',
          address: '',
          hours: '',
          description: '',
          fixture: true,
        }))}
        locale="en"
        messages={messages}
      />,
    );
    expect(screen.getAllByText(messages.clinics[0].name).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole('searchbox', { name: messages.discovery.searchLabel }), {
      target: { value: 'not-a-real-clinic' },
    });
    fireEvent.click(screen.getByRole('button', { name: messages.common.search }));
    expect(screen.getByText(messages.common.emptyTitle)).toBeInTheDocument();
    const clearButton = screen.getAllByRole('button', { name: messages.common.clear }).at(0);
    if (!clearButton) throw new Error('Clear button is required');
    fireEvent.click(clearButton);
    expect(screen.getAllByText(messages.clinics[0].name).length).toBeGreaterThan(0);
  });

  it('persists saved clinics and exposes a comparison destination', () => {
    const messages = getMessages('en');
    render(
      <ClinicDiscovery
        clinics={messages.clinics.map((clinic) => ({
          ...clinic,
          license: '',
          address: '',
          hours: '',
          description: '',
          fixture: true,
        }))}
        locale="en"
        messages={messages}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: `${messages.common.save}: ${messages.clinics[0].name}` }),
    );
    expect(JSON.parse(localStorage.getItem('dt-saved-clinics') ?? '[]')).toContain(
      messages.clinics[0].slug,
    );
    const compareButton = screen.getAllByRole('button', { name: messages.common.compare }).at(0);
    if (!compareButton) throw new Error('Compare button is required');
    fireEvent.click(compareButton);
    expect(screen.getByRole('link', { name: /Compare selections/i })).toHaveAttribute(
      'href',
      `/en/app/cases/${developmentCaseId}/shortlist`,
    );
  });
});
