import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyticsStore } from '../storage.js';

test('tracks page visits and produces dashboard summary', async () => {
  const store = createAnalyticsStore();
  await store.initialize();

  await store.startSession({
    sessionId: 'session-1',
    userAgent: 'test-browser',
    entrySource: 'Direct',
    entryPage: 'Home'
  });

  await store.trackVisit({
    sessionId: 'session-1',
    page: 'Products',
    source: 'Search'
  });

  const summary = await store.getDashboardSummary();

  assert.equal(summary.totalVisits, 1);
  assert.equal(summary.topPage, 'Products');
  assert.ok(summary.entrySources.some((item) => item.source === 'Direct'));
  assert.ok(summary.visitsByPage.some((item) => item.page === 'Products'));
});

test('deduplicates rapid duplicate visits for the same page', async () => {
  const store = createAnalyticsStore();
  await store.initialize();

  await store.startSession({
    sessionId: 'session-2',
    userAgent: 'test-browser',
    entrySource: 'Direct',
    entryPage: 'Home'
  });

  await store.trackVisit({ sessionId: 'session-2', page: 'Pricing', source: 'Direct' });
  await store.trackVisit({ sessionId: 'session-2', page: 'Pricing', source: 'Direct' });

  const summary = await store.getDashboardSummary();
  assert.equal(summary.totalVisits, 1);
  assert.equal(summary.visitsByPage.find((item) => item.page === 'Pricing')?.count, 1);
});
