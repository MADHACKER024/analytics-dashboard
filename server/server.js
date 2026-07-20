import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { randomUUID } from 'crypto';
import { createAnalyticsStore } from './storage.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const analyticsStore = createAnalyticsStore();
let activeUsers = 0;

function now() {
  return Date.now();
}

io.on('connection', (socket) => {
  socket.on('visitor:join', async ({ sessionId, userAgent, entrySource, entryPage }) => {
    const id = sessionId || randomUUID();
    await analyticsStore.startSession({ sessionId: id, userAgent, entrySource, entryPage });
    activeUsers += 1;
    socket.data.sessionId = id;
    socket.join(id);
    socket.emit('session:ready', { sessionId: id });
    io.emit('active-users:update', { count: activeUsers });
  });

  socket.on('visitor:pageview', async ({ sessionId, page, source }) => {
    const visit = await analyticsStore.trackVisit({ sessionId, page, source });
    io.emit('analytics:update', { visit });
    io.emit('active-users:update', { count: activeUsers });
  });

  socket.on('visitor:leave', async ({ sessionId }) => {
    await analyticsStore.endSession(sessionId);
    activeUsers = Math.max(0, activeUsers - 1);
    io.emit('active-users:update', { count: activeUsers });
  });

  socket.on('disconnect', () => {
    if (socket.data?.sessionId) {
      activeUsers = Math.max(0, activeUsers - 1);
      io.emit('active-users:update', { count: activeUsers });
    }
  });
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.post('/api/track', async (req, res) => {
  const { sessionId, page, source, entrySource, entryPage, userAgent } = req.body;
  const id = sessionId || randomUUID();
  await analyticsStore.startSession({ sessionId: id, userAgent, entrySource: entrySource || source || 'Direct', entryPage: entryPage || page || 'Home' });
  const visit = await analyticsStore.trackVisit({ sessionId: id, page: page || entryPage || 'Home', source: source || entrySource || 'Direct' });
  res.json({ success: true, visit });
});

app.post('/api/session/start', async (req, res) => {
  const { sessionId, userAgent, entrySource, entryPage } = req.body;
  const id = sessionId || randomUUID();
  await analyticsStore.startSession({ sessionId: id, userAgent, entrySource, entryPage });
  res.json({ success: true, sessionId: id });
});

app.post('/api/session/end', async (req, res) => {
  const { sessionId } = req.body;
  const result = await analyticsStore.endSession(sessionId);
  if (!result) return res.status(404).json({ error: 'Session not found' });
  res.json({ success: true, session: result });
});

app.get('/api/dashboard', async (_, res) => {
  const summary = await analyticsStore.getDashboardSummary();
  res.json(summary);
});

app.get('/api/dashboard/most-visited', async (_, res) => {
  const summary = await analyticsStore.getDashboardSummary();
  res.json(summary.visitsByPage);
});

app.get('/api/dashboard/page-time', async (_, res) => {
  const summary = await analyticsStore.getDashboardSummary();
  res.json(summary.pageTime);
});

app.get('/api/dashboard/navigation', async (_, res) => {
  const summary = await analyticsStore.getDashboardSummary();
  res.json(summary.navigationFlow);
});

app.get('/api/dashboard/entry-source', async (_, res) => {
  const summary = await analyticsStore.getDashboardSummary();
  res.json(summary.entrySources);
});

app.get('/api/dashboard/active-users', async (_, res) => {
  const sessions = await analyticsStore.getActiveUsers();
  res.json({ count: sessions.length, sessions });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Analytics API running on http://localhost:${PORT}`);
});
