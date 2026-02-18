const express = require('express');
const db = require('./db');
const { initKafka, producer, consumer } = require('./kafka');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8000;
const REGION = process.env.REGION;

app.get(`/:reqRegion/health`, (req, res) => {
    res.status(200).send('OK');
});

let lastKafkaMessageTimestamp = null;

app.put(`/:reqRegion/properties/:id`, async (req, res) => {
    const { id, reqRegion } = req.params;
    const { price, version } = req.body;
    const requestId = req.headers['x-request-id'];

    if (!requestId) {
        return res.status(400).json({ error: 'X-Request-ID header is required' });
    }

    try {
        await db.query('BEGIN');

        const idempotencyResult = await db.query(
            'SELECT key FROM idempotency_keys WHERE key = $1',
            [requestId]
        );

        if (idempotencyResult.rows.length > 0) {
            await db.query('ROLLBACK');
            return res.status(422).json({ error: 'Duplicate request detected' });
        }

        await db.query(
            'INSERT INTO idempotency_keys (key) VALUES ($1)',
            [requestId]
        );

        const updateResult = await db.query(
            `UPDATE properties 
             SET price = $1, version = version + 1, updated_at = NOW() 
             WHERE id = $2 AND version = $3 
             RETURNING id, price, bedrooms, bathrooms, region_origin, version, updated_at`,
            [price, id, version]
        );

        if (updateResult.rows.length === 0) {
            const checkExists = await db.query('SELECT id FROM properties WHERE id = $1', [id]);
            await db.query('ROLLBACK');
            if (checkExists.rows.length === 0) {
                return res.status(404).json({ error: 'Property not found' });
            }
            return res.status(409).json({ error: 'Conflict: version mismatch' });
        }

        const updatedProperty = updateResult.rows[0];

        await db.query('COMMIT');

        res.status(200).json({
            id: updatedProperty.id,
            price: Number(updatedProperty.price),
            version: updatedProperty.version,
            updated_at: updatedProperty.updated_at
        });

        const regionToPublish = REGION;
        const eventData = { ...updatedProperty, region_origin: regionToPublish };

        await producer.send({
            topic: 'property-updates',
            messages: [{ value: JSON.stringify(eventData) }]
        });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error('Error updating property', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get(`/:reqRegion/replication-lag`, (req, res) => {
    if (!lastKafkaMessageTimestamp) {
        return res.status(200).json({ lag_seconds: 0 });
    }
    const lagSeconds = (Date.now() - new Date(lastKafkaMessageTimestamp).getTime()) / 1000;
    res.status(200).json({ lag_seconds: Math.max(0, lagSeconds) });
});

const setupConsumer = async () => {
    await consumer.subscribe({ topic: 'property-updates', fromBeginning: true });
    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            try {
                const update = JSON.parse(message.value.toString());

                lastKafkaMessageTimestamp = update.updated_at;

                if (update.region_origin === REGION) {
                    return;
                }

                await db.query(`
                    INSERT INTO properties (id, price, bedrooms, bathrooms, region_origin, version, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (id) DO UPDATE 
                    SET price = EXCLUDED.price,
                        bedrooms = EXCLUDED.bedrooms,
                        bathrooms = EXCLUDED.bathrooms,
                        region_origin = EXCLUDED.region_origin,
                        version = EXCLUDED.version,
                        updated_at = EXCLUDED.updated_at
                    WHERE properties.version < EXCLUDED.version
                `, [update.id, update.price, update.bedrooms, update.bathrooms, update.region_origin, update.version, update.updated_at]);
            } catch (err) {
                console.error('Error processing Kafka message:', err);
            }
        }
    });
};

const startServer = async () => {
    try {
        await initKafka();
        await setupConsumer();
        app.listen(PORT, () => {
            console.log(`[Server] Region ${REGION} listening on port ${PORT}`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};

startServer();
