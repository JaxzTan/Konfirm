import { render, screen } from '@testing-library/react';
import { FlowProvider } from './flow';
import { Chrome } from './Chrome';
import { InputBody } from './InputBody';
import { ResultPanel } from './ResultPanel';
import SignInPage from './signin/page';
import { GoogleLogin } from '@/app/components/GoogleLogin';

// The flow reads dapp-kit hooks, which require a WalletProvider above them.
// Mocking them keeps this a plain render test instead of standing up the real
// provider, which would try to register Enoki wallets over the network.
// `useWallets: () => []` is the "no Enoki wallet registered" case, which is
// what an unconfigured/failed Portal setup looks like to the UI.
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => null,
  useCurrentWallet: () => ({ currentWallet: null, supportedIntents: [] }),
  useWallets: () => [],
  useConnectWallet: () => ({ mutate: vi.fn(), isPending: false }),
  useDisconnectWallet: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Real useSignAndExecuteTransaction needs a QueryClientProvider (react-query)
// ancestor, supplied in production by app/providers.tsx — out of scope for a
// render-only test, so it's mocked like the dapp-kit hooks above.
vi.mock('@/lib/sui/useSignAndExecuteTransaction', () => ({
  useSignAndExecuteTransaction: () => ({ mutateAsync: vi.fn() }),
}));

// Every screen navigates or reads the path; a render-only test has no App
// Router context to supply either.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('notFound');
  },
}));

const inFlow = (ui: React.ReactNode) =>
  render(<FlowProvider locale="en">{ui}</FlowProvider>);

describe('check flow', () => {
  it('renders the app name in the shared chrome', () => {
    inFlow(<Chrome />);
    // "Konfirm" in the header is a brand mark (a styled <span> in a <Link>),
    // not a semantic heading.
    expect(screen.getByText('Konfirm')).toBeInTheDocument();
  });

  it('shows no account badge while signed out', () => {
    inFlow(<Chrome />);
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });

  it('renders the input mode the route selects', () => {
    inFlow(<InputBody mode="photo" />);
    expect(screen.getByText('Tap to upload a screenshot')).toBeInTheDocument();
    expect(screen.queryByText('Auto-detecting language')).not.toBeInTheDocument();
  });

  it('renders the verdict named by the route segment', () => {
    // /result/true — with no check behind it the fixture for that segment
    // stands in, so the segment is the only thing selecting this screen.
    inFlow(<ResultPanel state="true" />);
    expect(screen.getByText('Likely True')).toBeInTheDocument();
    expect(screen.queryByText('Likely False')).not.toBeInTheDocument();
  });

  it('withholds the result behind the sign-in gate', () => {
    inFlow(<SignInPage />);
    expect(screen.getByText('One more step to see your result')).toBeInTheDocument();
    expect(screen.queryByText('Likely False')).not.toBeInTheDocument();
  });
});

describe('GoogleLogin', () => {
  it('tells the user when no sign-in provider is available', () => {
    // useWallets() mocked to [] above means isEnokiWallet(...) finds nothing
    // for any provider — the real-world case is Enoki/Google not registered
    // yet (network hiccup, misconfigured Portal), covered directly here
    // rather than via the gate screen.
    render(<GoogleLogin labels={{ signIn: 'Continue with Google', unavailable: 'Sign-in is temporarily unavailable.' }} />);
    expect(screen.getByText('Sign-in is temporarily unavailable.')).toBeInTheDocument();
  });
});
