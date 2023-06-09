import config from '../config'
import logger from '../loaders/logger'

var mysql = require('mysql')

var dbpool = mysql.createPool({
    connectionLimit: 1,
    host: config.deliveryNodeDBHost,
    user: config.deliveryNodeDBUser,
    password: config.deliveryNodeDBPass,
    port: config.deliveryNodeDBPort,
})

var pool = mysql.createPool({
    connectionLimit: 10,
    host: config.deliveryNodeDBHost,
    user: config.deliveryNodeDBUser,
    password: config.deliveryNodeDBPass,
    database: config.deliveryNodeDBName,
    port: config.deliveryNodeDBPort,
})

module.exports = {
    pool,
    dbquery: function () {
        var sql_args = []
        var args = []
        for (var i = 0; i < arguments.length; i++) {
            args.push(arguments[i])
        }

        var callback = args[args.length - 1] //last arg is callback
        dbpool.getConnection(function (err, connection) {
            if (err) {
                logger.error(err)
                return callback(err)
            }

            if (args.length > 2) {
                sql_args = args[1]
            }

            connection.query(args[0], sql_args, function (err, results) {
                connection.release() // always put connection back in pool after last query

                if (err) {
                    logger.error(err)
                    return callback(err)
                }

                callback(null, results)
            })
        })
    },
    query: function () {
        var sql_args = []
        var args = []
        for (var i = 0; i < arguments.length; i++) {
            args.push(arguments[i])
        }

        var callback = args[args.length - 1] //last arg is callback
        pool.getConnection(function (err, connection) {
            if (err) {
                logger.error(err)
                return callback(err)
            }

            if (args.length > 2) {
                sql_args = args[1]
            }

            connection.query(args[0], sql_args, function (err, results) {
                connection.release() // always put connection back in pool after last query
                if (err) {
                    logger.error(err)
                    return callback(err)
                }
                callback(null, results)
            })
        })
    },
}
