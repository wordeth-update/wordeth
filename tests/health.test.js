/**
 * Health Check API Tests
 */

require('./setup');
const request = require('supertest');
const app = require('../server');

describe('Health Check Endpoint', () => {
  test('GET /api/health should return 200', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body).toHaveProperty('status');
    expect(response.body.status).toBe('OK');
    expect(response.body).toHaveProperty('timestamp');
  });
});

