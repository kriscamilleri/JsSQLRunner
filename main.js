const sql = require('mssql');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

function parseCredentialsFile() {
    const fileContent = fs.readFileSync('./credentials.json', 'utf8');
    return JSON.parse(fileContent);
}

function parseSqlFile(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');

    let cronSchedule = '';
    let email = '';
    let query = '';

    lines.forEach(line => {
        if (line.startsWith('-- CRON:')) {
            cronSchedule = line.replace('-- CRON:', '').trim();
        } else if (line.startsWith('-- EMAIL:')) {
            email = line.replace('-- EMAIL:', '').trim();
        } else {
            query += line + '\n';
        }
    });

    return { cronSchedule, email, query };
}

async function executeSqlQuery(query) {
    const credentials = parseCredentialsFile();
    try {
        // Database configuration
        const config = {
            user: credentials.db.username,
            password: credentials.db.password,
            server: credentials.db.server,
            database: credentials.db.database,
            trustServerCertificate: true
        };

        // Connect to your database
        await sql.connect(config);

        // Execute the query
        console.log('Executing query:', query);
        const result = await sql.query(query);
        return result.recordset;
    } catch (err) {
        console.error('SQL error:', err);
        throw err;
    } finally {
        await sql.close();
    }
}

function sendEmail(recipient, data) {
    const credentials = parseCredentialsFile();
    const transporter = nodemailer.createTransport({
        host: credentials.email.host, // Exchange Online SMTP server
        port: credentials.email.port, // SMTP port for TLS/StartTLS
        secure: false, // true for 465, false for other ports
        auth: {
            user: credentials.email.username,
            pass: credentials.email.password
        },
        tls: {
            ciphers: 'SSLv3'
        }
    });

    const mailOptions = {
        from: 'support@prettyneat.io',
        to: recipient,
        subject: 'SQL Query Results',
        text: 'Here are the results of your SQL query:\n' + JSON.stringify(data, null, 2)
    };

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log('Email error:', error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}


function runSchedule(sqlFilePath = './sql/first.sql') {
    let { cronSchedule, email, query } = parseSqlFile(sqlFilePath);

    //cronSchedule = getCronCommandForNextMinute();
    cron.schedule(cronSchedule, async () => {
        const params = { /* Set your parameters here */ };
        const result = await executeSqlQuery(query, params);
        console.log('Cron results:', result);

        sendEmail(email, result);
    });
}

// Function to watch a folder for new files
function watchFolder(folderPath) {
    const files = new Set(fs.readdirSync(folderPath));

    fs.watch(folderPath, (eventType, filename) => {
        if (eventType === 'rename') {
            const filePath = path.join(folderPath, filename);
            if (fs.existsSync(filePath) && !files.has(filename)) {
                console.log(`New file detected: ${filename}`)
                files.add(filename);
                runSchedule(folderPath + filename);
            }
        }
    });

    console.log(`Watching for file changes in ${folderPath}`);
}

//FOR DEBUGGING PURPOSES ONLY
function getCronCommandForNextMinute() {
    const now = new Date();

    const minutes = now.getMinutes() + 1;
    const hours = now.getHours();

    // Constructing the cron command
    const cronCommand = `${minutes} ${hours} * * *`;
    console.log('Cron schedule: ' + cronCommand);
    return cronCommand;
}

// Main function
async function main() {
    const folderPath = './sql/';
    const files = new Set(fs.readdirSync(folderPath));
    files.forEach(file => {
        if (file.endsWith('.sql')) {
            runSchedule(folderPath + file);
        }
    }); 
    watchFolder(folderPath)
}

main();

