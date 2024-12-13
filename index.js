const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const Poll = require('./models/Poll');  // Poll model import
const User = require('./models/User');  // User model import

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

    // Check if the username is already taken
    const existingUser = await User.findOne({ username });
    if (existingUser) {
        return response.render('signup', { errorMessage: 'Username is already taken' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    // Set session data
    request.session.user = { id: newUser._id, username: newUser.username };

    // Redirect to the dashboard
    return response.redirect('/dashboard');
});

// GET route for login page
app.get('/login', async (request, response) => {
    if (request.session.user?.id) {
        return response.redirect('/dashboard');
    }
    return response.render('login', { errorMessage: null });
});

// POST route for login
app.post('/login', async (request, response) => {
    const { username, password } = request.body;
    const user = await User.findOne({ username });

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

    // Include successMessage and errorMessage even if they are null
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

    // Create the success or error message
    const successMessage = pollCreationError ? null : 'Poll created successfully!';
    const errorMessage = pollCreationError || null;

    // Send both successMessage and errorMessage to the view
    return response.render('createPoll', { 
        errorMessage: errorMessage,
        successMessage: successMessage
    });
});

// Route to handle voting on polls
app.post('/votePoll', async (request, response) => {
    const { selectedOption, pollId } = request.body;

    console.log('Received pollId:', pollId);  // Log the poll ID
    console.log('Received selectedOption:', selectedOption);  // Log the selected option

    try {
        // Find the poll by ID
        const poll = await Poll.findById(pollId);
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
        await poll.save();

        // Redirect back to the dashboard (or wherever you want)
        response.redirect('/dashboard');
    } catch (error) {
        console.error('Error voting on poll:', error);
        response.status(500).send('Internal Server Error');
    }
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
        
        // Return null if no errors
        return null;
    } catch (error) {
        console.error(error);
        return "Error creating the poll, please try again";
    }
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

// View All Polls route
app.get('/viewPolls', async (request, response) => {
    if (!request.session.user?.id) {
        return response.redirect('/');
    }

    // Fetch all polls from MongoDB
    const polls = await Poll.find({});
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


mongoose.connect(MONGO_URI)
    .then(() => app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`)))
    .catch((err) => console.error('MongoDB connection error:', err));