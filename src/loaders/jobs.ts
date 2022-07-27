// Do Scheduling
// https://github.com/node-schedule/node-schedule
// *    *    *    *    *    *
// ┬    ┬    ┬    ┬    ┬    ┬
// │    │    │    │    │    │
// │    │    │    │    │    └ day of week (0 - 7) (0 or 7 is Sun)
// │    │    │    │    └───── month (1 - 12)
// │    │    │    └────────── day of month (1 - 31)
// │    │    └─────────────── hour (0 - 23)
// │    └──────────────────── minute (0 - 59)
// └───────────────────────── second (0 - 59, OPTIONAL)
// Execute a cron job every 5 Minutes = */5 * * * *
// Starts from seconds = * * * * * *
import {
    Container
} from 'typedi';
import schedule from 'node-schedule';
import MessagingService from '../services/pushMessageService';

import {client} from './redis';

export default ({
    logger
}) => {


    // 1. MESSAGING SERVICE
    // Schedule payloads data population for unprocessed payloads
    logger.info('-- 🛵 Scheduling Messaging Processing [Every 1 Min]');
    schedule.scheduleJob('*/1 * * * *', async function() {
        const messaging = Container.get(MessagingService);
        const taskName = 'Messages Processed';
        try {
             await messaging.batchProcessMessages();
             logger.info(`🐣 Cron Task Completed -- ${taskName}`);
        } catch (err) {
            logger.error(`❌ Cron Task Failed -- ${taskName}`);
            logger.error(`Error Object: %o`, err);
        }
    });


    // 2. DELETE STALE MESSAGES
    //This cron job deletes all the messages which could not be delivered after the max 
    //attempts threshold hits, only after X days.
    logger.info('-- 🛵 Scheduling DELETE STALE MESSAGES Job [Every 12 Hours]');
    schedule.scheduleJob('* */12 * * *', async function() {
        const messaging = Container.get(MessagingService);
        const taskName = 'Delete Stale Messages';
        try {
            await messaging.deleteStaleMessages();
            logger.info(`🐣 Cron Task Completed -- ${taskName}`);
        } catch (err) {
            logger.error(`❌ Cron Task Failed -- ${taskName}`);
            logger.error(`Error Object: %o`, err);
        }
    });

    // 1. SERVICE UPTIME
    // This job updates redis its uptime
    logger.info('-- 🛵 Scheduling SERVICE UPTIME [Every 10 Seconds]');
    schedule.scheduleJob('*/10 * * * * *', async function() {
        const taskName = 'SERVICE UPTIME';
        try {

            logger.debug(process.env.DELIVERY_NODES_NET)
            await client.set('connection', '-- 🛵 Redis connection successful');
            logger.info(await client.get('connection'))

            logger.debug(`🐣 Cron Task Completed -- ${taskName}`);
        } catch (err) {
            logger.error(`❌ Cron Task Failed -- ${taskName}`);
            logger.error(`Error Object: %o`, err);
        }
    });

};