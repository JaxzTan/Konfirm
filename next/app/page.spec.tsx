import { render, screen } from '@testing-library/react';
import Home from './page';
import { GoogleLogin } from './components/GoogleLogin';

// The page reads dapp-kit hooks, which require a WalletProvider above them.
// Mocking the hooks keeps this a plain render test instead of standing up the
// real provider, which would try to register Enoki wallets over the network.
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
// ancestor, supplied in production by app/providers.tsx — out of scope for
// this render-only test, so it's mocked like the dapp-kit hooks above.
vi.mock('@/lib/sui/useSignAndExecuteTransaction', () => ({
  useSignAndExecuteTransaction: () => ({ mutateAsync: vi.fn() }),
}));

describe('Home', () => {
  it('renders the app name', () => {
    render(<Home />);
    // "Konfirm" in the header is a brand mark (a styled <span> in a <Link>),
    // not a semantic heading.
    expect(screen.getByText('Konfirm')).toBeInTheDocument();
  });

  it('shows no account badge while signed out', () => {
    render(<Home />);
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });
});

describe('GoogleLogin', () => {
  it('tells the user when no sign-in provider is available', () => {
    // useWallets() mocked to [] above means isEnokiWallet(...) finds nothing
    // for any provider — the real-world case is Enoki/Google not registered
    // yet (network hiccup, misconfigured Portal), covered directly here
    // rather than via Home's login-gate state.
    render(<GoogleLogin labels={{ signIn: 'Continue with Google', unavailable: 'Sign-in is temporarily unavailable.' }} />);
    expect(screen.getByText('Sign-in is temporarily unavailable.')).toBeInTheDocument();
  });
});
