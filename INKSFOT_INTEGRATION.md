# 🛍️ Inksoft API Integration Guide

## Overview
This guide covers the complete Inksoft API integration for Wordeth's merchandise functionality, providing a scalable solution for custom lyrics merchandise.

## 🚀 **Why Inksoft for Wordeth?**

### **Advantages:**
- ✅ **Full Font Support:** 1000+ fonts including Google Fonts and custom uploads
- ✅ **Advanced Design Tools:** Professional design editor with drag-and-drop
- ✅ **Scalable Infrastructure:** Handles growing user base efficiently
- ✅ **White-label Solution:** Seamless brand integration
- ✅ **Automated Fulfillment:** Complete order processing pipeline
- ✅ **Quality Assurance:** Professional printing and quality control

### **Cost Structure:**
- **Monthly Fee:** $50-200/month (depending on plan)
- **Per-Order Fee:** $2-5 per order
- **Setup Fee:** $0-500 (one-time)

## 📋 **Setup Requirements**

### **1. Environment Variables**
Add these to your `.env` file:
```bash
INKSFOT_API_KEY=your_api_key_here
INKSFOT_COMPANY_ID=your_company_id_here
INKSFOT_API_URL=https://api.inksoft.com/v1
```

### **2. API Credentials**
1. **Sign up** for Inksoft account
2. **Generate API key** in your dashboard
3. **Get Company ID** from account settings
4. **Test API connection** using health check endpoint

### **3. Dependencies**
```bash
npm install axios
```

## 🔧 **API Endpoints**

### **Products**
```javascript
// Get all products
GET /api/merch/products

// Get products by category
GET /api/merch/products?category=tshirts&limit=20

// Get product variants
GET /api/merch/products/:productId
```

### **Designs**
```javascript
// Create custom design with lyrics
POST /api/merch/designs
{
  "productId": "product_id",
  "lyrics": "Your favorite lyrics here...",
  "options": {
    "font": "Arial",
    "fontSize": 24,
    "color": "#000000",
    "position": { "x": 50, "y": 50 }
  }
}

// Generate preview
GET /api/merch/designs/:designId/preview
```

### **Orders**
```javascript
// Create order
POST /api/merch/orders
{
  "designId": "design_id",
  "productId": "product_id",
  "quantity": 1,
  "customerInfo": {
    "name": "John Doe",
    "email": "john@example.com"
  },
  "shippingInfo": {
    "address": "123 Main St",
    "city": "City",
    "state": "State",
    "zipCode": "12345",
    "country": "US"
  }
}

// Get order status
GET /api/merch/orders/:orderId
```

### **Utilities**
```javascript
// Get available fonts
GET /api/merch/fonts

// Calculate shipping
POST /api/merch/shipping/calculate

// Health check
GET /api/merch/health
```

## 🎨 **Design Features**

### **Font Management**
- **1000+ Fonts Available:** Including Google Fonts
- **Custom Font Upload:** Support for brand fonts
- **Font Categories:** Serif, Sans-serif, Script, Display
- **Commercial Licensing:** Automatic license handling

### **Text Customization**
- **Position Control:** Drag-and-drop text positioning
- **Size Scaling:** Dynamic font sizing
- **Color Options:** Full color palette support
- **Text Effects:** Shadows, outlines, gradients

### **Product Support**
- **T-Shirts:** Cotton, polyester, premium blends
- **Hoodies:** Pullover, zip-up styles
- **Hats:** Baseball caps, beanies, snapbacks
- **Accessories:** Bags, stickers, phone cases

## 📊 **Performance Optimization**

### **Caching Strategy**
```javascript
// Product cache (30 minutes)
this.productCache = new Map();
this.cacheExpiry = 30 * 60 * 1000;

// Font cache (24 hours)
this.fontCache = new Map();
this.fontCacheExpiry = 24 * 60 * 60 * 1000;
```

### **Rate Limiting**
- **API Limits:** 1000 requests/hour
- **Burst Protection:** 100 requests/minute
- **Retry Logic:** Exponential backoff

### **Error Handling**
```javascript
try {
    const response = await this.client.get('/products');
    return response.data;
} catch (error) {
    console.error('Inksoft API Error:', error);
    throw new Error('Failed to fetch products');
}
```

## 🔄 **Workflow Integration**

### **1. User Journey**
```
User searches lyrics → Selects product → Customizes design → Places order → Receives confirmation
```

### **2. Technical Flow**
```
Frontend → InksoftService → Inksoft API → Order Processing → Fulfillment
```

### **3. Data Flow**
```
Lyrics → Design Creation → Preview Generation → Order Placement → Status Tracking
```

## 🛡️ **Security Considerations**

### **API Security**
- **Bearer Token Authentication**
- **HTTPS Only**
- **Rate Limiting**
- **Input Validation**

### **Data Protection**
- **PII Encryption**
- **Secure Order Storage**
- **Audit Logging**

## 📈 **Scaling Strategy**

### **Phase 1: MVP (0-1000 users)**
- Basic product catalog
- Simple design tool
- Manual order processing

### **Phase 2: Growth (1000-10000 users)**
- Advanced design features
- Automated fulfillment
- Order tracking

### **Phase 3: Scale (10000+ users)**
- Custom integrations
- Advanced analytics
- Multi-region support

## 🧪 **Testing**

### **API Testing**
```bash
# Test health endpoint
curl http://localhost:3000/api/merch/health

# Test product loading
curl http://localhost:3000/api/merch/products

# Test design creation (requires auth)
curl -X POST http://localhost:3000/api/merch/designs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"productId":"test","lyrics":"Test lyrics"}'
```

### **Frontend Testing**
```javascript
// Test product selection
const designer = new MerchDesigner();
await designer.loadProducts();

// Test design creation
const design = await designer.createDesign(productId, lyrics, options);
```

## 🚨 **Troubleshooting**

### **Common Issues**

1. **API Connection Failed**
   - Check API key validity
   - Verify network connectivity
   - Check rate limits

2. **Design Creation Failed**
   - Validate input parameters
   - Check font availability
   - Verify product ID

3. **Order Processing Failed**
   - Validate customer information
   - Check shipping address
   - Verify payment method

### **Debug Mode**
```javascript
// Enable debug logging
process.env.DEBUG = 'inksoft:*';
```

## 📞 **Support Resources**

- **Inksoft API Documentation:** https://api.inksoft.com/docs
- **Developer Support:** support@inksoft.com
- **Community Forum:** https://community.inksoft.com

## 🎯 **Next Steps**

1. **Set up Inksoft account** and get API credentials
2. **Configure environment variables** in your `.env` file
3. **Test API connection** using health check
4. **Implement frontend integration** with the provided service
5. **Deploy and monitor** performance metrics

---

**Ready to launch your custom lyrics merchandise platform! 🚀**

