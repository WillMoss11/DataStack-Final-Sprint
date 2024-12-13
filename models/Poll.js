const mongoose = require('mongoose');

const pollSchema = new mongoose.Schema({
    question: String,
    options: [
        {
            answer: String,
            votes: { type: Number, default: 0 },
        },
    ],
});

module.exports = mongoose.model('Poll', pollSchema);
