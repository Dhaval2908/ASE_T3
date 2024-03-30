const mqtt = require('mqtt');
const sqlite3 = require('sqlite3').verbose();

// MQTT broker URL
const brokerUrl = 'mqtt://3.96.64.144:1883';

// Create an MQTT client
const client = mqtt.connect(brokerUrl);

// SQLite database
const db = new sqlite3.Database('../database.db');

// Create a table to store MQTT data
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS Sensordata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        heartsensor TEXT,
        bp TEXT,
        chol TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES user(id)
    );`);
});


let values = {}; // Object to store the latest values for each topic
let messageId = 0; // Unique id for each row

// Subscribe to topics
client.on('connect', () => {
    console.log('Connected to MQTT broker');
    client.subscribe('heartsensor');
    client.subscribe('bp');
    client.subscribe('chol');
});

// Handle incoming messages
client.on('message', (topic, message) => {
    
    values[topic] = message.toString(); // Store the latest value for the topic
    
    if (Object.keys(values).length === 3) { // Check if all three values are received
        // Insert the values into the SQLite table
        console.log("badhu baarbar che ahiya")
        db.run('INSERT INTO Sensordata (heartsensor, bp, chol, timestamp) VALUES (?, ?, ?, DATETIME("now"))',
        [values['heartsensor'], values['bp'], values['chol']], (err) => {
            if (err) {
                console.error(`Error inserting data: ${err.message}`);
            } else {
                console.log('Data inserted successfully');
            }
        });


        // Reset the values object for the next row
        values = {};
    }
});

module.exports = client;
