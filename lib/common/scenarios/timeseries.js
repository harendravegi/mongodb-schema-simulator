var microtime = require('microtime')
  , f = require('util').format;
// Contains all the scenarios
var scenarios = [];

// Export the scenarios
module.exports = { scenarios: scenarios };

/*
 * Simple fixed items in cart simulation
 */
scenarios.push({
    name: 'timeseries'
  , title: 'write to a timeseries'
  , description: 'write to a timeseries'
  , params: {
    // Number of items in the cart
    preAllocate: {
        name: 'pre allocate the values'
      , type: 'boolean'
      , default: true
    }
    // numberOfTimeSeries
    , numberOfTimeSeries: {
        name: 'number of time series to pre-allocate'
      , type: 'number'
      , default: 1000
    }
    // Number rows in each theater
    , resolution: {
        name: 'resolution of our time series'
      , type: 'string'
      , default: 'minute'
    }
  }
  , create: function(services, scenario, schema) {
    var MongoClient = require('mongodb').MongoClient;

    // Default collection names
    var collections = {
      timeseries: 'timeseries'
    }

    // Get all the schemas
    var TimeSeries = require('../schemas/time_series/timeseries')
      , ObjectId = require('mongodb').ObjectId;

    // Db instance
    var db = null;

    // Contains the cart scenario
    var Scenario = function() {}

    // Set up all indexes
    var createIndexes = function(db, collectionNames, callback) {
      // Collections
      var collections = {
        timeseries: db.collection(collectionNames.timeseries || 'timeseries')
      }

      TimeSeries.createOptimalIndexes(collections, function(err) {
        if(err) return callback(err);
        callback();
      });
    }

    /*
     * Runs only once when starting up on the monitor
     */
    Scenario.prototype.globalSetup = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};
      callback();
    }

    /*
     * Runs only once when starting up on the monitor
     */
    Scenario.prototype.globalTeardown = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};
      callback();
    }

    /*
     * Runs for each executing process
     */
    Scenario.prototype.setup = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};

      // Unpack the parameters
      var self = this;
      var preAllocate = schema.params.preAllocate;
      var resolution = schema.params.resolution;
      var numberOfTimeSeries = schema.params.numberOfTimeSeries;
      var collectionNames = schema.collections ? schema.collections : collections;

      // Connect to the database
      MongoClient.connect(schema.url, function(err, instance) {
        if(err) return callback(err);
        db = schema.db ? instance.db(schema.db) : instance;

        // Collections
        var collections = {
          timeseries: db.collection(collectionNames.timeseries || 'timeseries')
        }

        // Load all the time series
        var loadTimeSeries = function(callback) {
          collections.timeseries.find().toArray(function(err, timeseries) {
            self.timeseries = timeseries;
            callback();
          });
        }

        // Set the start time
        self.startTime = new Date();
        self.startTime.setMilliseconds(0);
        self.startTime.setSeconds(0);
        self.startTime.setMinutes(0);
        self.startTime.setHours(0);

        // Set the current time
        self.currentTime = new Date();
        self.currentTime.setTime(self.startTime.getTime());
        // Current index for id
        self.current = 0;

        // Get current stamp
        var currentStamp = new Date();
        currentStamp.setTime(self.startTime.getTime());

        // No pre allocate return
        if(!preAllocate) return callback();
        // PreAllocate time series
        var left = numberOfTimeSeries;

        // Finish
        for(var i = 0; i < numberOfTimeSeries; i++) {
          var id = f('%s.%s', process.pid, i);

          // If we have a minute by minute resolution
          if(resolution == 'minute') {
            // Pre-save a timeseries allocation
            TimeSeries.preAllocateMinute(collections, id, f('device_%s', i), currentStamp, function() {
              left = left - 1;

              if(left == 0) loadTimeSeries(callback);
            });

            // Add a minute
            currentStamp.setMinutes(currentStamp.getMinutes() + 1);
          } else if(resolution == 'hour') {
            // Pre-save a timeseries allocation
            TimeSeries.preAllocateHour(collections, id, f('device_%s', i), currentStamp, function() {
              left = left - 1;

              if(left == 0) {
                loadTimeSeries(callback);
              }
            });

            // Add a minute
            currentStamp.setHours(currentStamp.getHours() + 1);
          } else if(resolution == 'day') {
            // Pre-save a timeseries allocation
            TimeSeries.preAllocateDay(collections, id, f('device_%s', i), currentStamp, function() {
              left = left - 1;

              if(left == 0) loadTimeSeries(callback);
            });

            // Add a minute
            currentStamp.setHours(currentStamp.getHours() + 24);
          }
        }
      });
    }

    /*
     * Runs for each executing process
     */
    Scenario.prototype.teardown = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};
      if(db) db.close();
      callback();
    }

    /*
     * The actual scenario running
     */
    Scenario.prototype.execute = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};

      // Unpack the parameters
      var self = this;
      var preAllocate = schema.params.preAllocate;
      var resolution = schema.params.resolution;
      var numberOfTimeSeries = schema.params.numberOfTimeSeries;
      var collectionNames = schema.collections ? schema.collections : collections;
      // Get write concern
      var writeConcern = schema.writeConcern || {};
      
      // Metadata read preference
      var options = writeConcern.carts || {w:1, wtimeout: 10000}

      // Collections
      var collections = {
        timeseries: db.collection(collectionNames.timeseries || 'timeseries')
      }

      // Get values
      var startTime = this.startTime;
      var currentTime = this.currentTime;
      var current = this.current;

      // If we have performed pre-allocation
      if(preAllocate) {
        // Pick a random time series
        var index = Math.round(this.timeseries.length * Math.random()) % this.timeseries.length;
        var timeseries = this.timeseries[index];

        // Inc a value in this time series
        var t = new Date();
        t.setTime(timeseries.timestamp.getTime());
        // Set a random second
        var second = Math.round(60 * Math.random()) % 60;
        // Increment
        t.setSeconds(t.getSeconds() + second);
        // Start time
        var startTime = microtime.now();
        // Create time series and increment
        var timeserie = new TimeSeries(collections, timeseries._id, timeseries.tag, timeseries.series, timeseries.timestamp, resolution);
        timeserie.inc(t, 1, options, function() {
          // Operation end time
          var endTime = microtime.now();

          // Log the time taken for the operation
          services.log('second', 'timeseries', {
              start: startTime
            , end: endTime
            , time: endTime - startTime
          });

          callback();
        });
      } else {
        // Pick a random time series
        var index = Math.round(numberOfTimeSeries * Math.random()) % numberOfTimeSeries;
        // Create a index
        var timestamp = new Date();
        timestamp.setTime(startTime.getTime());
        // Number of minutes
        var minutes = index;
        if(resolution == 'hour') minutes = minutes * 60;
        if(resolution == 'day') minutes = minutes * 60 * 24;
        // Set the time
        timestamp.setMinutes(timestamp.getMinutes() + minutes);
        // Id
        var id = f('%s.%s', process.pid, index);

        // Inc a value in this time series
        var t = new Date();
        t.setTime(timestamp.getTime());
        // Set a random second
        var second = Math.round(60 * Math.random()) % 60;
        // Increment
        t.setSeconds(t.getSeconds() + second);

        // Start time
        var startTime = microtime.now();
        // Create a timestamp class
        var timeseries = new TimeSeries(collections, index, f('device.%s', index), {}, timestamp, resolution);
        timeseries.inc(t, 1, options, function() {
          // Operation end time
          var endTime = microtime.now();

          // Log the time taken for the operation
          services.log('second', 'timeseries', {
              start: startTime
            , end: endTime
            , time: endTime - startTime
          });

          callback();
        });
      }
    }

    return new Scenario(services, scenario, schema);
  }
})
