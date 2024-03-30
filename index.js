const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const mqtt = require('./mqttClient.js');
const { PythonShell } = require('python-shell');
const path = require('path');
const { spawn } = require('child_process');
const cron = require('node-cron');
const { get } = require('http');



const app = express();
const db = new sqlite3.Database('../database.db');

db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS u_r (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, password TEXT NOT NULL,age INTEGER, gender TEXT)');
});
db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT, message TEXT, triggered INTEGER DEFAULT 0)');
});


app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: false }));
app.use((req, res, next) => {
    res.locals.userId = req.session.userId;
    next();
});

app.get('/signup', (req, res) => {
    res.render('signup', { error: null });
});

app.post('/signup', async (req, res) => {
    try {
        const { email, password, age, gender } = req.body;

        // Check if the email already exists in the database
        db.get('SELECT * FROM u_r WHERE email = ?', [email], async (err, row) => {
            if (err) {
                console.error(err);
                return res.status(500).send('An error occurred while checking email existence');
            }
            if (row) {
                return res.render('signup', { error: 'Email already exists' }); // Email already exists, render signup page with error message
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            db.run('INSERT INTO u_r (email, password, age, gender) VALUES (?, ?, ?, ?)', [email, hashedPassword, age, gender]);
            res.redirect('/login');
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while signing up');
    }
});


app.get('/login', (req, res) => {
    res.render('login', { error: null }); // Pass the error variable with a default value of null
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM u_r WHERE email = ?', [email], async (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).send('An error occurred');
        }
        if (!row) {
            return res.render('login', { error: 'Invalid email or password' }); // Pass the error message
        }
        const validPassword = await bcrypt.compare(password, row.password);
        if (!validPassword) {
            return res.render('login', { error: 'Invalid email or password' }); // Pass the error message
        }
        req.session.userId = row.id;
        res.cookie('loggedIn', 'true', { maxAge: 30 * 60 * 1000 });
        res.redirect('/dashboard');
    });
});



function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/login');
}

app.use((req, res, next) => {
    if (req.session && req.session.userId) {
        db.get('SELECT email FROM u_r WHERE id = ?', [req.session.userId], (err, row) => {
            if (err) {
                console.error(err);
                return next(err);
            }
            if (!row) {
                // console.log('User not found');
                res.locals.email = null; // Set email to null if user not found
            } else {
                // console.log(row);
                res.locals.email = row.email;
            }
            next();
        });
    } else {
        console.log('No user session');
        res.locals.email = null; // Set email to null if no user session
        next();
    }
});

app.get('/dashboard', requireAuth, (req, res) => {
    // Query the SQLite database for the latest data from each sensor
   
        res.render('dashboard');
    
});


app.get('/dashboard-data', requireAuth, (req, res) => {
    // Query the SQLite database for the user's age and gender
    db.get('SELECT age, gender FROM u_r WHERE id = ?', [req.session.userId], (err, userRow) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'An error occurred while fetching user data' });
        }

        // Query the SQLite database for the latest data from each sensor
        db.get('SELECT * FROM Sensordata ORDER BY id DESC LIMIT 1', (err, row) => {
            if (err) {
                console.error(err);
                return res.status(500).send('An error occurred');
            }
            // Prepare the data to send to the dashboard
            const data = {
                heartsensor: null,
                bp: null,
                chol: null
            };
            console.log(row)
            if (row) {
                data.heartsensor = row.heartsensor;
                data.bp = row.bp;
                data.chol = row.chol;
            }
            // Send the data to the dashboard 
        
            // Load the ML model
            const form_data = {
                age: userRow.age,
                trestbps: data.bp, // Sample value, replace with actual value from the form
                chol: data.chol, // Sample value, replace with actual value from the form
                thalch: data.heartsensor, // Sample value, replace with actual value from the form
                sex: userRow.gender,
                // oxygen_level: data.oxygensensor // Sample value, replace with actual value from the form
            };

            const pythonProcess = spawn('python', ['smartanalysis.py', JSON.stringify(form_data)]);
            console.log('Python process spawned');
            console.log(form_data)
            pythonProcess.stdout.on('data', (data) => {
                console.log('Received data from Python process');
                const predictions = JSON.parse(data);
                console.log('Prediction:', predictions);

                // Check if the alert prediction is false
                if (predictions.alert_prediction === 'False') {
                    // Send a response indicating the need to consult a doctor
                    console.log("hii iam here")
                    res.status(200).json({ message: 'Something is wrong. Please consult a doctor.' });
                } else {
                    // Send a normal response with the data
                    res.status(200).json(data);
                }
            });

           
        });

    });
});

app.get('/graph', (req, res) => {
    // Query the SQLite database for the latest heartbeat data
    db.all('SELECT * FROM Sensordata WHERE heartsensor IS NOT NULL ORDER BY timestamp DESC LIMIT 100', (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send('An error occurred while fetching data');
        }
        console.log(rows);
        // Render the 'index' template and pass the data for the chart
        res.render('graph', { rows });
    });
    
});
app.get('/profile', requireAuth, (req, res) => {
    db.get('SELECT email, age, gender FROM u_r WHERE id = ?', [req.session.userId], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).send('An error occurred while fetching user data');
        }
        if (!row) {
            return res.status(404).send('User not found');
        }
        res.render('profile', { email: row.email, age: row.age, gender: row.gender });
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('An error occurred');
        }
        res.clearCookie('loggedIn'); // Clear the login cookie
        res.redirect('/login');
    });
});

// Schedule to check alerts every minute
cron.schedule('* * * * *', () => {
    console.log("cron")
    const now = new Date().toISOString().substr(11, 5); // Get current time in HH:mm format
    console.log(now)
    db.all('SELECT * FROM alerts WHERE time = ? AND triggered = 0', [now], (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        rows.forEach(row => {
            // Send MQTT command
            client.publish('alert', row.message);
            // Mark alert as triggered
            db.run('UPDATE alerts SET triggered = 1 WHERE id = ?', [row.id]);
        });
    });
});

// Route to handle alert creation
app.post('/create-alert', (req, res) => {
    const { time, message } = req.body;
    console.log(time)
    db.run('INSERT INTO alerts (time, message) VALUES (?, ?)', [time, message], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('An error occurred');
        }
        res.redirect('/create-alert');
    });
});

app.get('/create-alert', (req, res) => {
    db.all('SELECT * FROM alerts', (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send('An error occurred while fetching alerts');
        }
        res.render('create-alert', { alerts: rows });
    });
});
app.post('/delete-alert/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM alerts WHERE id = ?', [id], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('An error occurred while deleting alert');
        }
        res.redirect('/create-alert');
    });
});


const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
