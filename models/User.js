const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const MONGO_URI = 'mongodb://localhost:27017/keyin_test'; // Same MongoDB URI

// Function to create a user
async function createUser(username, password) {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db();
        const usersCollection = db.collection('users');

        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = {
            username: username,
            password: hashedPassword,
        };

        const result = await usersCollection.insertOne(user);
        return result.insertedId; // Return the user ID
    } finally {
        await client.close();
    }
}

// Function to find a user by username
async function findUserByUsername(username) {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db();
        const usersCollection = db.collection('users');

        const user = await usersCollection.findOne({ username: username });
        return user;
    } finally {
        await client.close();
    }
}

// Function to compare passwords
async function comparePassword(inputPassword, storedPassword) {
    return await bcrypt.compare(inputPassword, storedPassword);
}

module.exports = { createUser, findUserByUsername, comparePassword };