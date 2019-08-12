# Chatty!

Chatty is a twitch.tv bot that monitors chat, collects statistics, and encourages people to chat it up.

## How does it work?

For each line of text that is entered a user earns 1 point. Multipliers are given to followers, VIPS, and Subscribers.

Leaderboards are available for daily activity, all time activity, and awards are earned over time.

## Installation

Requires Node.JS, tmi.js module, and SQLite3 module.

Copy config-example.json to config.json and update with your username, auth token, and channel name.

To run:

```node bot.js```

## Usage

The following commands are avaible via chat:

    !stats - Your chat stastics.
    !top - Top chatters for current session.

    !aq The Quote. @Username - Add a quote for chatter.
    !dq # - Delete a quote using ID.
    !quote - Display a random quote.