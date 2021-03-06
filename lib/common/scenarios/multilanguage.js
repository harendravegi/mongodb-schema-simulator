var microtime = require('microtime')
  , f = require('util').format
  , fs = require('fs');
// Contains all the scenarios
var scenarios = [];

// Export the scenarios
module.exports = { scenarios: scenarios };

/*
 * Simple add a local to a category and update all products containing that local
 */
scenarios.push({
    name: 'multilanguage_add_new_local'
  , title: 'simulate adding a new local to an existing product category'
  , description: 'simulate adding a new local to an existing product category'
  , params: {
    // Number of metadata objects
    numberOfProducts: {
        name: 'the number of preloaded products'
      , type: 'number'
      , default: 1000
    }
    // Size of each metadata object in bytes
    , numberOfCategories: {
        name: 'the number of preloaded categories'
      , type: 'number'
      , default: 256
    }
  }
  , create: function(services, scenario, schema) {
    var MongoClient = require('mongodb').MongoClient
      , Binary = require('mongodb').Binary;

    // Default collection names
    var collections = {
        products: 'products'
      , categories: 'categories'
    }

    // Get all the schemas
    var Product = require('../schemas/multilanguage/product')
      , ReadPreference = require('mongodb').ReadPreference
      , Category = require('../schemas/multilanguage/category');

    // Db instance
    var db = null;

    // Contains the cart scenario
    var MultilanguageAddLocalScenario = function() {}

    // Set up all indexes
    var createIndexes = function(db, collectionNames, callback) {
      // Collections
      var collections = {
          products: db.collection(collectionNames.products || 'products')
        , categories: db.collection(collectionNames.categories || 'categories')
      }

      // Create any indexes
      Product.createOptimalIndexes(collections, function(err) {
        if(err) return callback(err);

        Category.createOptimalIndexes(collections, function(err) {
          if(err) return callback(err);
          callback();
        });
      });
    }

    var setupCategories = function(db, collectionNames, categories, callback) {
      var Category = require('../schemas/multilanguage/category')
        , ObjectId = require('mongodb').ObjectId;
      var left = categories.length;

      // Collections
      var collections = {
          products: db.collection(collectionNames.products || 'products')
        , categories: db.collection(collectionNames.categories || 'categories')
      }

      // Iterate over all the categories
      for(var i = 0; i < categories.length; i++) {
        var category = new Category(collections, categories[i][0], categories[i][1]);
        category.create(function() {
          left = left - 1;

          if(left == 0) callback();
        });
      }
    }

    var setupProducts = function(db, collectionNames, products, callback) {
      var Product = require('../schemas/multilanguage/product')
        , ObjectId = require('mongodb').ObjectId;
      var left = products.length;

      // Collections
      var collections = {
          products: db.collection(collectionNames.products || 'products')
        , categories: db.collection(collectionNames.categories || 'categories')
      }


      // Iterate over all the categories
      for(var i = 0; i < products.length; i++) {
        var product = new Product(collections, products[i][0], products[i][1], products[i][2], products[i][3], products[i][4]);
        product.create(function() {
          left = left - 1;

          if(left == 0) {
            callback();
          }
        });
      }
    }

    /*
     * Runs only once when starting up on the monitor
     */
    MultilanguageAddLocalScenario.prototype.globalSetup = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};

      // Self reference
      var self = this;

      // Unpack the parameters
      var numberOfProducts = schema.params.numberOfProducts;
      var numberOfCategories = schema.params.numberOfCategories;
      var collections = schema.collections ? schema.collections : collections;
      var errors = [];

      // console.log('[SCENARIO-MultilanguageAddLocalScenario] globalSetup');
      // Connect to the database
      MongoClient.connect(schema.url, function(err, db) {
        if(err) return callback(err);

        // Get the specific schema db if specified
        if(schema.db) db = db.db(schema.db);

        // Collections
        var cols = {
            products: db.collection(collections.products || 'products')
          , categories: db.collection(collections.categories || 'categories')
        }

        // CreateIndex for all items
        createIndexes(db, collections, function(err) {
          if(err) return callback(err);
          // Read in the word list
          var wordList = fs.readFileSync(__dirname + "/files/english_word_list.txt", 'utf8')
          var words = wordList.split('\n')

          // All the categories
          var cats = [];
          // Create a bunch of categories
          for(var i = 0; i < numberOfCategories; i++) {
            cats.push([i, {'en-us': words[i], 'de-de': words[i+1]}]);
          }

          // Setup the categories
          setupCategories(db, collections, cats, function() {

            // Read all the categories from the database
            cols['categories'].find().toArray(function(err, objects) {
              if(err) return callback(err);

              // Products to insert
              var products = [];
              // Create a bunch of products
              for(var i = 0; i < numberOfProducts; i++) {
                products.push([i, words[i], Math.round(100000 * Math.random()), 'usd', [objects[i % numberOfCategories]]]);
              }

              // Setup the products
              setupProducts(db, collections, products, callback);
            });
          });
        });
      });
    }

    /*
     * Runs only once when starting up on the monitor
     */
    MultilanguageAddLocalScenario.prototype.globalTeardown = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};
      callback();
    }

    /*
     * Runs for each executing process
     */
    MultilanguageAddLocalScenario.prototype.setup = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};
      var self = this;

      // Connect to the database
      MongoClient.connect(schema.url, function(err, instance) {
        db = schema.db ? instance.db(schema.db) : instance;

        // Read in the word list
        var wordList = fs.readFileSync(__dirname + "/files/english_word_list.txt", 'utf8')
        self.words = wordList.split('\n')

        callback(err);
      });
    }

    /*
     * Runs for each executing process
     */
    MultilanguageAddLocalScenario.prototype.teardown = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};
      if(db) db.close();
      callback();
    }

    /*
     * The actual scenario running
     */
    MultilanguageAddLocalScenario.prototype.execute = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};

      // Unpack the parameters
      var numberOfProducts = schema.params.numberOfProducts;
      var numberOfCategories = schema.params.numberOfCategories;
      var collections = schema.collections ? schema.collections : collections;

      // Get write concern
      var writeConcern = schema.writeConcern || {};
      
      // Metadata read preference
      var options = writeConcern.categories || {w:1, wtimeout: 10000}

      // Pick a random category and add a new type
      var id = Math.round(numberOfCategories * Math.random()) % numberOfCategories;

      // Collections
      var cols = {
          products: db.collection(collections.products || 'products')
        , categories: db.collection(collections.categories || 'categories')
      }

      // Create random
      var localNumber = Math.round(this.words.length * Math.random()) % this.words.length;
      var wordNumber = Math.round(this.words.length * Math.random()) % this.words.length;

      // Cache insert start time
      var startTime = microtime.now();
      // Add a spanish category
      var cat = new Category(cols, id);
      cat.addLocal(this.words[localNumber].trim(), this.words[wordNumber].trim(), options, function(err) {
        if(err) return callback(err);

        // Get end time of the cart
        var endTime = microtime.now();
        services.log('second', 'multilanguage_add_new_local', {
            start: startTime
          , end: endTime
          , time: endTime - startTime
        });

        callback();
      });
    }

    return new MultilanguageAddLocalScenario(services, scenario, schema);
  }
});

/*
 * Simple remove a local from a category and ensure all products have it removed
 */
scenarios.push({
    name: 'multilanguage_remove_local'
  , title: 'simulate removing a local from an existing product category'
  , description: 'simulate removing a local from an existing product category'
  , params: {
    // Number of metadata objects
    numberOfProducts: {
        name: 'the number of preloaded products'
      , type: 'number'
      , default: 1000
    }
    // Size of each metadata object in bytes
    , numberOfCategories: {
        name: 'the number of preloaded categories'
      , type: 'number'
      , default: 256
    }
  }
  , create: function(services, scenario, schema) {
    var MongoClient = require('mongodb').MongoClient
      , ReadPreference = require('mongodb').ReadPreference
      , Binary = require('mongodb').Binary;

    // Default collection names
    var collections = {
        products: 'products'
      , categories: 'categories'
    }

    // Get all the schemas
    var Product = require('../schemas/multilanguage/product')
      , Category = require('../schemas/multilanguage/category');

    // Db instance
    var db = null;

    // Contains the cart scenario
    var MultilanguageRemoveLocalScenario = function() {}

    // Set up all indexes
    var createIndexes = function(db, collectionNames, callback) {
      // Collections
      var cols = {
          products: db.collection(collectionNames.products || 'products')
        , categories: db.collection(collectionNames.categories || 'categories')
      }

      // Create any indexes
      Product.createOptimalIndexes(cols, function(err) {
        if(err) return callback(err);

        Category.createOptimalIndexes(cols, function(err) {
          if(err) return callback(err);
          callback();
        });
      });
    }

    var setupCategories = function(db, collectionNames, categories, callback) {
      var Category = require('../schemas/multilanguage/category')
        , ObjectId = require('mongodb').ObjectId;
      var left = categories.length;

      // Collections
      var cols = {
          products: db.collection(collectionNames.products || 'products')
        , categories: db.collection(collectionNames.categories || 'categories')
      }

      // Iterate over all the categories
      for(var i = 0; i < categories.length; i++) {
        var category = new Category(cols, categories[i][0], categories[i][1]);
        category.create(function() {
          left = left - 1;

          if(left == 0) callback();
        });
      }
    }

    var setupProducts = function(db, collectionNames, products, callback) {
      var Product = require('../schemas/multilanguage/product')
        , ObjectId = require('mongodb').ObjectId;
      var left = products.length;

      // Collections
      var cols = {
          products: db.collection(collectionNames.products || 'products')
        , categories: db.collection(collectionNames.categories || 'categories')
      }

      // Iterate over all the categories
      for(var i = 0; i < products.length; i++) {
        var product = new Product(cols, products[i][0], products[i][1], products[i][2], products[i][3], products[i][4]);
        product.create(function() {
          left = left - 1;

          if(left == 0) {
            callback();
          }
        });
      }
    }

    /*
     * Runs only once when starting up on the monitor
     */
    MultilanguageRemoveLocalScenario.prototype.globalSetup = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};

      // Self reference
      var self = this;

      // Unpack the parameters
      var numberOfProducts = schema.params.numberOfProducts;
      var numberOfCategories = schema.params.numberOfCategories;
      var collections = schema.collections ? schema.collections : collections;
      var errors = [];

      // console.log('[SCENARIO-MultilanguageRemoveLocalScenario] globalSetup');
      // Connect to the database
      MongoClient.connect(schema.url, function(err, db) {
        if(err) return callback(err);

        // Get the specific schema db if specified
        if(schema.db) db = db.db(schema.db);

        // Collections
        var cols = {
            products: db.collection(collections.products || 'products')
          , categories: db.collection(collections.categories || 'categories')
        }

        // CreateIndex for all items
        createIndexes(db, collections, function(err) {
          if(err) return callback(err);
          // Read in the word list
          var wordList = fs.readFileSync(__dirname + "/files/english_word_list.txt", 'utf8')
          var words = wordList.split('\n')

          // All the categories
          var cats = [];
          // Create a bunch of categories
          for(var i = 0; i < numberOfCategories; i++) {
            cats.push([i, {'en-us': words[i], 'de-de': words[i+1]}]);
          }

          // Setup the categories
          setupCategories(db, collections, cats, function() {

            // Read all the categories from the database
            cols['categories'].find().toArray(function(err, objects) {
              if(err) return callback(err);

              // Products to insert
              var products = [];
              // Create a bunch of products
              for(var i = 0; i < numberOfProducts; i++) {
                products.push([i, words[i], Math.round(100000 * Math.random()), 'usd', [objects[i % numberOfCategories]]]);
              }

              // Setup the products
              setupProducts(db, collections, products, callback);
            });
          });
        });
      });
    }

    /*
     * Runs only once when starting up on the monitor
     */
    MultilanguageRemoveLocalScenario.prototype.globalTeardown = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};
      callback();
    }

    /*
     * Runs for each executing process
     */
    MultilanguageRemoveLocalScenario.prototype.setup = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};
      var self = this;
      // Connect to the database
      MongoClient.connect(schema.url, function(err, instance) {
        db = schema.db ? instance.db(schema.db) : instance;

        // Collections
        var cols = {
            products: db.collection(collections.products || 'products')
          , categories: db.collection(collections.categories || 'categories')
        }

        // Read all the categories from the database
        cols['categories'].find().toArray(function(err, objects) {
          if(err) return callback(err);
          self.objects = objects;
          callback(err);
        });
      });
    }

    /*
     * Runs for each executing process
     */
    MultilanguageRemoveLocalScenario.prototype.teardown = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};
      if(db) db.close();
      callback();
    }

    /*
     * The actual scenario running
     */
    MultilanguageRemoveLocalScenario.prototype.execute = function(options, callback) {
      if(typeof options == 'function') callback = options, options = {};

      // Unpack the parameters
      var numberOfProducts = schema.params.numberOfProducts;
      var numberOfCategories = schema.params.numberOfCategories;
      var collections = schema.collections ? schema.collections : collections;

      // Get write concern
      var writeConcern = schema.writeConcern || {};
      
      // Metadata read preference
      var options = writeConcern.categories || {w:1, wtimeout: 10000}

      // Pick a random category and add a new type
      var id = Math.round(numberOfCategories * Math.random()) % numberOfCategories;

      // Collections
      var cols = {
          products: db.collection(collections.products || 'products')
        , categories: db.collection(collections.categories || 'categories')
      }

      // Cache insert start time
      var startTime = microtime.now();
      // Add a spanish category
      var cat = new Category(cols, id);
      cat.removeLocal('de-de', options, function(err) {
        if(err) return callback(err);

        // Get end time of the cart
        var endTime = microtime.now();
        services.log('second', 'multilanguage_remove_local', {
            start: startTime
          , end: endTime
          , time: endTime - startTime
        });

        callback();
      });
    }

    return new MultilanguageRemoveLocalScenario(services, scenario, schema);
  }
});
