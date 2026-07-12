import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getEditorialSectionCopy, getMessages } from '@dental-trust/i18n';
import { EditorialPage } from '@/components/editorial-page';

describe('EditorialPage', () => {
  it('renders a distinct, substantive answer for every FAQ question', () => {
    const messages = getMessages('en');
    const answers = getEditorialSectionCopy('en', 'faq');

    render(<EditorialPage locale="en" messages={messages} pageKey="faq" />);

    expect(screen.getAllByText(messages.editorial.faq[1])).toHaveLength(1);
    for (const [index, question] of messages.editorial.faq[2].entries()) {
      const answer = answers[index];
      expect(screen.getByRole('heading', { name: question })).toBeInTheDocument();
      expect(answer).toBeDefined();
      if (answer) expect(screen.getByText(answer)).toBeInTheDocument();
    }
  });

  it('links only the supported service detail instead of misrouting every service', () => {
    const messages = getMessages('vi');

    render(<EditorialPage locale="vi" messages={messages} pageKey="services" />);

    const links = screen.getAllByRole('link', { name: new RegExp(messages.common.learnMore) });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/vi/services/dental-implants');
  });
});
