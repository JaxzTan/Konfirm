import { render, screen } from '@testing-library/react';
import Home from './page';

// The page reads dapp-kit hooks, which require a WalletProvider above them.
// Mocking the hooks keeps this a plain render test instead of standing up the
// real provider, which would try to register Enoki wallets over the network.
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => null,
  useWallets: () => [],
  useConnectWallet: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('Home', () => {
  it('renders the app name', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Konfirm' })).toBeInTheDocument();
  });

  it('tells the user when no sign-in provider is available', () => {
    render(<Home />);
    expect(screen.getByText('Sign-in is temporarily unavailable.')).toBeInTheDocument();
  });
});
