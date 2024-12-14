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
    
    // Update each option's vote count
    optionsList.innerHTML = '';  // Clear old options list
    data.updatedOptions.forEach(option => {
        const optionElement = document.createElement('li');
        optionElement.id = `${data.pollId}_${option.answer}`;
        optionElement.innerHTML = `<strong>${option.answer}:</strong> ${option.votes} votes`;
        optionsList.appendChild(optionElement);
    });
}

function onVoteClicked(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const pollId = formData.get("poll-id");
    const selectedOption = event.submitter.value;

    // Get the user ID from the session (this could be set when the user logs in)
    const userId = document.getElementById("user-id").value; // Assuming you're passing user ID via a hidden input

    // Send the vote via WebSocket
    socket.send(JSON.stringify({
        type: 'vote',
        pollId: pollId,
        selectedOption: selectedOption,
        userId: userId // Include user ID to identify who voted
    }));

    // Disable all voting buttons for this poll after the vote
    const form = event.target; // Get the form element that was submitted
    const buttons = form.querySelectorAll('button'); // Get all buttons in the form
    buttons.forEach(button => {
        button.disabled = true; // Disable each button
    });

    // Create and display the "Thanks for voting" message
    const pollContainer = form.closest('.poll-container');
    const message = document.createElement('p');
    message.textContent = 'Thanks for voting!';
    message.style.fontSize = '16px';
    message.style.color = '#4CAF50'; // Green color for the success message
    message.style.marginTop = '10px'; // Add some spacing for visual clarity
    pollContainer.appendChild(message);

    // Optionally, hide the buttons to avoid accidental clicks
    buttons.forEach(button => {
        button.style.display = 'none';
    });
}