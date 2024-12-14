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

// Route to handle voting on polls
app.post('/votePoll', async (request, response) => {
    const { selectedOption, pollId } = request.body;

    console.log('Received pollId:', pollId);  
    console.log('Received selectedOption:', selectedOption);  

    try {
        // Find the poll by ID
        const poll = await pollsCollection.findOne({ _id: new ObjectId(pollId) });
        if (!poll) {
            return response.status(404).send('Poll not found');
        }

        // Find the selected option in the poll
        const option = poll.options.find(opt => opt.answer === selectedOption);
        if (!option) {
            return response.status(400).send('Option not found');
        }

        // Increment the vote count for the selected option
        option.votes += 1;
        await pollsCollection.updateOne({ _id: new ObjectId(pollId) }, { $set: { options: poll.options } });

        // Redirect back to the dashboard
        response.redirect('/dashboard');
    } catch (error) {
        console.error('Error voting on poll:', error);
        response.status(500).send('Internal Server Error');
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
async function onNewVote(pollId, selectedOption) {
    try {
        const poll = await pollsCollection.findOne({ _id: new ObjectId(pollId) });
        const option = poll.options.find(opt => opt.answer === selectedOption);
        if (option) {
            option.votes += 1;
            await pollsCollection.updateOne({ _id: new ObjectId(pollId) }, { $set: { options: poll.options } });

            connectedClients.forEach(client => {
                client.send(JSON.stringify({
                    type: 'voteUpdate',
                    pollId: pollId,
                    updatedOptions: poll.options,
                }));
            });
        }
    } catch (error) {
        console.error('Error updating poll:', error);
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