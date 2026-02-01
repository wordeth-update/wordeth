/**
 * Articles API Tests
 */

require('./setup');
const request = require('supertest');
const app = require('../server');

describe('Articles API', () => {
  describe('GET /api/articles/featured', () => {
    test('should return featured articles', async () => {
      const response = await request(app)
        .get('/api/articles/featured')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('articles');
      expect(Array.isArray(response.body.articles)).toBe(true);
      expect(response.body.articles.length).toBeGreaterThan(0);
    });

    test('featured articles should have required fields', async () => {
      const response = await request(app)
        .get('/api/articles/featured')
        .expect(200);

      const article = response.body.articles[0];
      expect(article).toHaveProperty('id');
      expect(article).toHaveProperty('title');
      expect(article).toHaveProperty('excerpt');
      expect(article).toHaveProperty('author');
      expect(article).toHaveProperty('category');
    });
  });

  describe('GET /api/articles', () => {
    test('should return all articles with pagination', async () => {
      const response = await request(app)
        .get('/api/articles?page=1&limit=5')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('articles');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination).toHaveProperty('currentPage');
      expect(response.body.pagination).toHaveProperty('totalPages');
    });

    test('should filter by category', async () => {
      const response = await request(app)
        .get('/api/articles?category=music')
        .expect(200);

      expect(response.body.success).toBe(true);
      if (response.body.articles.length > 0) {
        response.body.articles.forEach(article => {
          expect(article.category).toBe('music');
        });
      }
    });
  });

  describe('GET /api/articles/:id', () => {
    test('should return a single article', async () => {
      const response = await request(app)
        .get('/api/articles/1')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('article');
      expect(response.body.article).toHaveProperty('id');
      expect(response.body.article.id).toBe('1');
    });

    test('should return 404 for non-existent article', async () => {
      const response = await request(app)
        .get('/api/articles/999')
        .expect(404);

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/articles/category/:category', () => {
    test('should return articles by category', async () => {
      const response = await request(app)
        .get('/api/articles/category/culture')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('articles');
      expect(response.body).toHaveProperty('category');
    });
  });

  describe('GET /api/articles/search/:query', () => {
    test('should search articles', async () => {
      const response = await request(app)
        .get('/api/articles/search/hip-hop')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('articles');
      expect(response.body).toHaveProperty('searchQuery');
    });
  });
});

