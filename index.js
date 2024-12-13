const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const Poll = require('./models/Poll');  // Added Poll model import
const User = require('./models/User');  // Added User model import

const PORT = 3000;
const MONGO_URI = 'mongodb://localhost:27017/keyin_test';
const app = express();
expressWs(app);

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

// WebSocket connection
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

    // Remove the client from connected clients on disconnect
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

app.get('/signup', async (request, response) => {
    if (request.session.user?.id) {
        return response.redirect('/dashboard');
    }
    return response.render('signup', { errorMessage: null });
});

// POST route for signup
app.post('/signup', async (request, response) => {
    const { username, password } = request.body;

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
        return response.render('signup', { errorMessage: 'Username already taken.' });
    }

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
        username,
        password: hashedPassword,
    });

    try {
        await newUser.save();
        request.session.user = { id: newUser._id, username: newUser.username };
        return response.redirect('/dashboard');
    } catch (error) {
        console.error('Error signing up:', error);
        return response.render('signup', { errorMessage: 'There was an error creating your account.' });
    }
});

app.get('/dashboard', async (request, response) => {
    if (!request.session.user?.id) {
        return response.redirect('/');
    }
    // Fetch all active polls from MongoDB
    const polls = await Poll.find({});
    return response.render('index/authenticatedIndex', { polls });
});

app.get('/createPoll', async (request, response) => {
    if (!request.session.user?.id) {
        return response.redirect('/');
    }
    return response.render('createPoll');
});

// Poll creation
app.post('/createPoll', async (request, response) => {
    const { question, options } = request.body;
    const formattedOptions = Object.values(options).map(option => ({ answer: option, votes: 0 }));

    const pollCreationError = await onCreateNewPoll(question, formattedOptions);
    if (pollCreationError) {
        return response.render('createPoll', { errorMessage: pollCreationError });
    }
    return response.redirect('/dashboard');
});

// Poll creation function
async function onCreateNewPoll(question, pollOptions) {
    try {
        const newPoll = new Poll({ question, options: pollOptions });
        await newPoll.save();

        // Broadcast the new poll to all connected clients
        connectedClients.forEach(client => {
            client.send(JSON.stringify({
                type: 'newPoll',
                poll: newPoll,
            }));
        });
    } catch (error) {
        console.error(error);
        return "Error creating the poll, please try again";
    }
    return null;
}

// Handle vote updates and broadcasting
async function onNewVote(pollId, selectedOption) {
    try {
        const poll = await Poll.findById(pollId);
        const option = poll.options.find(opt => opt.answer === selectedOption);
        if (option) {
            option.votes += 1;
            await poll.save();

            // Broadcast updated votes to all connected clients
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

mongoose.connect(MONGO_URI)
    .then(() => app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`)))
    .catch((err) => console.error('MongoDB connection error:', err));