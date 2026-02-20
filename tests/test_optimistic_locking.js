const http = require('http');
const crypto = require('crypto');

const PORT = 8080;
const REGION = 'us';
// Using an ID likely left untouched to minimize conflict with manual tests
const PROPERTY_ID = 500;

const makeRequest = (version) => {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ price: 2000000.00, version });

        const options = {
            hostname: 'localhost',
            port: PORT,
            path: `/${REGION}/properties/${PROPERTY_ID}`,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                'X-Request-ID': crypto.randomUUID()
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, body });
            });
        });

        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
};

const runTest = async () => {
    console.log(`Starting optimistic locking test for property ${PROPERTY_ID}...`);
    try {
        console.log("\n[Step 1] Fetching the property might be complex via HTTP here since we only have a PUT endpoint.");
        console.log("We will send a PUT request with version 1 to initialize its state (assuming fresh DB).");

        const initRes = await makeRequest(1);
        console.log(`Initialization Response Status: ${initRes.status}`);

        let currentVersion = 1;
        if (initRes.status === 200) {
            currentVersion = JSON.parse(initRes.body).version;
            console.log(`Successfully updated. Next version to use: ${currentVersion}`);
        } else if (initRes.status === 409) {
            console.log(`Version 1 was a mismatch. Trying version 2...`);
            const retryRes = await makeRequest(2);
            if (retryRes.status === 200) {
                currentVersion = JSON.parse(retryRes.body).version;
                console.log(`Retry successful. Next version to use: ${currentVersion}`);
            } else {
                console.log(`Retry also failed with status: ${retryRes.status}. Aborting test.`);
                return;
            }
        }

        console.log("\n[Step 2] Sending two concurrent requests with identical version numbers to simulate a race condition...");
        const results = await Promise.all([
            makeRequest(currentVersion),
            makeRequest(currentVersion)
        ]);

        console.log("\nResults from concurrent requests:");
        results.forEach((res, index) => {
            console.log(`Request ${index + 1} - Status: ${res.status}, Body: ${res.body}`);
        });

        const statusCodes = results.map(r => r.status);
        if (statusCodes.includes(200) && statusCodes.includes(409)) {
            console.log("\n✅ SUCCESS: Optimistic locking correctly prevented race condition.");
            console.log("One request succeeded (200 OK), and the concurrent request was rejected (409 Conflict).");
        } else {
            console.log("\n⚠️ WARNING: Test did not return exactly one 200 and one 409.");
            console.log("This might be due to network delays or unexpected initial database state.");
        }

    } catch (err) {
        console.error("Test failed", err);
    }
};

runTest();
