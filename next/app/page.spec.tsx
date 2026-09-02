import { render, screen } from '@testing-library/react';
import Home from './page';

// The page reads dapp-kit hooks, which require a WalletProvider above them.
// Mocking the hooks keeps this a plain render test instead of standing up the
// real provider, which would try to register Enoki wallets over the network.
// `useWallets: () => []` is the "no Enoki wallet registered" case, which is
// what an unconfigured/failed Portal setup looks like to the UI.
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => null,
  useWallets: () => [],
  useConnectWallet: () => ({ mutate: vi.fn(), isPending: false }),
  useDisconnectWallet: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('Home', () => {
  it('renders the app name', () => {
    render(<Home />);
    expect(screen.getByText('Konfirm')).toBeInTheDocument();
  });

  it('shows no account badge while signed out', () => {
    render(<Home />);
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });
});
