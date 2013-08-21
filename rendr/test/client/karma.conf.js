// Karma configuration
// Generated on Thu Aug 15 2013 10:51:04 GMT+1000 (EST)

module.exports = function(config) {
  config.set({

    // base path, that will be used to resolve files and exclude
    basePath: '../../../rendr/',


    // frameworks to use
    frameworks: ['jasmine'],


    // list of files / patterns to load in the browser
    files: [
      'static/js/jquery.js',
      'test/client/vendor/jasmine-1.3.1/jasmine-html.js',
      'static/js/angular.js',
      'test/client/vendor/angularjs-1.1.5/angular-mocks.js',
      'static/js/ace/*.js',
      'static/js/jquery.debounce.js',
      'static/js/jquery.farbtastic.js',
      'static/js/jquery.foundation.buttons.js',
      'static/js/jquery.foundation.forms.js',
      'static/js/jquery.foundation.reveal.js',
      'static/js/jquery.foundation.tabs.js',
      'static/js/jquery.hoverIntent.js',
      'static/js/jquery.splitter.js',
      'static/js/jquery.textchange.js',
      'static/js/jquery.tipsy.js',
      'static/js/mustache.js',
      'static/js/rendr.it.js',
      'test/client/unit/*.spec.js'
    ],


    // list of files to exclude
    exclude: [
      
    ],


    // test results reporter to use
    // possible values: 'dots', 'progress', 'junit', 'growl', 'coverage'
    reporters: ['progress'],


    // web server port
    port: 9876,


    // enable / disable colors in the output (reporters and logs)
    colors: true,


    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,


    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,


    // Start these browsers, currently available:
    // - Chrome
    // - ChromeCanary
    // - Firefox
    // - Opera
    // - Safari (only Mac)
    // - PhantomJS
    // - IE (only Windows)
    browsers: ['Chrome'],


    // If browser does not capture in given timeout [ms], kill it
    captureTimeout: 60000,


    // Continuous Integration mode
    // if true, it capture browsers, run tests and exit
    singleRun: false
  });
};
