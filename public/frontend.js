// Establish a WebSocket connection to the server
const socket = new WebSocket('ws://localhost:3000/ws');

// Listen for messages from the server
socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'newPoll') {
        onNewPollAdded(data);
    } else if (data.type === 'voteUpdate') {
        onIncomingVote(data);
    }
});

// Handles adding a new poll to the page when one is received from the server
function onNewPollAdded(data) {
    const pollContainer = document.getElementById('polls');
    const newPoll = document.createElement('li');
    newPoll.classList.add('poll-container');
    newPoll.id = data.poll._id;

    newPoll.innerHTML = `
        <h2>${data.poll.question}</h2>
        <ul class="poll-options">
            ${data.poll.options.map(option => `
                <li id="${data.poll._id}_${option.answer}">
                    <strong>${option.answer}:</strong> ${option.votes} votes
                </li>`).join('')}
        </ul>
        <form class="poll-form button-container">
            ${data.poll.options.map(option => `
                <button class="action-button vote-button" type="submit" value="${option.answer}" name="poll-option">
                    Vote for ${option.answer}
                </button>`).join('')}
            <input type="text" style="display: none;" value="${data.poll._id}" name="poll-id"/>
        </form>
    `;
    pollContainer.appendChild(newPoll);

    // Add event listeners for voting
    newPoll.querySelectorAll('.poll-form').forEach((pollForm) => {
        pollForm.addEventListener('submit', onVoteClicked);
    });
}

// Handles updating the number of votes an option has when a new vote is received
function onIncomingVote(data) {
    const poll = document.getElementById(data.pollId);
    const optionsList = poll.querySelector('.poll-options');
    optionsList.innerHTML = data.updatedOptions.map(option => `
        <li id="${data.pollId}_${option.answer}">
            <strong>${option.answer}:</strong> ${option.votes} votes
        </li>`).join('');
}

// Handles processing a user's vote when they click on an option to vote
function onVoteClicked(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    const pollId = formData.get("poll-id");
    const selectedOption = event.submitter.value;

    // Send the vote to the server
    socket.send(JSON.stringify({
        type: 'vote',
        pollId: pollId,
        selectedOption: selectedOption,
    }));
}

// Add event listeners to existing polls
document.querySelectorAll('.poll-form').forEach((pollForm) => {
    pollForm.addEventListener('submit', onVoteClicked);
});
