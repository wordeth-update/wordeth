/**
 * Advertising API Tests
 */

require('./setup');
const request = require('supertest');
const app = require('../server');

describe('Advertising API', () => {
  describe('GET /api/ads/inventory', () => {
    test('should return ad inventory', async () => {
      const response = await request(app)
        .get('/api/ads/inventory')
        .expect(200);

      expect(response.body).toHaveProperty('inVideo');
      expect(response.body).toHaveProperty('interstitial');
      expect(response.body).toHaveProperty('hero');
      expect(response.body).toHaveProperty('skyscraper');
    });

    test('should only return active ads', async () => {
      const response = await request(app)
        .get('/api/ads/inventory')
        .expect(200);

      // Check that all ads are active
      Object.values(response.body).flat().forEach(adType => {
        if (Array.isArray(adType)) {
          adType.forEach(ad => {
            expect(ad.active).toBe(true);
          });
        }
      });
    });
  });

  describe('POST /api/ads/contextual', () => {
    test('should return contextual ads based on search', async () => {
      const response = await request(app)
        .post('/api/ads/contextual')
        .send({
          searchTerm: 'ice cream song',
          songData: {
            title: 'Ice Cream Song',
            artist: 'Test Artist'
          }
        })
        .expect(200);

      expect(response.body).toHaveProperty('ads');
      expect(response.body).toHaveProperty('targets');
      expect(Array.isArray(response.body.ads)).toBe(true);
    });
  });

  describe('POST /api/ads/impression', () => {
    test('should track ad impression', async () => {
      const response = await request(app)
        .post('/api/ads/impression')
        .send({
          adId: 'ice_cream_1',
          adType: 'in_video',
          target: 'song_search',
          timestamp: new Date().toISOString()
        })
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/ads/click', () => {
    test('should track ad click', async () => {
      const response = await request(app)
        .post('/api/ads/click')
        .send({
          adId: 'ice_cream_1',
          adType: 'in_video',
          target: 'song_search',
          timestamp: new Date().toISOString()
        })
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/ads/analytics', () => {
    test('should return analytics data', async () => {
      const response = await request(app)
        .get('/api/ads/analytics')
        .expect(200);

      expect(response.body).toHaveProperty('totalImpressions');
      expect(response.body).toHaveProperty('totalClicks');
      expect(response.body).toHaveProperty('totalPageViews');
      expect(response.body).toHaveProperty('ctr');
      expect(response.body).toHaveProperty('adPerformance');
    });
  });
});

