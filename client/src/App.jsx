import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const pages = ['Home', 'Products', 'Pricing', 'About', 'Contact'];
const sources = ['Direct', 'Search', 'Social', 'Email', 'Referral'];

function App() {
  const [dashboard, setDashboard] = useState(null);
  const [activePage, setActivePage] = useState('Home');
  const [activeSource, setActiveSource] = useState('Direct');
  const [sessionId, setSessionId] = useState('');
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    const generatedSession = crypto.randomUUID();
    setSessionId(generatedSession);
    newSocket.emit('visitor:join', {
      sessionId: generatedSession,
      userAgent: navigator.userAgent,
      entrySource: activeSource,
      entryPage: activePage
    });

    newSocket.on('analytics:update', () => {
      fetchDashboard();
    });

    newSocket.on('active-users:update', () => {
      fetchDashboard();
    });

    fetchDashboard();

    return () => newSocket.disconnect();
  }, []);

  const fetchDashboard = async () => {
    const response = await fetch('/api/dashboard');
    const data = await response.json();
    setDashboard(data);
  };

  const trackPageView = async (page, source) => {
    setActivePage(page);
    setActiveSource(source);
    if (!sessionId) return;

    const response = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, page, source })
    });
    const result = await response.json();
    if (result?.visit) {
      socket?.emit('visitor:pageview', { sessionId, page, source });
      fetchDashboard();
    }
  };

  const metrics = useMemo(() => {
    if (!dashboard) return null;
    return [
      { label: 'Total Visits', value: dashboard.totalVisits },
      { label: 'Active Users', value: dashboard.activeUsers },
      { label: 'Top Page', value: dashboard.topPage },
      { label: 'Entry Sources', value: dashboard.entrySources.length }
    ];
  }, [dashboard]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">User Analytics Dashboard</p>
          <h1>Track page activity, session flow, and live user engagement.</h1>
          <p className="intro">This demo combines a React frontend, an Express API, and a persistent analytics store for page visits, session activity, and navigation insights.</p>
        </div>
        <div className="hero-card">
          <strong>Current Session</strong>
          <span>{sessionId.slice(0, 8)}...</span>
        </div>
      </header>

      <section className="controls">
        <div>
          <label>Choose page</label>
          <select value={activePage} onChange={(e) => trackPageView(e.target.value, activeSource)}>
            {pages.map((page) => (
              <option key={page} value={page}>
                {page}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Entry source</label>
          <select value={activeSource} onChange={(e) => trackPageView(activePage, e.target.value)}>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </div>
      </section>

      {!dashboard ? (
        <p>Loading analytics...</p>
      ) : (
        <>
          <section className="metrics-grid">
            {metrics.map((metric) => (
              <article key={metric.label} className="metric-card">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </section>

          <section className="grid">
            <article className="panel">
              <h3>Most visited pages</h3>
              <ul>
                {dashboard.visitsByPage.map((item) => (
                  <li key={item.page}>
                    <span>{item.page}</span>
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <h3>Page time spent</h3>
              <ul>
                {dashboard.pageTime?.map((item) => (
                  <li key={item.page}>
                    <span>{item.page}</span>
                    <strong>{item.timeSpentMinutes} min</strong>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <section className="grid">
            <article className="panel">
              <h3>Entry sources</h3>
              <ul>
                {dashboard.entrySources.map((item) => (
                  <li key={item.source}>
                    <span>{item.source}</span>
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <h3>Navigation flow</h3>
              <ul>
                {dashboard.navigationFlow.map((item) => (
                  <li key={item.path}>
                    <span>{item.path}</span>
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <section className="panel full">
            <h3>Recent visits</h3>
            <ul>
              {dashboard.recentVisits.map((item) => (
                <li key={item.id}>
                  <span>{item.page}</span>
                  <strong>{item.source}</strong>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

export default App;
