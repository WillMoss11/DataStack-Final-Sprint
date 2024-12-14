const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb'); // Import MongoClient and ObjectId
const session = require('express-session');
const bcrypt = require('bcrypt');

const PORT = 3000;
const MONGO_URI = 'mongodb://localhost:27017/keyin_test';
const app = express();
expressWs(app);

app.use(express.static(path.join(__dirname, 'public')));
console.log('Serving static files from /public');

// Initialize MongoDB client
const client = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
let db, usersCollection, pollsCollection;

client.connect()
    .then(() => {
        db = client.db(); // Get the default database
        usersCollection = db.collection('users');
        pollsCollection = db.collection('polls');
    })
    .catch(err => console.error('MongoDB connection error:', err));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(session({
    secret: 'voting-app-secret',
    resave: false,
    saveUninitialized: false,
}));

let connectedClients = [];

// WebSocket connection for real-time updates
app.ws('/ws', (socket, request) => {
    connectedClients.push(socket);

    socket.on('message', async (message) => {
        const data = JSON.parse(message);

        // Handle vote submission
        if (data.type === 'vote') {
            const { pollId, selectedOption } = data;
            await onNewVote(pollId, selectedOption);
        }
    });

    socket.on('close', () => {
        connectedClients = connectedClients.filter(client => client !== socket);
    });
});

// Routes for the app
app.get('/', async (request, response) => {
    if (request.session.user?.id) {
        return response.redirect('/dashboard');
    }
    response.render('index/unauthenticatedIndex');
});

// Signup route
app.get('/signup', async (request, response) => {
    if (request.session.user?.id) {
        return response.redirect('/dashboard');
    }
    return response.render('signup', { errorMessage: null });
});

// POST route for signup
app.post('/signup', async (request, response) => {
    const { username, password } = request.body;

    // Check if the username is already taken
    const existingUser = await usersCollection.findOne({ username });
    if (existingUser) {
        return response.render('signup', { errorMessage: 'Username is already taken' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const newUser = {
        username,
        password: hashedPassword,
    };
    const result = await usersCollection.insertOne(newUser);

    // Set session data
    request.session.user = { id: result.insertedId, username };

    // Redirect to the dashboard
    return response.redirect('/dashboard');
});

// Login route
app.get('/login', async (request, response) => {
    if (request.session.user?.id) {
        return response.redirect('/dashboard');
    }
    return response.render('login', { errorMessage: null });
});

// POST route for login
app.post('/login', async (request, response) => {
    const { username, password } = request.body;
    const user = await usersCollection.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return response.render('login', { errorMessage: 'Invalid username or password' });
    }

    // Set session data
    request.session.user = { id: user._id, username: user.username };

    return response.redirect('/dashboard');
});

// Dashboard route
app.get('/dashboard', async (req, res) => {
    if (!req.session.user?.id) {
        return res.redirect('/'); // If no user is logged in, redirect to login
    }

    return res.render('dashboard', {
        user: req.session.user, // You can access the session data in your EJS
    });
});

// Create Poll route
app.get('/createPoll', async (request, response) => {
    if (!request.session.user?.id) {
        return response.redirect('/');
    }

    return response.render('createPoll', { 
        successMessage: null,
        errorMessage: null 
    });
});

// Poll creation route
app.post('/createPoll', async (request, response) => {
    const { question, options } = request.body;
    const formattedOptions = Object.values(options).map(option => ({ answer: option, votes: 0 }));

    const pollCreationError = await onCreateNewPoll(question, formattedOptions);

    const successMessage = pollCreationError ? null : 'Poll created successfully!';
    const errorMessage = pollCreationError || null;

    return response.render('createPoll', { 
        errorMessage: errorMessage,
        successMessage: successMessage
    });
});

// Backend (Express route for voting)
app.post('/votePoll', async (req, res) => {
    const { pollId, selectedOption } = req.body;

    try {
        const poll = await pollsCollection.findOne({ _id: new ObjectId(pollId) });
        const option = poll.options.find(opt => opt.answer === selectedOption);
        if (option) {
            option.votes += 1;
            await pollsCollection.updateOne({ _id: new ObjectId(pollId) }, { $set: { options: poll.options } });

            // Broadcast updated poll to all connected WebSocket clients
            connectedClients.forEach(client => {
                client.send(JSON.stringify({
                    type: 'voteUpdate',
                    pollId: pollId,
                    updatedOptions: poll.options,
                }));
            });

            // Instead of returning JSON, we render the updated poll (or send a success page)
            res.redirect('/viewPolls');  // Redirect to a page with updated data, like viewPolls
        } else {
            throw new Error('Option not found');
        }
    } catch (err) {
        console.error(err);
        res.redirect('/viewPolls'); // Handle error, still redirect to viewPolls
    }
});

// Poll creation function
async function onCreateNewPoll(question, pollOptions) {
    try {
        const newPoll = {
            question,
            options: pollOptions,
        };
        const result = await pollsCollection.insertOne(newPoll);

        connectedClients.forEach(client => {
            client.send(JSON.stringify({
                type: 'newPoll',
                poll: newPoll,
            }));
        });

        return null;
    } catch (error) {
        console.error(error);
        return "Error creating the poll, please try again";
    }
}

// Handle vote updates and broadcasting
async function onNewVote(pollId, selectedOption, userId) {
    try {
        // Fetch the poll from the database
        const poll = await pollsCollection.findOne({ _id: new ObjectId(pollId) });

        // Ensure the poll exists
        if (!poll) {
            throw new Error('Poll not found');
        }

        // Check if the user has already voted
        if (poll.voters && poll.voters.includes(userId)) {
            throw new Error('User has already voted on this poll');
        }

        // Find the option that was voted for
        const option = poll.options.find(opt => opt.answer === selectedOption);
        if (!option) {
            throw new Error('Option not found');
        }

        // Increase the vote count for the selected option
        option.votes += 1;

        // Add the user to the voters array to prevent multiple votes
        poll.voters = poll.voters || [];
        poll.voters.push(userId);

        // Update the poll in the database
        await pollsCollection.updateOne(
            { _id: new ObjectId(pollId) },
            { $set: { options: poll.options, voters: poll.voters } }
        );

        // Broadcast the updated poll data to all connected clients
        connectedClients.forEach(client => {
            client.send(JSON.stringify({
                type: 'voteUpdate',
                pollId: pollId,
                updatedOptions: poll.options,
            }));
        });

    } catch (error) {
        console.error('Error processing vote:', error);
        // Handle error (e.g., user already voted)
    }
}

// View All Polls route
app.get('/viewPolls', async (request, response) => {
    if (!request.session.user?.id) {
        return response.redirect('/');
    }

    // Fetch all polls from MongoDB
    const polls = await pollsCollection.find({}).toArray();
    return response.render('viewPolls', { polls });
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect('/dashboard');
        }
        return res.redirect('/'); // Redirect to login page after logout
    });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));