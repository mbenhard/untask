import { DragBar } from './components/DragBar';
import { useBootstrapState } from './hooks/useBootstrapState';

const App = (): JSX.Element => {
  const { status, loading } = useBootstrapState();

  return (
    <div className="app-shell">
      <DragBar />
      <main className="app-content">
        <h1>Flusk</h1>
        <p>Personal assistant runtime initialized.</p>
        <p className="status-row">
          IPC bootstrap:
          <strong>{loading ? ' checking...' : ` ${status}`}</strong>
        </p>
      </main>
    </div>
  );
};

export default App;
