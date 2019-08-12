// ----------------------------------------------------------------------------
//
// Chatty v1.0 - The twitch.tv chat statistics bot
// Copyright (C) 2019 Chris Bartow <chris@codenut.io>
// All rights reserved
//
// This source file is licensed under the terms of the MIT license.
// See the LICENSE file to learn about this license.
//
// ----------------------------------------------------------------------------

// Import Configurations
const config = require('./config.json');

// Require SQLite Module
var sql = require("sqlite3").verbose();
var db = new sql.Database('db.sqlite');

// Initialize chatters table if it does not exist
db.serialize(function() {
    db.run(`CREATE TABLE IF NOT EXISTS chatters (
    id int, 
    session int,
    name varchar(32),
    lines int,
    xp int,
    words int,
    emotes int,
    PRIMARY KEY (id, session)
    )`, function(err) {
        if (err) throw err;
    });

    db.run(`CREATE TABLE IF NOT EXISTS quote (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        body text,
        name varchar(32)
        )`, function(err) {
        if (err) throw err;
    });
});

var session;
var VERBOSE = false;

// Require Twitch Messaging Service
const tmi = require('tmi.js');

// Create a chat client
const client = new tmi.client(config);

// Prompt for new session
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

db.get(`SELECT session FROM chatters ORDER BY session DESC LIMIT 1`, (err, row) => {
    if (err) throw (err);
    if (row) {
        session = row.session;
        rl.question('Do you want to start a new session? (y/N) ', (answer) => {

            if (answer.match(/^y(es)?$/i)) {
                session++;
                console.log(`A new session has been started!`);
            } else {
                console.log(`Existing session data is being used.`);
            }

            // Connect to Twitch
            client.connect();

        });
    } else {
        session = 1;
        // Connect to Twitch
        client.connect();
    }
});

rl.on('line', (input) => {
    if ((/^quit/i).test(input) || (/^exit/i).test(input)) {
        exitBot();
        return;
    }

    if ((/^stats/i).test(input)) {
        db.all(`SELECT * FROM chatters WHERE session = ? ORDER BY xp DESC LIMIT 5`, [session], (err, rows) => {
            if (err) throw (err);
            console.table(rows);
        });
        return;
    }

    // Switch verbose mode on/off
    if ((/^verbose/i).test(input)) {
        VERBOSE = !VERBOSE;
        return;
    }

    console.log('Command not found!');
});

rl.on('SIGINT', () => {
    exitBot();
});

function exitBot() {
    rl.question('Are you sure you want to close your bot? (Y/n) ', (answer) => {
        if (answer === "" || (/^y(es)?$/i).test(answer)) {
            rl.close();

            // Write out final cache data
            updateDBfromCache();

            process.exit();
        }
    });
    return;
}


// Register event handles for Twitch IRC Chat
client.on('message', onMessageHandler);
client.on('connected', onConnectedHandler);

// Create an array of chatters
var chatters = new Array();

// Called every time the bot connects to Twitch chat
function onConnectedHandler(addr, port) {
    console.log(`Connected to ${addr}:${port}`);
    var dbcache = setInterval(updateDBfromCache, 30000);
}

// Called every time a message comes in
function onMessageHandler(target, context, message, self) {
    // Ignore messages from the bot or private
    if (self || (/!^\#/).test(target)) { return; }

    // Set User ID
    const id = Number(context['user-id']);

    // console.log(context['emotes']);
    const msg = message.trim();

    if (context['emotes'])
        var emotes = Object.keys(context['emotes']).length;
    else
        var emotes = 0;

    // Give double XP to subscribers
    const xp = (context['subscriber']) ? 2 : 1;

    if (VERBOSE)
        console.log(`${target} C: ${msg.length} W: ${msg.split(' ').length} E: ${emotes} <${context['display-name']}> ${msg}`);

    if (/^!stats/i.test(msg)) {
        db.get(`SELECT name, SUM(xp) as xp, SUM(words) as words FROM chatters WHERE id = ? GROUP BY id`, id, (err, result) => {
            if (err) throw err;
            if (result) {
                client.say(target, `${result['name']} has earned ${result['xp']} xp saying ${result['words']} words.`);
            } else {
                client.say(target, `You haven't said anything yet today.`);
            }
        });
        return;
    }

    // !top show top chatters for today
    if (/^!top(?!all)/i.test(msg)) {
        db.all(`SELECT name, xp FROM chatters WHERE session = ? ORDER BY xp DESC LIMIT 10`, [session], (err, rows) => {
            if (err) throw err;
            client.say(target, "The most chatty people today are: " + rows.map(chatter => `${chatter.name} (${chatter.xp})`).join(', '));
        });
        return;
    }

    // !topall show top chatters for alltime
    if (/^!topall/i.test(msg)) {
        db.all(`SELECT name, SUM(xp) as xp, SUM(words) as words FROM chatters GROUP BY id ORDER BY xp DESC LIMIT 10`, [], (err, rows) => {
            if (err) throw err;
            client.say(target, "The most chatty people all time are: " + rows.map(chatter => `${chatter.name} (${chatter.xp})`).join(', '));
        });
        return;
    }

    // !aq Add Quote
    if (/^!aq/i.test(msg)) {
        let result = msg.match(/^!aq (.*)\@(.*)$/i);
        if (result[1] && result[2]) {
            db.run(`INSERT INTO quote (body, name) VALUES (?, ?)`, [result[1].trim(), result[2].trim()], function(err) {
                if (err) throw (err);
                console.log(`A new quote has been added! (#${this.lastID})`);
            });
        }
        return;
    }

    // !dq Add Quote
    if (/^!dq/i.test(msg)) {
        let result = msg.match(/^!dq ([0-9]+)/i);
        let id = parseInt(result[1]);

        if (id) {
            db.get(`DELETE FROM quote WHERE id = ?`, id, (err, result) => {
                if (err) throw err;
                client.say(target, `Quote #${id} has been deleted.`);
            });
        }
        return;
    }

    // !quote Display a quote from the database.
    if (/^!quote/i.test(msg)) {
        db.get(`SELECT * FROM quote ORDER BY RANDOM() LIMIT 1`, [], (err, result) => {
            if (err) throw err;
            if (result) {
                client.say(target, `"${result.body}" @${result.name} (#${result.id})`);
            } else {
                client.say(target, `I can't find any quotes in the database. Try adding some with !aq.`);
            }
        });
        return;
    }

    // Check to see if in local cache

    var chatterUpdate = {
        "id": id,
        "name": context['display-name']
    }

    const chatterIdx = chatters.findIndex(x => x.id === id);

    if (chatterIdx !== -1) {
        // Cache Available. Let's update it.
        Object.assign(chatterUpdate, {
            "lines": chatters[chatterIdx].lines + 1,
            "xp": chatters[chatterIdx].xp + xp,
            "words": chatters[chatterIdx].words + msg.split(' ').length,
            "emotes": chatters[chatterIdx].emotes + emotes,
            "update": true
        });
        chatters[chatterIdx] = chatterUpdate;

    } else {

        // No Cache'd chatter found
        db.get(`SELECT * FROM chatters WHERE id = ? AND session = ?`, [id, session], (err, result) => {

            if (err) throw err;

            if (result) {
                // Update chatter cache from database values
                Object.assign(chatterUpdate, {
                    "lines": result.lines + 1,
                    "xp": result.xp + xp,
                    "words": result.words + msg.split(' ').length,
                    "emotes": result.emotes + emotes,
                    "update": true
                });

            } else {
                // Create new record for chatter for this session
                Object.assign(chatterUpdate, {
                    "lines": 1,
                    "xp": xp,
                    "words": msg.split(' ').length,
                    "emotes": emotes,
                    "update": true
                });

            }
            // Add data to the player cache
            chatters.push(chatterUpdate);

        });

    }

}

function updateDBfromCache() {
    var stmt = db.prepare(
        `REPLACE INTO chatters (id, session, name, lines, xp, words, emotes) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    chatters.forEach(function(data, index) {
        if (data.update) {
            // Replace data into database
            stmt.run(data.id, session, data.name, data.lines, data.xp, data.words, data.emotes);
            // Reset Update Flag for this chatter   
            chatters[index].update = false;
        }
    });
    stmt.finalize();
}