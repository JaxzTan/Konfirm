export default function Home() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '0.5rem',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '2rem' }}>Konfirm</h1>
      <p style={{ margin: 0, color: 'var(--muted)' }}>
        Edit <code>app/page.tsx</code> to get started.
      </p>
    </main>
  );
}
