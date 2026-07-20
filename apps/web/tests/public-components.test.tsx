import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMessages } from '@dental-trust/i18n';
import { AuthShell } from '@/components/auth-shell';
import { Brand } from '@/components/brand';
import { ClinicProfile } from '@/components/clinic-profile';
import { ContactForm } from '@/components/contact-form';
import { HomePage } from '@/components/home-page';
import { InstallApp } from '@/components/install-app';
import { LocaleSwitch } from '@/components/locale-switch';
import { PublicFooter } from '@/components/public-footer';
import { PublicHeader } from '@/components/public-header';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration';
import { SimpleAuthForm } from '@/components/simple-auth-form';
import type { PublicClinic } from '@/lib/public-data';
import { selectCustomOption } from './custom-select-helpers';

const navigation = vi.hoisted(() => ({ pathname: '/en/clinics', push: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

const messages = getMessages('en');
const labelPattern = (value: string) =>
  new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'i');
const clinic: PublicClinic = {
  slug: 'verified-clinic',
  name: 'Verified Clinic',
  district: 'District 1',
  services: ['Implants', 'Crowns'],
  languages: ['English', 'Vietnamese'],
  rating: '4.9',
  reviews: '12',
  price: 'USD 1,000–2,000',
  next: 'Tomorrow',
  updated: '2026-07-12',
  evidence: ['License current', 'Sterilization reviewed'],
  license: 'LICENSE-123',
  address: '1 Safe Street',
  hours: '08:00–18:00',
  description: 'A current evidence-checked clinic.',
  verificationExpiresAt: '2999-01-01T00:00:00.000Z',
  fixture: false,
};

beforeEach(() => {
  navigation.pathname = '/en/clinics';
  navigation.push.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('public presentation components', () => {
  it('renders brand, auth shell, locale switch, header, and footer navigation', () => {
    render(
      <>
        <Brand locale="en" label="Dental Trust" />
        <LocaleSwitch locale="en" label="Change language" />
        <AuthShell locale="en" messages={messages}>
          <p>Secure form</p>
        </AuthShell>
        <PublicHeader locale="en" messages={messages} />
        <PublicFooter locale="en" messages={messages} />
      </>,
    );

    expect(screen.getAllByRole('link', { name: /dental trust/i }).length).toBeGreaterThan(1);
    expect(screen.getAllByRole('link', { name: 'Change language' })[0]).toHaveAttribute(
      'href',
      '/vi/clinics',
    );
    expect(screen.getByText('Secure form')).toBeInTheDocument();
    const menu = screen.getByRole('button', { name: messages.common.menu });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    const mobileNavigation = screen.getByRole('navigation', {
      name: messages.common.mobileNavigation,
    });
    fireEvent.click(within(mobileNavigation).getByRole('link', { name: messages.nav.how }), {
      button: 1,
    });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  it('falls back to the alternate locale root when the path has no locale prefix', () => {
    navigation.pathname = '';
    render(<LocaleSwitch locale="vi" label="Language" />);
    expect(screen.getByRole('link', { name: 'Language' })).toHaveAttribute('href', '/en');
  });

  it('renders complete clinic and homepage evidence without indexing fixture data', () => {
    const { container, rerender } = render(
      <ClinicProfile clinic={clinic} locale="en" messages={messages} nonce="nonce-1" />,
    );
    expect(screen.getByRole('heading', { name: clinic.name })).toBeInTheDocument();
    expect(screen.getByText(clinic.license)).toBeInTheDocument();
    expect(container.querySelector('script[type="application/ld+json"]')).toHaveAttribute(
      'nonce',
      'nonce-1',
    );

    rerender(<HomePage clinics={[clinic]} locale="en" messages={messages} nonce="nonce-2" />);
    expect(screen.getByRole('heading', { name: messages.home.title })).toBeInTheDocument();
    expect(screen.getAllByText(clinic.name).length).toBeGreaterThan(0);
    expect(container.querySelector('script[type="application/ld+json"]')).toHaveAttribute(
      'nonce',
      'nonce-2',
    );

    rerender(<HomePage clinics={[{ ...clinic, fixture: true }]} locale="en" messages={messages} />);
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(screen.getAllByText(messages.common.developmentFixture).length).toBeGreaterThan(0);

    rerender(<HomePage clinics={[]} locale="en" messages={messages} />);
    expect(screen.getByText(messages.common.emptyTitle)).toBeInTheDocument();
  });

  it('omits empty optional clinic evidence safely', () => {
    const sparse = {
      ...clinic,
      fixture: true,
      address: '',
      hours: '',
      district: '',
      updated: '',
      rating: '',
      reviews: '',
      license: '',
      price: '',
      services: [],
      evidence: [],
      description: '',
    };
    const { container } = render(<ClinicProfile clinic={sparse} locale="en" messages={messages} />);
    expect(screen.getByRole('heading', { name: sparse.name })).toBeInTheDocument();
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull();
  });
});

function fillContactForm() {
  fireEvent.change(screen.getByLabelText(labelPattern(messages.forms.contactName)), {
    target: { value: 'Patient Name' },
  });
  fireEvent.change(screen.getByLabelText(labelPattern(messages.forms.contactEmail)), {
    target: { value: 'patient@example.test' },
  });
  selectCustomOption(screen.getByLabelText(labelPattern(messages.forms.topic)), 'Case support');
  fireEvent.change(screen.getByLabelText(labelPattern(messages.forms.message)), {
    target: { value: 'A sufficiently detailed non-urgent support request.' },
  });
}

describe('contact form', () => {
  it('submits structured content and supports returning from success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ContactForm messages={messages} topics={['Case support']} />);
    fillContactForm();
    fireEvent.click(screen.getByRole('button', { name: messages.forms.send }));
    expect(await screen.findByText(messages.forms.successTitle)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/public/contact',
      expect.objectContaining({ method: 'POST' }),
    );
    fireEvent.click(screen.getByRole('button', { name: messages.common.back }));
    expect(screen.getByRole('button', { name: messages.forms.send })).toBeInTheDocument();
  });

  it('shows a safe error for rejected and failed transport', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })));
    const { unmount } = render(<ContactForm messages={messages} topics={['Case support']} />);
    fillContactForm();
    fireEvent.click(screen.getByRole('button', { name: messages.forms.send }));
    expect(await screen.findByText(messages.forms.submitError)).toBeInTheDocument();
    unmount();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<ContactForm messages={messages} topics={['Case support']} />);
    fillContactForm();
    fireEvent.click(screen.getByRole('button', { name: messages.forms.send }));
    expect(await screen.findByText(messages.forms.submitError)).toBeInTheDocument();
  });
});

describe('install and service worker behavior', () => {
  it('prompts for PWA installation and hides after acceptance or installation', async () => {
    render(<InstallApp label="Install" ready="Ready" />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const installEvent = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    fireEvent(window, installEvent);
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Install' })).toBeNull());
  });

  it('keeps a dismissed install prompt and clears it after app installation', async () => {
    render(<InstallApp label="Install" ready="Ready" />);
    fireEvent(
      window,
      Object.assign(new Event('beforeinstallprompt'), {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument(),
    );
    fireEvent(window, new Event('appinstalled'));
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('registers the service worker only in production', () => {
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });
    vi.stubEnv('NODE_ENV', 'production');
    const { unmount } = render(<ServiceWorkerRegistration />);
    fireEvent(window, new Event('load'));
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    unmount();

    register.mockClear();
    vi.stubEnv('NODE_ENV', 'development');
    render(<ServiceWorkerRegistration />);
    fireEvent(window, new Event('load'));
    expect(register).not.toHaveBeenCalled();
  });
});

function fillResetRequest() {
  fireEvent.change(screen.getByLabelText(labelPattern(messages.auth.email)), {
    target: { value: 'patient@example.test' },
  });
}

describe('simple authentication flows', () => {
  it('submits a password reset request and returns from success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 202 })));
    render(<SimpleAuthForm kind="reset" messages={messages} />);
    fillResetRequest();
    fireEvent.click(screen.getByRole('button', { name: messages.auth.send }));
    expect(await screen.findByText(messages.auth.success)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: messages.common.back }));
    expect(screen.getByLabelText(labelPattern(messages.auth.email))).toBeInTheDocument();
  });

  it('rejects mismatched reset passwords before transport', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<SimpleAuthForm kind="reset" messages={messages} token="reset-token" />);
    fireEvent.change(screen.getByLabelText(/^Password(?: \*)?$/i), {
      target: { value: 'long-password-one' },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm password(?: \*)?$/i), {
      target: { value: 'long-password-two' },
    });
    fireEvent.click(screen.getByRole('button', { name: messages.auth.send }));
    expect(await screen.findByText(messages.forms.submitError)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles MFA, session revocation, upstream rejection, and transport errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })));
    const { unmount } = render(<SimpleAuthForm kind="mfa" messages={messages} />);
    fireEvent.change(screen.getByLabelText(labelPattern(messages.auth.codeLabel)), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: messages.auth.verify }));
    expect(await screen.findByText(messages.forms.submitError)).toBeInTheDocument();
    unmount();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<SimpleAuthForm kind="sessions" messages={messages} />);
    fireEvent.click(screen.getByRole('button', { name: messages.common.logout }));
    expect(await screen.findByText(messages.forms.submitError)).toBeInTheDocument();
  });
});
