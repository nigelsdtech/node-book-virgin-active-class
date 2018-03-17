var cfg   = require('config');
var defer = require('config/defer').deferConfig;

module.exports = {

  appName: 'book-virgin-active-class',

  auth: {
    credentialsDir:   process.env.HOME+'/.credentials',
    clientSecretFile: defer( function (cfg) { return cfg.auth.credentialsDir+'/client_secret.json' } ),
    tokenFileDir:     defer( function (cfg) { return cfg.auth.credentialsDir } ),
    tokenFile:        defer( function (cfg) { return 'access_token_'+cfg.appName+ '-' + process.env.NODE_ENV+'.json' } ),
    googleScopes:     ['https://mail.google.com']
  },

  log: {
    appName: defer(function (cfg) { return cfg.appName } ),
    level:   'INFO',
    log4jsConfigs: {
      appenders: [
        {
          type:       'file',
          filename:   defer(function (cfg) {
            var fn = cfg.log.logDir + '/' + cfg.appName
            if (process.env.NODE_ENV) { fn += '-' + process.env.NODE_ENV }
            fn += '.log'
            return fn
          }),
          category:   defer(function (cfg) { return cfg.log.appName }),
          reloadSecs: 60,
          maxLogSize: 1024000
        },
        {
          type: 'console'
        }
      ],
      replaceConsole: false
    },
    logDir: './logs'
  },

  // Gmail search string when searching for the email notification to trigger the booker
  gmailSearchCriteria: 'OVERRIDE_ME',
  // Label applied to the notification email once the script has finished running successfully
  processedLabelName:  'virgin-active-booker',

  // Virgin active login credentials
  va: {
    clubName: 'OVERRIDE_ME',
    username: 'OVERRIDE_ME',
    password: 'OVERRIDE_ME',
    classToBook: {
      name: "Name of a class as per the VA timetable",
      // Start date of the class in yyyy-mm-dd format. Can also be set to "one week later" for, one week from the current date
      date: "2018-02-08",
      time: "13:05" // Start time of the class in HH:MM format.
    }
  },

  reporter: {
    appName             : defer( function (cfg) {
      var subject = cfg.appName
      if (process.env.NODE_APP_INSTANCE) { subject += '-' + process.env.NODE_APP_INSTANCE }
      if (process.env.NODE_ENV)          { subject += '-' + process.env.NODE_ENV }
      return subject
    } ),
    appSpecificPassword : 'OVERRIDE_ME',
    emailsFrom          : 'OVERRIDE_ME',
    name                : 'Reporter (Personal)',
    notificationTo      : 'OVERRIDE_ME',
    user                : 'OVERRIDE_ME',
    clientSecretFile    : '',
    googleScopes        : '',
    tokenDir            : '',
    tokenFile           : ''
  }

}
