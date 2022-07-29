import {
    Container
} from 'typedi';
const io = require("socket.io-client");
import feedProcessorService from '../services/feedProcessorService';
import config from '../config';
import logger from '../loaders/logger';
import {
    client
} from '../loaders/redis';

var artwork = require('../helpers/artwork');

const LIVE_FEED_EVENT = "liveFeeds";
const HISTORICAL_FEED_EVENT = "historicalFeeds";
const UNPROCESSED_HISTORICAL_FEEDS_REDIS_KEY = "unprocessedHistoricalFeeds";

export default async () => {

    const RECONNECTION_DELAY_MAX = 10000;

    // More Details: https://socket.io/docs/v4/client-options/#reconnectiondelay
    const socket = io.connect(config.PUSH_NODE_WEBSOCKET_URL, {
        reconnectionDelayMax: RECONNECTION_DELAY_MAX,
        reconnectionDelay: 5000,
        query: {
            "isDeliveryNode": "true"
        }
    });

    socket.on("connect", () => {
        logger.info(artwork.getPushNodeConnectionArtWork())
    });

    socket.on("connect_error", () => {
        logger.error("Unable to connect to the push node websocket!! Will reconnect after with in next %o seconds !!! ", RECONNECTION_DELAY_MAX)
    });

    socket.on(LIVE_FEED_EVENT, (feed) => {
        feedProcessor.processFeed(feed);
    });

    socket.on('disconnect', function() {
        logger.error("!!!! Push node socket connection dropped. !!!!")
    })

    // Below code is to handle delivery node down time

    var fetchHistoryFrom = global.PREVIOUS_INSTANCE_LATEST_UPTIME;

    // If previous instance uptime is not found (which is rare) fetch last one hour feeds.
    if (!fetchHistoryFrom) {
        var date = new Date();
        date.getHours() - 1;
        fetchHistoryFrom = date.getTime().toString();
    }
    const fetchHistoryUntil = Date.now().toString();

    var ranges = await client.get(UNPROCESSED_HISTORICAL_FEEDS_REDIS_KEY)
    ranges = (ranges == null) ? [] :  JSON.parse(ranges);

    ranges.push({
        "startTime": global.PREVIOUS_INSTANCE_LATEST_UPTIME,
        "endTime": fetchHistoryUntil
    });

    await client.set(UNPROCESSED_HISTORICAL_FEEDS_REDIS_KEY, JSON.stringify(ranges));
    ranges = JSON.parse(await client.get(UNPROCESSED_HISTORICAL_FEEDS_REDIS_KEY));

    const feedProcessor = Container.get(feedProcessorService);

    const FEED_REQUEST_PAGE_SIZE = 50;

    logger.info("-- 🛵 Total historical ranges found :: %o", ranges.length)

    var feedsRequest = {
        "startTime": ranges[0].startTime,
        "endTime": ranges[0].endTime,
        "page": 1,
        "pageSize": FEED_REQUEST_PAGE_SIZE
    }

    socket.emit(HISTORICAL_FEED_EVENT, feedsRequest);

    // This is to handle scenarios like delivery node down time etc
    logger.info("-- 🛵 Initiating history feed fetcher with request body :: %o, requesting feeds between :: %o and :: %o, page :: %o and pagenumber :: %o.", JSON.stringify(feedsRequest), new Date(Number(feedsRequest.startTime)), new Date(Number(feedsRequest.endTime)), feedsRequest.page, feedsRequest.pageSize)

    var feedsPerRangeCount = 0
    var totalFeedsCount = 0
    socket.on(HISTORICAL_FEED_EVENT, async (data) => {
        
        totalFeedsCount += data['count']
        feedsPerRangeCount += data['count']

        if (data['count'] == 0) {
        
            // Reinitializing this counter
            feedsPerRangeCount = 0;

            logger.info("!!!! Done with one historical feed range !!!!")
            
            logger.info("Total :: %o historical feeds are received between :: %o and :: %o.", feedsPerRangeCount, new Date(Number(feedsRequest.startTime)), new Date(Number(feedsRequest.endTime)))

            ranges = JSON.parse(await client.get(UNPROCESSED_HISTORICAL_FEEDS_REDIS_KEY))
            
            // Remove this finished range and update the redis
            ranges = ranges.filter(each => {
                return each.startTime !== feedsRequest.startTime && each.endTime !== feedsRequest.endTime;
            });

            await client.set(UNPROCESSED_HISTORICAL_FEEDS_REDIS_KEY, JSON.stringify(ranges));

            if (ranges == 0) {
                logger.info("!!!! Done with all historical feed ranges Total feeds processed :: %o !!!!", totalFeedsCount)
            } else {

                feedsRequest = {
                    "startTime": ranges[0].startTime,
                    "endTime": ranges[0].endTime,
                    "page": 1,
                    "pageSize": FEED_REQUEST_PAGE_SIZE
                }

                logger.info("-- 🛵 Initiating history feed fetcher with request body :: %o, requesting feeds between :: %o and :: %o, page :: %o and pagenumber :: %o.", JSON.stringify(feedsRequest), new Date(Number(feedsRequest.startTime)), new Date(Number(feedsRequest.endTime)), feedsRequest.page, feedsRequest.pageSize)

                socket.emit(HISTORICAL_FEED_EVENT, feedsRequest);
            }
        } else {
            logger.info("Received :: %o feeds, current iteration page size :: %o and :: page number :: %o ", data['count'], feedsRequest.page, feedsRequest.pageSize)
            
            for (let i = 0; i < data['feeds'].length; i++) {
                feedProcessor.processFeed(data['feeds'][i])
            }

            feedsRequest.page += 1

            logger.info("-- 🛵 Initiating history feed fetcher with request body :: %o, requesting feeds between :: %o and :: %o, page :: %o and pagenumber :: %o.", JSON.stringify(feedsRequest), new Date(Number(feedsRequest.startTime)), new Date(Number(feedsRequest.endTime)), feedsRequest.page, feedsRequest.pageSize)

            socket.emit(HISTORICAL_FEED_EVENT, feedsRequest);
        }
    });
}