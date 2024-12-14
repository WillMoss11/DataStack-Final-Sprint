const socket = new WebSocket('ws://localhost:3000/ws');

// Listen for WebSocket messages
socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'newPoll') {
        // Handle new poll added to the dashboard
        onNewPollAdded(data);
    } else if (data.type === 'voteUpdate') {
        // Handle vote updates to polls
        onIncomingVote(data);
    }
});

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
        <form class="poll-form">
            ${data.poll.options.map(option => `
                <button class="vote-button" type="submit" value="${option.answer}">Vote for ${option.answer}</button>`).join('')}
            <input type="hidden" name="poll-id" value="${data.poll._id}">
        </form>
    `;
    pollContainer.appendChild(newPoll);

    // Add event listeners for voting buttons
    newPoll.querySelectorAll('.poll-form').forEach((form) => {
        form.addEventListener('submit', onVoteClicked);
    });
}

function onIncomingVote(data) {
    const poll = document.getElementById(data.pollId);
    const optionsList = poll.querySelector('.poll-options');
    optionsList.innerHTML = data.updatedOptions.map(option => `
        <li id="${data.pollId}_${option.answer}">
            <strong>${option.answer}:</strong> ${option.votes} votes
        </li>`).join('');
}

function onVoteClicked(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    const pollId = formData.get("poll-id");
    const selectedOption = event.submitter.value;

    // Send the vote to the server via WebSocket
    socket.send(JSON.stringify({
        type: 'vote',
        pollId: pollId,
        selectedOption: selectedOption,
    }));

    // Disable all voting buttons for this poll after the vote
    const buttons = event.target.querySelectorAll('button');
    buttons.forEach(button => {
        button.disabled = true;
    });
}