const { MongoClient } = require('mongodb');
const MONGO_URI = 'mongodb://localhost:27017/keyin_test'; // Same MongoDB URI

// Function to create a poll
async function createPoll(question, options) {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db();
        const pollsCollection = db.collection('polls');

        // Create the poll document
        const poll = {
            question: question,
            options: options.map(option => ({ answer: option, votes: 0 })),
        };

        const result = await pollsCollection.insertOne(poll);
        return result.insertedId; // Return the poll ID
    } finally {
        await client.close();
    }
}

// Function to find a poll by ID
async function getPollById(pollId) {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db();
        const pollsCollection = db.collection('polls');

        const poll = await pollsCollection.findOne({ _id: new MongoClient.ObjectID(pollId) });
        return poll;
    } finally {
        await client.close();
    }
}

// Function to update votes for a poll
async function updatePollVotes(pollId, selectedOption) {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db();
        const pollsCollection = db.collection('polls');

        const poll = await pollsCollection.findOne({ _id: new MongoClient.ObjectID(pollId) });
        const option = poll.options.find(opt => opt.answer === selectedOption);

        if (option) {
            option.votes += 1;
            await pollsCollection.updateOne(
                { _id: new MongoClient.ObjectID(pollId) },
                { $set: { options: poll.options } }
            );
            return poll;
        } else {
            throw new Error('Option not found');
        }
    } finally {
        await client.close();
    }
}

module.exports = { createPoll, getPollById, updatePollVotes };
