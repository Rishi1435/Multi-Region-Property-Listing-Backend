const { Kafka } = require('kafkajs');

const kafka = new Kafka({
    clientId: `backend-${process.env.REGION}`,
    brokers: [process.env.KAFKA_BROKER || 'kafka:29092'],
    retry: {
        initialRetryTime: 1000,
        retries: 10
    }
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: `properties-group-${process.env.REGION}` });

const admin = kafka.admin();

const initKafka = async () => {
    let retries = 5;
    while (retries > 0) {
        try {
            await admin.connect();
            await admin.createTopics({
                topics: [{ topic: 'property-updates', numPartitions: 1 }],
                waitForLeaders: true
            });
            await admin.disconnect();

            await producer.connect();
            await consumer.connect();
            console.log(`[Kafka] Connected successfully for region ${process.env.REGION}`);
            return { producer, consumer };
        } catch (error) {
            console.error(`[Kafka] Connection failed. Retries left: ${retries - 1}`, error.message);
            retries -= 1;
            await new Promise(res => setTimeout(res, 3000));
        }
    }
    throw new Error('Kafka connection failed');
};

module.exports = { kafka, producer, consumer, initKafka };
