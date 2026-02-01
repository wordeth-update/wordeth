require('dotenv').config();
const mongoose = require('mongoose');

console.log('🗄️  Testing MongoDB Atlas Connection...\n');

const MONGODB_URI_PROD = process.env.MONGODB_URI_PROD;

if (!MONGODB_URI_PROD) {
    console.log('❌ MONGODB_URI_PROD not found in environment variables');
    process.exit(1);
}

console.log('✅ MongoDB connection string found');
console.log(`Connection: ${MONGODB_URI_PROD.substring(0, 50)}...`);

// Test the connection
async function testMongoDB() {
    try {
        console.log('\n🔌 Connecting to MongoDB Atlas...');
        
        await mongoose.connect(MONGODB_URI_PROD, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('✅ Successfully connected to MongoDB Atlas!');
        
        // Test creating a collection
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        console.log(`📊 Found ${collections.length} collections in database`);
        
        // Test creating a simple document
        const testCollection = db.collection('test_connection');
        await testCollection.insertOne({
            test: true,
            timestamp: new Date(),
            message: 'MongoDB connection test successful'
        });
        
        console.log('✅ Successfully created test document');
        
        // Clean up test document
        await testCollection.deleteOne({ test: true });
        console.log('✅ Successfully cleaned up test document');
        
        console.log('\n🎉 MongoDB Atlas is working perfectly!');
        console.log('📝 Your database is ready for user accounts, search history, and more!');
        
    } catch (error) {
        console.log('❌ Error connecting to MongoDB Atlas:');
        console.log(error.message);
        
        if (error.message.includes('authentication')) {
            console.log('\n💡 Possible issues:');
            console.log('- Check your database username and password');
            console.log('- Make sure the user has read/write permissions');
        } else if (error.message.includes('ECONNREFUSED')) {
            console.log('\n💡 Possible issues:');
            console.log('- Check your network access settings');
            console.log('- Make sure you added 0.0.0.0/0 to IP whitelist');
        }
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB Atlas');
    }
}

testMongoDB();
