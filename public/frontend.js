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

// Attempt to reconnect after a delay if the WebSocket connection is closed
socket.addEventListener('close', () => {
    console.log('WebSocket connection closed, attempting to reconnect...');
    setTimeout(() => {
        // Re-establish connection
        socket = new WebSocket('ws://localhost:3000/ws');
        setupWebSocketListeners(socket); // Reapply event listeners after reconnection
    }, 5000); // Try to reconnect every 5 seconds
});

// Reapply WebSocket event listeners after reconnecting
function setupWebSocketListeners(socket) {
    socket.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'newPoll') {
            onNewPollAdded(data);
        } else if (data.type === 'voteUpdate') {
            onIncomingVote(data);
        }
    });
}

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

    // Highlight updated options
    const updatedOption = document.getElementById(`${data.pollId}_${data.updatedOptions[0].answer}`);
    updatedOption.classList.add('highlight');
    setTimeout(() => updatedOption.classList.remove('highlight'), 1000); // Remove highlight after 1 second
}

// Handles processing a user's vote when they click on an option to vote
function onVoteClicked(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    const pollId = formData.get("poll-id");
    const selectedOption = event.submitter.value;

    // Disable the buttons
    const pollForm = event.target;
    pollForm.querySelectorAll('button').forEach(button => button.disabled = true);

    // Show a loading message or spinner
    const loadingMessage = document.createElement('p');
    loadingMessage.textContent = "Submitting vote...";
    pollForm.appendChild(loadingMessage);

    // Send the vote to the server
    socket.send(JSON.stringify({
        type: 'vote',
        pollId: pollId,
        selectedOption: selectedOption,
    }));

    // Optionally, remove the loading message after a short delay (e.g., after the vote is processed)
    setTimeout(() => {
        loadingMessage.remove();
        const thankYouMessage = document.createElement('p');
        thankYouMessage.textContent = "Thank you for voting!";
        pollForm.appendChild(thankYouMessage);
    }, 1500);
}

// Add event listeners to existing polls
document.querySelectorAll('.poll-form').forEach((pollForm) => {
    pollForm.addEventListener('submit', onVoteClicked);
});