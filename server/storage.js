import { MongoClient } from 'mongodb';

const DATABASE_URL = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DATABASE_NAME = process.env.MONGODB_DB || 'analytics_dashboard';

let client;
let db;

function createFallbackStore() {
  const sessions = [];
  const visits = [];

  return {
    async startSession({ sessionId, userAgent, entrySource, entryPage }) {
      const existing = sessions.find((item) => item.sessionId === sessionId);
      if (!existing) {
        sessions.push({ sessionId, userAgent: userAgent || 'unknown', entrySource: entrySource || 'Direct', entryPage: entryPage || 'Home', startTime: Date.now(), lastSeen: Date.now(), durationMs: 0, pages: [] });
      }
      return { sessionId };
    },
    async trackVisit({ sessionId, page, source }) {
      const now = Date.now();
      const session = sessions.find((item) => item.sessionId === sessionId);
      if (!session) {
        return null;
      }

      const pageSeenBefore = session.pages.some((entry) => entry.page === page);
      if (pageSeenBefore) {
        return null;
      }

      const visit = { id: `${sessionId}-${now}`, sessionId, page, source: source || 'Direct', timestamp: now };
      visits.push(visit);
      session.pages.push({ page, timestamp: visit.timestamp });
      session.lastSeen = visit.timestamp;
      return visit;
    },
    async endSession(sessionId) {
      const session = sessions.find((item) => item.sessionId === sessionId);
      if (!session) return null;
      session.durationMs = Date.now() - session.startTime;
      session.lastSeen = Date.now();
      return { sessionId };
    },
    async getDashboardSummary() {
      const visitsByPage = visits.reduce((acc, visit) => {
        acc[visit.page] = (acc[visit.page] || 0) + 1;
        return acc;
      }, {});
      const entrySources = sessions.reduce((acc, session) => {
        const source = session.entrySource || 'Direct';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {});
      const pageTime = Object.entries(visitsByPage).map(([page, count]) => ({ page, timeSpentMinutes: Math.max(2, Math.round(count * 1.8)) })).sort((a, b) => b.timeSpentMinutes - a.timeSpentMinutes);
      return {
        totalVisits: visits.length,
        activeUsers: sessions.length,
        topPage: Object.entries(visitsByPage).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Home',
        entrySources: Object.entries(entrySources).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
        visitsByPage: Object.entries(visitsByPage).map(([page, count]) => ({ page, count })).sort((a, b) => b.count - a.count),
        pageTime,
        navigationFlow: [],
        recentVisits: visits.slice(-8).reverse()
      };
    },
    async getActiveUsers() {
      return sessions.slice(-10);
    }
  };
}

export function createAnalyticsStore() {
  let fallbackStore = null;

  return {
    async initialize() {
      if (db) return db;
      if (fallbackStore) return fallbackStore;
      try {
        client = new MongoClient(DATABASE_URL);
        await client.connect();
        db = client.db(DATABASE_NAME);
        await Promise.all([
          db.collection('sessions').createIndex({ sessionId: 1 }, { unique: true }),
          db.collection('pageVisits').createIndex({ timestamp: -1 }),
          db.collection('navigation').createIndex({ sessionId: 1, order: 1 })
        ]);
        return db;
      } catch (error) {
        fallbackStore = createFallbackStore();
        return fallbackStore;
      }
    },

    async startSession({ sessionId, userAgent, entrySource, entryPage }) {
      await this.initialize();
      if (fallbackStore) {
        return fallbackStore.startSession({ sessionId, userAgent, entrySource, entryPage });
      }
      const now = Date.now();
      await db.collection('sessions').updateOne(
        { sessionId },
        {
          $setOnInsert: {
            sessionId,
            userAgent: userAgent || 'unknown',
            entrySource: entrySource || 'Direct',
            entryPage: entryPage || 'Home',
            startTime: now,
            lastSeen: now,
            durationMs: 0,
            pages: []
          }
        },
        { upsert: true }
      );
      return { sessionId };
    },

    async trackVisit({ sessionId, page, source }) {
      await this.initialize();
      if (fallbackStore) {
        return fallbackStore.trackVisit({ sessionId, page, source });
      }

      const now = Date.now();
      const existingSession = await db.collection('sessions').findOne({ sessionId });
      if (existingSession?.pages?.some((entry) => entry.page === page)) {
        return null;
      }

      const visit = {
        id: `${sessionId}-${now}`,
        sessionId,
        page,
        source: source || 'Direct',
        timestamp: now
      };
      await db.collection('pageVisits').insertOne(visit);
      await db.collection('sessions').updateOne(
        { sessionId },
        {
          $addToSet: { pages: { page, timestamp: now } },
          $set: { lastSeen: now }
        },
        { upsert: true }
      );
      return visit;
    },

    async endSession(sessionId) {
      await this.initialize();
      if (fallbackStore) {
        return fallbackStore.endSession(sessionId);
      }
      const now = Date.now();
      const session = await db.collection('sessions').findOne({ sessionId });
      if (!session) return null;
      await db.collection('sessions').updateOne(
        { sessionId },
        { $set: { durationMs: now - session.startTime, lastSeen: now } }
      );
      return { sessionId };
    },

    async getDashboardSummary() {
      await this.initialize();
      if (fallbackStore) {
        return fallbackStore.getDashboardSummary();
      }
      const [sessions, visits] = await Promise.all([
        db.collection('sessions').find({}).toArray(),
        db.collection('pageVisits').find({}).toArray()
      ]);
      const visitsByPage = visits.reduce((acc, visit) => {
        acc[visit.page] = (acc[visit.page] || 0) + 1;
        return acc;
      }, {});
      const entrySources = sessions.reduce((acc, session) => {
        const source = session.entrySource || 'Direct';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {});
      const pageTime = Object.entries(visitsByPage).map(([page, count]) => ({
        page,
        timeSpentMinutes: Math.max(2, Math.round(count * 1.8))
      })).sort((a, b) => b.timeSpentMinutes - a.timeSpentMinutes);
      const recentVisits = visits.slice(-8).reverse();
      return {
        totalVisits: visits.length,
        activeUsers: sessions.length,
        topPage: Object.entries(visitsByPage).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Home',
        entrySources: Object.entries(entrySources).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
        visitsByPage: Object.entries(visitsByPage).map(([page, count]) => ({ page, count })).sort((a, b) => b.count - a.count),
        pageTime,
        navigationFlow: [],
        recentVisits
      };
    },

    async getActiveUsers() {
      await this.initialize();
      if (fallbackStore) {
        return fallbackStore.getActiveUsers();
      }
      return db.collection('sessions').find({}).limit(10).toArray();
    }
  };
}

export async function closeAnalyticsStore() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
