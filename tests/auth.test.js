/**
 * Authentication API Tests
 */

require('./setup');
const request = require('supertest');
const app = require('../server');

describe('Authentication API', () => {
  let authToken;
  let testUser = {
    name: 'Test User',
    email: `test${Date.now()}@example.com`,
    password: 'password123'
  };

  // Skip DB-dependent tests if MongoDB is not available
  const skipDBTests = process.env.SKIP_DB_TESTS === 'true' || !process.env.MONGODB_URI_PROD;

  describe('POST /api/auth/signup', () => {
    test('should register a new user successfully', async () => {
      if (skipDBTests) {
        console.log('⏭️  Skipping DB-dependent test - MongoDB not available');
        return;
      }
      const response = await request(app)
        .post('/api/auth/signup')
        .send(testUser)
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.name).toBe(testUser.name);
      expect(response.body.user).not.toHaveProperty('password');

      authToken = response.body.token;
    });

    test('should reject duplicate email', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send(testUser)
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    test('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Test',
          email: 'invalid-email',
          password: 'password123'
        })
        .expect(400);
    });

    test('should reject short password', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Test',
          email: 'test2@example.com',
          password: '12345'
        })
        .expect(400);
    });
  });

  describe('POST /api/auth/signin', () => {
    test('should login with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/signin')
        .send({
          email: testUser.email,
          password: testUser.password
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
    });

    test('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/signin')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        })
        .expect(401);
    });

    test('should reject wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/signin')
        .send({
          email: testUser.email,
          password: 'wrongpassword'
        })
        .expect(401);
    });
  });

  describe('GET /api/auth/verify', () => {
    test('should verify valid token', async () => {
      // First, get a token by signing up
      const signupResponse = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Verify Test',
          email: `verify${Date.now()}@example.com`,
          password: 'password123'
        });

      const token = signupResponse.body.token;

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
    });

    test('should reject missing token', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    test('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});

